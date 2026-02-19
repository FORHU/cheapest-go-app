/**
 * Mystifly Flight Search — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-search
 *
 * Searches Mystifly for flight offers and returns normalized results.
 * Automatically creates a session if one doesn't exist.
 * Called by the unified-flight-search orchestrator or directly.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { FlightSearchRequest, NormalizedFlight } from '../_shared/types.ts';
import { createSession, searchFlights } from '../_shared/mystiflyClient.ts';
import { normalizeMystiflyResponse } from '../_shared/normalizeFlight.ts';

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

        console.log('[mystifly-search] Request:', {
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

        // ── Session + Search ──
        const startMs = Date.now();

        // TODO: Create session and search
        // const sessionId = await createSession();
        // const rawResponse = await searchFlights(body, sessionId);
        // const fareItineraries = rawResponse.Data?.FareItineraries ?? [];
        // const offers = normalizeMystiflyResponse(fareItineraries);
        const offers: NormalizedFlight[] = []; // placeholder

        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-search] Returned ${offers.length} offers in ${durationMs}ms`);

        // ── Response ──
        return new Response(
            JSON.stringify({
                success: true,
                offers,
                metadata: {
                    provider: 'mystifly',
                    searchId: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    totalResults: offers.length,
                    durationMs,
                },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[mystifly-search] Error:', err.message);
        return new Response(
            JSON.stringify({ success: false, error: err.message || 'Mystifly search failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
