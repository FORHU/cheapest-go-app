import { NextRequest, NextResponse } from 'next/server';
import type { CabinClass, FlightSearchParams } from '@/types/flights';
import { searchFlights } from '@/lib/server/flights/search-flights';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

function badRequest(error: string) {
    return NextResponse.json({ success: false, error }, { status: 400 });
}

const VALID_CABIN = new Set(['economy', 'premium_economy', 'business', 'first']);
const VALID_TRIP = new Set(['one-way', 'round-trip', 'multi-city']);
const IATA_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── POST /api/flights/search ─────────────────────────────────────────────────
//
// Calls the server-side searchFlights lib directly (Duffel + Mystifly in
// parallel with 15s timeouts) instead of going through the Edge Function chain.
// This avoids the cloud round-trip latency and ECONNRESET from slow providers.

export async function POST(req: NextRequest) {
    // 20 searches per minute per IP
    const rl = rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'flights-search' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        let body: any;
        try {
            body = await req.json();
        } catch {
            return badRequest('Request body must be valid JSON');
        }

        // ── Parse segments ──────────────────────────────────────────────────
        let segments = body.segments || [];
        if (segments.length === 0 && body.origin && body.destination && body.departureDate) {
            segments = [{ origin: body.origin, destination: body.destination, departureDate: body.departureDate }];
            if (body.returnDate) {
                segments.push({ origin: body.destination, destination: body.origin, departureDate: body.returnDate });
            }
        }
        if (segments.length === 0) return badRequest('No valid flight segments provided');

        // ── Validate segments ───────────────────────────────────────────────
        for (const seg of segments) {
            seg.origin = String(seg.origin ?? '').toUpperCase();
            seg.destination = String(seg.destination ?? '').toUpperCase();
            if (!IATA_RE.test(seg.origin) || !IATA_RE.test(seg.destination))
                return badRequest('origins and destinations must be 3-letter IATA codes');
            if (seg.origin === seg.destination)
                return badRequest('origin and destination must differ');
            if (!seg.departureDate || !DATE_RE.test(seg.departureDate))
                return badRequest('departureDate required (YYYY-MM-DD)');
        }

        // ── Passengers ──────────────────────────────────────────────────────
        const { passengers } = body;
        const adults = Math.max(1, Number(passengers?.adults) || 1);
        const children = Math.max(0, Number(passengers?.children) || 0);
        const infants = Math.max(0, Number(passengers?.infants) || 0);
        if (infants > adults) return badRequest('infants cannot exceed adults');
        if (adults + children + infants > 9) return badRequest('max 9 passengers');

        // ── Cabin / trip ────────────────────────────────────────────────────
        const cabin = (body.cabinClass ?? 'economy') as CabinClass;
        if (!VALID_CABIN.has(cabin)) return badRequest(`invalid cabinClass: ${cabin}`);
        const tripType = (body.tripType ?? (segments.length > 1 ? 'round-trip' : 'one-way')) as string;
        if (!VALID_TRIP.has(tripType)) return badRequest(`invalid tripType: ${tripType}`);

        // ── Build FlightSearchParams from first segment ──────────────────────
        const first = segments[0];
        const last = segments[segments.length - 1];

        const params: FlightSearchParams = {
            origin: first.origin,
            destination: first.destination,
            departureDate: first.departureDate,
            returnDate: segments.length > 1 ? last.departureDate : undefined,
            adults,
            children,
            infants,
            cabinClass: cabin,
        };

        // ── Search providers in parallel (15s timeout each) ─────────────────
        // saveSearch is called inside searchFlights after the cache check,
        // so we never create an empty record that poisons the cache lookup.
        const offers = await searchFlights(params);

        return NextResponse.json({
            success: true,
            data: {
                offers,
                totalResults: offers.length,
                searchTimestamp: new Date().toISOString(),
                searchDurationMs: 0,
            },
        });
    } catch (err) {
        console.error('[POST /api/flights/search]', err);
        const message = err instanceof Error ? err.message : 'Flight search failed';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
