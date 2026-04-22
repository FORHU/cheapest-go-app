/**
 * Mystifly TripDetails — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-trip-details
 *
 * Returns full trip details for a confirmed Mystifly booking:
 * passenger info, flight segments, pricing, booking status, e-ticket numbers.
 *
 * POST body: { uniqueId: string }
 *
 * Response: { success, travelItinerary, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { getTripDetails, MystiflyError } from '../_shared/mystiflyClient.ts';

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { uniqueId } = body;

        if (!uniqueId) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'uniqueId is required' },
                400,
            );
        }

        console.log(`[mystifly-trip-details] Fetching trip details for: ${uniqueId}`);

        const raw = await getTripDetails(uniqueId);
        const durationMs = Date.now() - startMs;

        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            console.warn(`[mystifly-trip-details] API returned failure: ${msg}`);
            return jsonResponse(corsHeaders, {
                success: false,
                error: msg || 'TripDetails request failed',
                durationMs,
            });
        }

        const travelItinerary = raw.Data?.TripDetailsResult?.TravelItinerary
            ?? raw.Data?.TravelItinerary
            ?? raw.TravelItinerary
            ?? null;

        console.log(`[mystifly-trip-details] Success for ${uniqueId}, ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            travelItinerary,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-trip-details] Error:', err.message);

        // 404 means the PNR doesn't exist in Mystifly's system (demo expiry or wrong env)
        if (err instanceof MystiflyError && err.status === 404) {
            return jsonResponse(corsHeaders, {
                success: false,
                error: 'Booking not found in airline system. This may be a demo/test booking.',
                durationMs,
            }, 404);
        }

        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'TripDetails request failed', durationMs },
            status,
        );
    }
});

function jsonResponse(headers: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
}
