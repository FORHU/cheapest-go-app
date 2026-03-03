/**
 * Unified Flight Search — Supabase Edge Function (Orchestrator)
 *
 * POST /functions/v1/unified-flight-search
 *
 * Fans out to amadeus-search + mystifly-search in parallel,
 * merges, deduplicates, and sorts the combined results.
 *
 * This is the primary endpoint the Next.js frontend calls.
 *
 * POST body:
 *   { origin, destination, departureDate, returnDate?, adults,
 *     children?, infants?, cabinClass?, maxOffers?, nonStopOnly? }
 *
 * If one provider fails, the other's results are still returned.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { FlightProvider } from '../_shared/types.ts';
import type { NormalizedFlight } from '../_shared/types.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = ALLOWED_ORIGINS.length > 0
        ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : '*';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

// ─── Provider Configuration ─────────────────────────────────────────

interface ProviderConfig {
    name: FlightProvider;
    functionName: string;
    enabled: boolean;
    timeoutMs: number;
}

const PROVIDERS: ProviderConfig[] = [
    {
        name: FlightProvider.DUFFEL,
        functionName: 'duffel-search',
        enabled: true,
        timeoutMs: 15_000,
    },
    {
        name: FlightProvider.MYSTIFLY, // V1 Lowest Fares
        functionName: 'mystifly-search',
        enabled: true,
        timeoutMs: 20_000,
    },
    {
        name: FlightProvider.MYSTIFLY_V2, // V2 Branded Fares
        functionName: 'mystifly-v2-search',
        enabled: true,
        timeoutMs: 20_000,
    },
];

// ─── Request Body ───────────────────────────────────────────────────

interface UnifiedSearchBody {
    segments: { origin: string; destination: string; departureDate: string }[];
    tripType: 'one-way' | 'round-trip' | 'multi-city';
    adults: number;
    children?: number;
    infants?: number;
    cabinClass?: string;
    maxOffers?: number;
    nonStopOnly?: boolean;
    currency?: string;
}

// ─── Provider Result ────────────────────────────────────────────────

interface ProviderResult {
    name: FlightProvider;
    flights: NormalizedFlight[];
    durationMs: number;
    error?: string;
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const searchStart = Date.now();

    try {
        // ── Parse & Validate ──
        const body: UnifiedSearchBody = JSON.parse(await req.text());

        if (!Array.isArray(body.segments) || body.segments.length === 0 || !body.adults) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'Required: segments array and adults count', flights: [] },
                400,
            );
        }

        const enabledProviders = PROVIDERS.filter((p) => p.enabled);

        console.log('[unified-flight-search] Searching:', {
            providers: enabledProviders.map((p) => p.name),
            tripType: body.tripType,
            segmentCount: body.segments.length,
            adults: body.adults,
        });

        // ── Fan-out to all providers in parallel ──
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const authHeader = req.headers.get('Authorization') ?? '';

        const providerPromises = enabledProviders.map((provider) =>
            callProvider(provider, body, SUPABASE_URL, authHeader),
        );

        const providerResults = await Promise.all(providerPromises);

        // ── Merge all flights ──
        const allFlights: NormalizedFlight[] = providerResults.flatMap((r) => r.flights);
        const duffelCount = providerResults.find(r => r.name === FlightProvider.DUFFEL)?.flights.length ?? 0;
        const mystiflyCount = providerResults.filter(r => r.name === FlightProvider.MYSTIFLY).reduce((acc, r) => acc + r.flights.length, 0);
        console.log(`[unified-flight-search] Raw counts - Duffel: ${duffelCount}, Mystifly: ${mystiflyCount}`);

        // ── Deduplicate (same flight from multiple GDS) ──
        const deduped = deduplicateFlights(allFlights);
        console.log(`[unified-flight-search] After dedup: ${deduped.length} flights`);

        // ── Smart Multi-Provider Sorting ──
        // Ensures variety at the top so users don't have to scroll for Amadeus results
        const flights = smartSort(deduped);

        const searchDurationMs = Date.now() - searchStart;

        const totalFromProviders = providerResults.reduce((sum, r) => sum + r.flights.length, 0);

        console.log(
            `[unified-flight-search] Complete: ${flights.length} flights ` +
            `(${totalFromProviders} raw, ${deduped.length} deduped) ` +
            `from ${enabledProviders.length} providers in ${searchDurationMs}ms`,
        );

        // ── Response ──
        return jsonResponse(corsHeaders, {
            success: true,
            flights,
            providers: providerResults.map((r) => ({
                name: r.name,
                count: r.flights.length,
                durationMs: r.durationMs,
                error: r.error,
            })),
            totalResults: flights.length,
            searchDurationMs,
        });
    } catch (err: any) {
        console.error('[unified-flight-search] Error:', err.message);
        return jsonResponse(getCorsHeaders(req),
            {
                success: false,
                error: err.message || 'Unified flight search failed',
                flights: [],
                providers: [],
                totalResults: 0,
                searchDurationMs: Date.now() - searchStart,
            },
            500,
        );
    }
});

// ─── Provider Call ──────────────────────────────────────────────────

async function callProvider(
    provider: ProviderConfig,
    body: UnifiedSearchBody,
    supabaseUrl: string,
    authHeader: string,
): Promise<ProviderResult> {
    const startMs = Date.now();
    const url = `${supabaseUrl}/functions/v1/${provider.functionName}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), provider.timeoutMs);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const durationMs = Date.now() - startMs;

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(`[unified-flight-search] ${provider.name} HTTP ${res.status}: ${text.slice(0, 200)}`);

            let errorMsg = `${provider.name} returned ${res.status}`;
            try {
                const errJson = JSON.parse(text);
                if (errJson.error) {
                    errorMsg = errJson.error;
                }
            } catch {
                // Not JSON or no error field, use default
            }

            return {
                name: provider.name,
                flights: [],
                durationMs,
                error: errorMsg,
            };
        }

        const data = await res.json();
        const flights: NormalizedFlight[] = data.flights ?? data.offers ?? [];

        console.log(`[unified-flight-search] ${provider.name}: ${flights.length} flights in ${durationMs}ms`);

        return {
            name: provider.name,
            flights,
            durationMs,
            error: data.error,
        };
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const isTimeout = err.name === 'AbortError';
        const message = isTimeout
            ? `${provider.name} timed out after ${provider.timeoutMs}ms`
            : `${provider.name} failed: ${err.message}`;

        console.error(`[unified-flight-search] ${message}`);

        return {
            name: provider.name,
            flights: [],
            durationMs,
            error: message,
        };
    }
}

/**
 * MED-2 FIX: Improved deduplication for multi-segment itineraries.
 * SENIOR-LEVEL: Prefer Duffel if prices are virtually identical (< 1% diff).
 */
