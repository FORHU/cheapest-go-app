/**
 * Amadeus Flight Search — Supabase Edge Function
 *
 * POST /functions/v1/amadeus-search
 *
 * Searches Amadeus Flight Offers API and returns normalized flight offers.
 * Called by the unified-flight-search orchestrator or directly for Amadeus-only search.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { FlightSearchRequest, NormalizedFlight } from '../_shared/types.ts';
import { searchFlights } from '../_shared/amadeusClient.ts';
import { normalizeAmadeusResponse } from '../_shared/normalizeFlight.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    // ── CORS Preflight ──
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // ── Parse Request ──
        const body: FlightSearchRequest = JSON.parse(await req.text());

        console.log('[amadeus-search] Request:', {
            origin: body.segments?.[0]?.origin,
            destination: body.segments?.[0]?.destination,
            tripType: body.tripType,
            passengers: body.passengers,
        });

        // ── Validate ──
        if (!body.segments?.length || !body.passengers) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: segments, passengers' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        // ── Search ──
        const startMs = Date.now();

        // TODO: Call Amadeus API and normalize results
        // const rawResponse = await searchFlights(body);
        // const offers = normalizeAmadeusResponse(rawResponse.data ?? [], rawResponse.dictionaries);
        const offers: NormalizedFlight[] = []; // placeholder

        const durationMs = Date.now() - startMs;

        console.log(`[amadeus-search] Returned ${offers.length} offers in ${durationMs}ms`);

        // ── Response ──
        return new Response(
            JSON.stringify({
                success: true,
                offers,
                metadata: {
                    provider: 'amadeus',
                    searchId: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    totalResults: offers.length,
                    durationMs,
                },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[amadeus-search] Error:', err.message);
        return new Response(
            JSON.stringify({ success: false, error: err.message || 'Amadeus search failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
