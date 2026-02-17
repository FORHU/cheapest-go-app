import { NextRequest, NextResponse } from 'next/server';
import { FlightEngine } from '@/lib/flights/core/flightEngine';
import { providerResolver } from '@/lib/flights/core/providerResolver';
import type { CabinClass } from '@/lib/flights/types';
import type { SearchFlightsParams } from '@/lib/flights/providers/flightProvider.interface';

export const dynamic = 'force-dynamic';

// ─── Engine Singleton ────────────────────────────────────────────────

let engine: FlightEngine | null = null;

function getEngine(): FlightEngine {
    if (!engine) {
        engine = new FlightEngine({ providerTimeoutMs: 15_000, maxResults: 50 });
        const providers = providerResolver.resolve();
        for (const p of providers) {
            engine.registerProvider(p);
        }
    }
    return engine;
}

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
        const { origin, destination, departureDate, returnDate, passengers, cabinClass, tripType } = body;

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

        // ─── Build Segments ──────────────────────────────────────

        const segments = [{ origin: org, destination: dst, departureDate }];
        if (trip === 'round-trip' && returnDate) {
            segments.push({ origin: dst, destination: org, departureDate: returnDate });
        }

        // ─── Build Search Params ─────────────────────────────────

        const params: SearchFlightsParams = {
            tripType: trip as SearchFlightsParams['tripType'],
            segments,
            passengers: { adults, children, infants },
            cabinClass: cabin,
            currency: body.currency || 'USD',
            maxOffers: Math.min(Number(body.maxOffers) || 30, 50),
            nonStopOnly: body.nonStopOnly === true,
            maxPrice: body.maxPrice ? Number(body.maxPrice) : undefined,
            preferredAirlines: Array.isArray(body.preferredAirlines) ? body.preferredAirlines : undefined,
        };

        // ─── Execute Search ──────────────────────────────────────

        const result = await getEngine().search(params);

        return NextResponse.json({
            success: true,
            data: {
                offers: result.offers,
                providers: result.providers,
                totalResults: result.totalResults,
                searchTimestamp: result.searchTimestamp,
                searchDurationMs: result.searchDurationMs,
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
