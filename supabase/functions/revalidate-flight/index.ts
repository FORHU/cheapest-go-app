/**
 * Revalidate Flight — Supabase Edge Function
 *
 * POST /functions/v1/revalidate-flight
 *
 * Checks if a flight offer is still available and returns the current
 * price before booking. Routes to Mystifly or Amadeus based on provider.
 *
 * Must be called before booking to detect price changes and expired fares.
 * API keys never leave the server — only normalized results are returned.
 *
 * POST body:
 *   {
 *     provider: "mystifly" | "amadeus",
 *     flightPayload: {
 *       traceId?: string,      // Mystifly FareSourceCode
 *       resultIndex?: string,   // Amadeus offer ID
 *       oldPrice: number,       // Original price for change detection
 *       currency?: string,
 *       flight?: object,        // Full Amadeus flight-offer for repricing
 *     },
 *     userId: string
 *   }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { FlightProvider } from '../_shared/types.ts';
import { revalidateFare, MystiflyError } from '../_shared/mystiflyClient.ts';

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

// ─── Request / Response Types ───────────────────────────────────────

interface RevalidateBody {
    provider: FlightProvider;
    flightPayload: {
        traceId?: string;
        resultIndex?: string;
        oldPrice: number;
        currency?: string;
        flight?: Record<string, any>;
    };
    userId: string;
}

interface RevalidateResult {
    success: boolean;
    priceChanged: boolean;
    oldPrice: number;
    newPrice: number;
    seatsAvailable: boolean;
    provider: FlightProvider;
    validatedFlight: {
        price: number;
        baseFare: number;
        taxes: number;
        currency: string;
        pricePerAdult: number;
        traceId?: string;
    };
    error?: string;
    durationMs: number;
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const body: RevalidateBody = JSON.parse(await req.text());

        if (!body.provider || !body.flightPayload || !body.userId) {
            return jsonResponse(corsHeaders, {
                success: false,
                error: 'Required: provider, flightPayload, userId',
            }, 400);
        }

        if (body.provider !== 'mystifly' && body.provider !== 'mystifly_v2' && body.provider !== 'duffel') {
            return jsonResponse(corsHeaders, {
                success: false,
                error: `Unknown provider: ${body.provider}`,
            }, 400);
        }

        const oldPrice = body.flightPayload.oldPrice ?? 0;

        console.log(`[revalidate-flight] Provider: ${body.provider}, userId: ${body.userId}, oldPrice: ${oldPrice}`);

        // ── Route to provider ──
        let result: RevalidateResult;

        if (body.provider === 'mystifly' || body.provider === 'mystifly_v2') {
            result = await revalidateMystifly(body, oldPrice, startMs);
        } else {
            // Duffel revalidation to be implemented if needed, currently bypasses
            result = {
                success: true,
                priceChanged: false,
                oldPrice: oldPrice,
                newPrice: oldPrice,
                seatsAvailable: true,
                provider: body.provider,
                validatedFlight: { price: oldPrice, baseFare: oldPrice, taxes: 0, currency: body.flightPayload.currency || 'USD', pricePerAdult: oldPrice },
                durationMs: Date.now() - startMs,
            }
        }

        console.log(`[revalidate-flight] Done: available=${result.seatsAvailable}, priceChanged=${result.priceChanged}, new=${result.newPrice} in ${result.durationMs}ms`);

        return jsonResponse(corsHeaders, result, result.success ? 200 : 422);
    } catch (err: any) {
        console.error('[revalidate-flight] Error:', err.message);

        return jsonResponse(getCorsHeaders(req), {
            success: false,
            priceChanged: false,
            oldPrice: 0,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'mystifly',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: err.message || 'Revalidation failed',
            durationMs: Date.now() - startMs,
        }, 500);
    }
});

// ─── Mystifly Revalidation ──────────────────────────────────────────

async function revalidateMystifly(
    body: RevalidateBody,
    oldPrice: number,
    startMs: number,
): Promise<RevalidateResult> {
    let traceId = body.flightPayload.traceId;
    let conversationId: string | undefined = undefined;
    let sessionId: string | undefined = undefined;

    // ── Extract tunneled IDs (FareSourceCode|ConversationId|SessionId) ──
    if (traceId?.includes('|')) {
        const parts = traceId.split('|');
        traceId = parts[0];
        conversationId = parts[1];
        sessionId = parts[2];
        console.log('[revalidate-flight] Extracted tunneled IDs:', { conversationId, hasSessionId: !!sessionId });
    }

    if (!traceId) {
        return {
            success: false,
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'mystifly',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: 'traceId (fareSourceCode) is required for Mystifly revalidation',
            durationMs: Date.now() - startMs,
        };
    }

    const raw = await revalidateFare(traceId, sessionId, conversationId);


    // ── Handle failure / unavailable ──
    if (!raw.Success) {
        const msg: string = raw.Message ?? '';
        const isUnavailable = /not available|not found|expired/i.test(msg);

        return {
            success: true,
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'mystifly',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: isUnavailable ? 'Flight no longer available' : msg,
            durationMs: Date.now() - startMs,
        };
    }

    // ── Parse updated pricing ──
    const revalData = raw.Data ?? {};
    const priceChanged = revalData.PriceChanged === true;

    const itinerary = revalData.FareItinerary ?? revalData;
    const fareInfo = itinerary.AirItineraryFareInfo ?? revalData;
    const itinFare = fareInfo.ItinTotalFare;

    const currency: string = itinFare?.TotalFare?.CurrencyCode ?? body.flightPayload.currency ?? 'USD';
    const newPrice = Number(itinFare?.TotalFare?.Amount) || 0;
    const baseFare = Number(itinFare?.BaseFare?.Amount) || 0;
    const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

    // Per-adult price
    let pricePerAdult = newPrice;
    const fareBreakdown: any[] = fareInfo.FareBreakdown ?? [];
    for (const fb of fareBreakdown) {
        if (fb?.PassengerTypeQuantity?.Code === 'ADT') {
            pricePerAdult = Number(fb?.PassengerFare?.TotalFare?.Amount) || newPrice;
            break;
        }
    }

    // Updated traceId if FareSourceCode changed
    const newTraceId: string | undefined =
        fareInfo.FareSourceCode ?? revalData.FareSourceCode ?? traceId;

    return {
        success: true,
        priceChanged: priceChanged || Math.abs(newPrice - oldPrice) > 0.01,
        oldPrice,
        newPrice,
        seatsAvailable: true,
        provider: 'mystifly',
        validatedFlight: {
            price: newPrice,
            baseFare,
            taxes,
            currency,
            pricePerAdult,
            traceId: newTraceId,
        },
        durationMs: Date.now() - startMs,
    };
}


// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(corsHeaders: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