function deduplicateFlights(flights: NormalizedFlight[]): NormalizedFlight[] {
    // Group identical physical itineraries
    const itineraryGroups = new Map<string, NormalizedFlight[]>();

    for (const flight of flights) {
        const segmentKeys = (flight.segments ?? []).map(
            (seg) => `${seg.flightNumber}_${(seg.departureTime || '').slice(0, 16)}`,
        );
        const physicalKey = segmentKeys.length > 0
            ? segmentKeys.join('|')
            : `${flight.flightNumber}_${(flight.departureTime || '').slice(0, 16)}`;

        if (!itineraryGroups.has(physicalKey)) {
            itineraryGroups.set(physicalKey, []);
        }
        itineraryGroups.get(physicalKey)!.push(flight);
    }

    const deduped: NormalizedFlight[] = [];

    for (const group of itineraryGroups.values()) {
        // Sort lowest price first
        group.sort((a, b) => a.price - b.price);

        const kept: NormalizedFlight[] = [];

        for (const flight of group) {
            // Check if we already kept a functionally identical offer for this plane
            // (Same cabin class, and price difference < 2% or < $2 fixed)
            const idx = kept.findIndex(k => {
                const sameCabin = k.cabinClass === flight.cabinClass;
                const priceDiff = Math.abs(k.price - flight.price);
                const isSimilarPrice = priceDiff < (k.price * 0.02) || priceDiff < 2;
                return sameCabin && isSimilarPrice;
            });

            if (idx === -1) {
                // Meaningful variation (e.g. different fare brand with >2% price diff) -> Keep it
                kept.push(flight);
            } else {
                // It's a duplicate. TIE-BREAKER: Prefer Duffel for direct booking reliability
                if (flight.provider === FlightProvider.DUFFEL && kept[idx].provider !== FlightProvider.DUFFEL) {
                    kept[idx] = flight;
                }
            }
        }
        deduped.push(...kept);
    }

    return deduped;
}

/**
 * Ensures provider variety in the top results.
 */
/**
 * Ensures provider variety throughout the results list via interleaving.
 * Uses a 3:1 ratio to ensure the secondary provider is always visible.
 */
function smartSort(flights: NormalizedFlight[]): NormalizedFlight[] {
    const duffel = flights.filter(f => f.provider === FlightProvider.DUFFEL).sort((a, b) => a.price - b.price);
    const mystifly = flights.filter(f => f.provider === FlightProvider.MYSTIFLY).sort((a, b) => a.price - b.price);

    if (duffel.length === 0) return mystifly;
    if (mystifly.length === 0) return duffel;

    const result: NormalizedFlight[] = [];
    let dIdx = 0;
    let mIdx = 0;

    // Determine primary provider (whoever has the cheapest overall flight)
    const mCheapest = mystifly[0].price;
    const dCheapest = duffel[0].price;

    console.log(`[unified-flight-search] Interleaving ${duffel.length} Duffel and ${mystifly.length} Mystifly. Primary: ${mCheapest <= dCheapest ? 'mystifly' : 'duffel'}`);

    while (dIdx < duffel.length || mIdx < mystifly.length) {
        if (mCheapest <= dCheapest) {
            // Case 1: Mystifly is overall cheaper. Pattern: [3 Mystifly, 1 Duffel]
            for (let k = 0; k < 3 && mIdx < mystifly.length; k++) {
                result.push(mystifly[mIdx++]);
            }
            if (dIdx < duffel.length) {
                result.push(duffel[dIdx++]);
            }
        } else {
            // Case 2: Duffel is overall cheaper. Pattern: [3 Duffel, 1 Mystifly]
            for (let k = 0; k < 3 && dIdx < duffel.length; k++) {
                result.push(duffel[dIdx++]);
            }
            if (mIdx < mystifly.length) {
                result.push(mystifly[mIdx++]);
            }
        }
    }

    // Append any remaining flights if one array was longer than the interleaved ratio
    while (mIdx < mystifly.length) {
        result.push(mystifly[mIdx++]);
    }
    while (dIdx < duffel.length) {
        result.push(duffel[dIdx++]);
    }

    return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(corsHeaders: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
