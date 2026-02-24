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

import type { NormalizedFlight, FlightProvider } from '../_shared/types.ts';

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

// ─── Request Body ───────────────────────────────────────────────────

interface UnifiedSearchBody {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
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

        if (!body.origin || !body.destination || !body.departureDate || !body.adults) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'Required: origin, destination, departureDate, adults', flights: [] },
                400,
            );
        }

        const enabledProviders = PROVIDERS.filter((p) => p.enabled);

        console.log('[unified-flight-search] Searching:', {
            providers: enabledProviders.map((p) => p.name),
            origin: body.origin,
            destination: body.destination,
            departureDate: body.departureDate,
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

        // ── Deduplicate (same flight from multiple GDS) ──
        const deduped = deduplicateFlights(allFlights);

        // ── Sort by price ascending ──
        deduped.sort((a, b) => a.price - b.price);

        // ── Apply limit ──
        const flights = deduped;

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

// ─── Deduplication ──────────────────────────────────────────────────

/**
 * MED-2 FIX: Improved deduplication for multi-segment itineraries.
 * Uses ALL segment flight numbers + departure times as the composite key
 * (not just the first segment). This prevents multi-segment itineraries
 * with different connections from being incorrectly de-duplicated.
 */
function deduplicateFlights(flights: NormalizedFlight[]): NormalizedFlight[] {
    const seen = new Map<string, NormalizedFlight>();

    for (const flight of flights) {
        // Build key from ALL segments, not just the first
        const segmentKeys = (flight.segments ?? []).map(
            (seg) => `${seg.flightNumber}_${seg.departureTime}`,
        );
        const key = segmentKeys.length > 0
            ? segmentKeys.join('|')
            : `${flight.flightNumber}_${flight.departureTime}`;

        const existing = seen.get(key);

        if (!existing || flight.price < existing.price) {
            seen.set(key, flight);
        }
    }

    return Array.from(seen.values());
}

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(corsHeaders: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
