import { NextRequest, NextResponse } from 'next/server';
import type { FlightOffer, FlightSegmentDetail, CabinClass } from '@/lib/flights/types';
import { getAirlineName } from '@/lib/flights/types';

export const dynamic = 'force-dynamic';

// ─── Validation ──────────────────────────────────────────────────────

function badRequest(error: string) {
    return NextResponse.json({ success: false, error }, { status: 400 });
}

const VALID_CABIN: Set<string> = new Set(['economy', 'premium_economy', 'business', 'first']);
const VALID_TRIP: Set<string> = new Set(['one-way', 'round-trip', 'multi-city']);
const IATA_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── POST /api/flights/search ────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Support both flat format and segments format
        const hasSegments = Array.isArray(body.segments) && body.segments.length > 0;

        const origin = hasSegments ? body.segments[0].origin : body.origin;
        const destination = hasSegments ? body.segments[0].destination : body.destination;
        const departureDate = hasSegments ? body.segments[0].departureDate : body.departureDate;
        const returnDate = hasSegments && body.segments[1]
            ? body.segments[1].departureDate
            : body.returnDate;
        const { passengers, cabinClass, tripType, currency } = body;

        // Origin / Destination
        const org = String(origin ?? '').toUpperCase();
        const dst = String(destination ?? '').toUpperCase();
        if (!IATA_RE.test(org)) return badRequest('origin must be a 3-letter IATA code');
        if (!IATA_RE.test(dst)) return badRequest('destination must be a 3-letter IATA code');
        if (org === dst) return badRequest('origin and destination must differ');

        // Departure date
        if (!departureDate || !DATE_RE.test(departureDate)) {
            return badRequest('departureDate is required (YYYY-MM-DD)');
        }

        // Passengers
        const adults = Math.max(1, Number(passengers?.adults) || 1);
        const children = Math.max(0, Number(passengers?.children) || 0);
        const infants = Math.max(0, Number(passengers?.infants) || 0);
        if (infants > adults) return badRequest('infants cannot exceed adults');
        if (adults + children + infants > 9) return badRequest('maximum 9 passengers allowed');

        // Cabin class
        const cabin = (cabinClass ?? 'economy') as CabinClass;
        if (!VALID_CABIN.has(cabin)) return badRequest(`invalid cabinClass: ${cabin}`);

        // Trip type
        const trip = (tripType ?? (returnDate ? 'round-trip' : 'one-way')) as string;
        if (!VALID_TRIP.has(trip)) return badRequest(`invalid tripType: ${trip}`);

        // Return date validation for round-trip
        if (trip === 'round-trip') {
            if (!returnDate || !DATE_RE.test(returnDate)) {
                return badRequest('returnDate is required for round-trip (YYYY-MM-DD)');
            }
            if (returnDate < departureDate) {
                return badRequest('returnDate must be on or after departureDate');
            }
        }

        // ─── Call unified-flight-search Edge Function ─────────────

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase environment variables not set');
        }

        const edgeFnUrl = `${supabaseUrl}/functions/v1/unified-flight-search`;

        const edgeRes = await fetch(edgeFnUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
                origin: org,
                destination: dst,
                departureDate,
                returnDate: trip === 'round-trip' ? returnDate : undefined,
                adults,
                children: children || undefined,
                infants: infants || undefined,
                cabinClass: cabin,
                maxOffers: Math.min(Number(body.maxOffers) || 30, 50),
                nonStopOnly: body.nonStopOnly === true,
                currency: currency,
            }),
        });

        const edgeData = await edgeRes.json();

        if (!edgeData.success) {
            throw new Error(edgeData.error || 'Edge function search failed');
        }

        // ─── Transform NormalizedFlight[] → FlightOffer[] ─────────

        const offers: FlightOffer[] = (edgeData.flights ?? []).map(normalizedToFlightOffer);

        return NextResponse.json({
            success: true,
            data: {
                offers,
                providers: (edgeData.providers ?? []).map((p: any) => ({
                    name: p.name,
                    offerCount: p.count ?? 0,
                    searchId: p.name,
                    error: p.error,
                })),
                totalResults: edgeData.totalResults ?? offers.length,
                searchTimestamp: new Date().toISOString(),
                searchDurationMs: edgeData.searchDurationMs ?? 0,
            },
        });
    } catch (err) {
        console.error('[POST /api/flights/search]', err);
        const message = err instanceof Error ? err.message : 'Flight search failed';
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 },
        );
    }
}

// ─── Transform NormalizedFlight → FlightOffer ────────────────────────

function normalizedToFlightOffer(nf: any): FlightOffer {
    const segments: FlightSegmentDetail[] = (nf.segments ?? []).map((seg: any, idx: number) => ({
        segmentIndex: idx,
        airline: {
            code: seg.airline ?? '',
            name: seg.airlineName || getAirlineName(seg.airline ?? ''),
        },
        flightNumber: seg.flightNumber ?? '',
        departure: {
            airport: seg.origin ?? '',
            terminal: seg.terminal,
            time: seg.departureTime ?? '',
        },
        arrival: {
            airport: seg.destination ?? '',
            terminal: seg.arrivalTerminal,
            time: seg.arrivalTime ?? '',
        },
        duration: seg.duration ?? 0,
        stops: 0,
        aircraft: seg.aircraft,
        cabinClass: (seg.cabinClass ?? 'economy') as CabinClass,
    }));

    return {
        offerId: nf.id ?? '',
        provider: nf.provider ?? '',
        price: {
            total: nf.price ?? 0,
            base: nf.baseFare ?? 0,
            taxes: nf.taxes ?? 0,
            currency: nf.currency ?? 'USD',
            pricePerAdult: nf.pricePerAdult ?? nf.price ?? 0,
        },
        segments,
        totalDuration: nf.durationMinutes ?? 0,
        totalStops: nf.stops ?? 0,
        refundable: nf.refundable ?? false,
        baggage: nf.checkedBags != null ? {
            checkedBags: nf.checkedBags,
            weightPerBag: nf.weightPerBag,
            cabinBag: nf.cabinBag,
        } : undefined,
        seatsRemaining: nf.seatsRemaining,
        brandedFare: nf.brandName ? {
            brandName: nf.brandName,
            brandId: nf.brandId,
            fareType: nf.fareType,
        } : undefined,
        validatingAirline: nf.validatingAirline,
        lastTicketDate: nf.lastTicketDate,
        // Provider-specific IDs needed for booking
        resultIndex: nf.resultIndex,   // Original Amadeus offer ID (e.g. "1")
        traceId: nf.traceId,           // Mystifly fareSourceCode
        // CRITICAL-2 FIX: _rawOffer never sent to client — server rebuilds/revalidates during booking
    } as FlightOffer;
}
