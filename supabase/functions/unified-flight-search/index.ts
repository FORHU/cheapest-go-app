/**
 * Unified Flight Search — Supabase Edge Function (Orchestrator)
 *
 * POST /functions/v1/unified-flight-search
 *
 * Fans out search requests to all enabled flight providers in parallel,
 * then merges, deduplicates, and sorts the combined results.
 *
 * This is the primary endpoint the Next.js frontend should call.
 * Individual provider functions (amadeus-search, mystifly-search) are
 * also callable directly for debugging or provider-specific queries.
 *
 * Architecture:
 *   Client → unified-flight-search → [amadeus-search, mystifly-search] → Client
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type {
    FlightSearchRequest,
    NormalizedFlight,
    FlightProvider,
    UnifiedSearchResponse,
} from '../_shared/types.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Provider Configuration ─────────────────────────────────────────

interface ProviderConfig {
    name: FlightProvider;
    functionName: string;   // Supabase Edge Function name to invoke
    enabled: boolean;
    timeoutMs: number;
}

const PROVIDERS: ProviderConfig[] = [
    {
        name: 'amadeus',
        functionName: 'amadeus-search',
        enabled: true,
        timeoutMs: 15_000,
    },
    {
        name: 'mystifly',
        functionName: 'mystifly-search',
        enabled: true,
        timeoutMs: 20_000,
    },
];

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    // ── CORS Preflight ──
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const searchStart = Date.now();

    try {
        // ── Parse & Validate ──
        const body: FlightSearchRequest = JSON.parse(await req.text());

        if (!body.segments?.length || !body.passengers) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: segments, passengers' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        console.log('[unified-flight-search] Searching across providers:', {
            providers: PROVIDERS.filter((p) => p.enabled).map((p) => p.name),
            origin: body.segments[0]?.origin,
            destination: body.segments[0]?.destination,
            tripType: body.tripType,
        });

        // ── Fan-out to all enabled providers in parallel ──
        const enabledProviders = PROVIDERS.filter((p) => p.enabled);
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        // TODO: Implement parallel fan-out
        // For each enabled provider:
        //   1. Build URL: ${SUPABASE_URL}/functions/v1/${provider.functionName}
        //   2. POST with the same body, timeout via AbortController
        //   3. Collect results with Promise.allSettled()
        //   4. Handle failures gracefully (log error, continue with other providers)

        const providerResults: {
            name: FlightProvider;
            offers: NormalizedFlight[];
            durationMs: number;
            error?: string;
        }[] = [];

        // Placeholder: no results yet
        for (const provider of enabledProviders) {
            providerResults.push({
                name: provider.name,
                offers: [],
                durationMs: 0,
                error: `${provider.name} search not yet implemented`,
            });
        }

        // ── Merge & Sort Results ──
        // TODO: Implement merge logic
        // 1. Combine all offers from all providers
        // 2. Deduplicate by flight number + departure time (same flight from multiple GDS)
        // 3. Sort by price ascending (default)
        // 4. Apply maxOffers limit

        const allOffers: NormalizedFlight[] = providerResults.flatMap((r) => r.offers);
        allOffers.sort((a, b) => a.price - b.price);

        const maxOffers = body.maxOffers ?? 50;
        const trimmedOffers = allOffers.slice(0, maxOffers);

        const searchDurationMs = Date.now() - searchStart;

        console.log(`[unified-flight-search] Complete: ${trimmedOffers.length} offers from ${enabledProviders.length} providers in ${searchDurationMs}ms`);

        // ── Response ──
        const response: UnifiedSearchResponse = {
            success: true,
            offers: trimmedOffers,
            providers: providerResults.map((r) => ({
                name: r.name,
                count: r.offers.length,
                durationMs: r.durationMs,
                error: r.error,
            })),
            totalResults: allOffers.length,
            searchTimestamp: new Date().toISOString(),
            searchDurationMs,
        };

        return new Response(
            JSON.stringify(response),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[unified-flight-search] Error:', err.message);
        return new Response(
            JSON.stringify({
                success: false,
                error: err.message || 'Unified flight search failed',
                offers: [],
                providers: [],
                totalResults: 0,
                searchTimestamp: new Date().toISOString(),
                searchDurationMs: Date.now() - searchStart,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
