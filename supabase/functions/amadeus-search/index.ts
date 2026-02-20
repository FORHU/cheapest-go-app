/**
 * Amadeus Flight Search — Supabase Edge Function
 *
 * POST /functions/v1/amadeus-search
 *
 * Searches the Amadeus Flight Offers Search v2 API
 * and returns normalized NormalizedFlight[] results.
 *
 * POST body:
 *   { origin, destination, departureDate, returnDate?, adults,
 *     children?, infants?, cabinClass?, currency?, maxOffers?, nonStopOnly? }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { NormalizedFlight, CabinClass } from '../_shared/types.ts';
import { amadeusRequest, AmadeusError } from '../_shared/amadeusClient.ts';
import { normalizeAmadeusResponse, toAmadeusCabin } from '../_shared/normalizeFlight.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Request Body ───────────────────────────────────────────────────

interface AmadeusSearchBody {
    origin: string;
    destination: string;
    departureDate: string;        // YYYY-MM-DD
    returnDate?: string;          // YYYY-MM-DD
    adults: number;
    children?: number;
    infants?: number;
    cabinClass?: CabinClass;
    currency?: string;
    maxOffers?: number;
    nonStopOnly?: boolean;
}

// ─── Amadeus API Response Shape ─────────────────────────────────────

interface AmadeusFlightOffersResponse {
    meta?: { count: number };
    data?: unknown[];
    dictionaries?: {
        carriers?: Record<string, string>;
        aircraft?: Record<string, string>;
        currencies?: Record<string, string>;
        locations?: Record<string, { cityCode: string; countryCode: string }>;
    };
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const body: AmadeusSearchBody = JSON.parse(await req.text());

        if (!body.origin || !body.destination || !body.departureDate || !body.adults) {
            return jsonResponse(
                { success: false, error: 'Required: origin, destination, departureDate, adults' },
                400,
            );
        }

        if (!/^[A-Z]{3}$/.test(body.origin) || !/^[A-Z]{3}$/.test(body.destination)) {
            return jsonResponse(
                { success: false, error: 'origin and destination must be 3-letter IATA codes' },
                400,
            );
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.departureDate)) {
            return jsonResponse(
                { success: false, error: 'departureDate must be YYYY-MM-DD' },
                400,
            );
        }

        console.log('[amadeus-search] Request:', {
            origin: body.origin,
            destination: body.destination,
            departureDate: body.departureDate,
            returnDate: body.returnDate,
            adults: body.adults,
            cabinClass: body.cabinClass,
        });

        // ── Build Amadeus GET params ──
        const params: Record<string, string> = {
            originLocationCode: body.origin,
            destinationLocationCode: body.destination,
            departureDate: body.departureDate,
            adults: String(body.adults),
            max: String(body.maxOffers ?? 50),
        };

        if (body.returnDate) {
            params.returnDate = body.returnDate;
        }
        if (body.children && body.children > 0) {
            params.children = String(body.children);
        }
        if (body.infants && body.infants > 0) {
            params.infants = String(body.infants);
        }
        if (body.cabinClass) {
            params.travelClass = toAmadeusCabin(body.cabinClass);
        }
        if (body.currency) {
            params.currencyCode = body.currency;
        }
        if (body.nonStopOnly) {
            params.nonStop = 'true';
        }

        // ── Call Amadeus Flight Offers Search v2 ──
        const raw = await amadeusRequest<AmadeusFlightOffersResponse>(
            '/v2/shopping/flight-offers',
            { method: 'GET', params },
        );

        console.log(`[amadeus-search] Amadeus returned ${raw.data?.length ?? 0} raw offers`);

        // ── Normalize ──
        const flights: NormalizedFlight[] = normalizeAmadeusResponse(
            raw.data ?? [],
            raw.dictionaries,
        );

        const durationMs = Date.now() - startMs;

        console.log(`[amadeus-search] Normalized ${flights.length} flights in ${durationMs}ms`);

        // ── Response ──
        return jsonResponse({
            provider: 'amadeus',
            flights,
            totalResults: flights.length,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;

        console.error('[amadeus-search] Error:', err.message);

        const status = err instanceof AmadeusError ? Math.max(err.status, 400) : 500;

        return jsonResponse(
            {
                provider: 'amadeus',
                flights: [],
                totalResults: 0,
                durationMs,
                error: err.message || 'Amadeus search failed',
            },
            status,
        );
    }
});

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
