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
import { FlightProvider as FP } from '../_shared/types.ts';
import { revalidateFare, revalidateFareV2 } from '../_shared/mystiflyClient.ts';
import { normalizeMystiflyV1Policy, normalizeMystiflyV2Policy, normalizeDuffelPolicy } from '../_shared/farePolicy.ts';
import type { NormalizedFarePolicy } from '../_shared/types.ts';
import { getCorsHeaders } from '../_shared/cors.ts';




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
    [key: string]: unknown; // index signature for jsonResponse compat
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
    /** Locked fare policy with policyVersion='revalidated'. */
    farePolicy?: NormalizedFarePolicy;
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
            // Duffel — re-read policy from the stored flight offer in the booking session.
            // NOTE: Duffel order creation may return updated conditions; callers should
            // re-extract policy from the Order response and overwrite this if changed.
            const storedFlight = body.flightPayload?.flight as any;
            let farePolicy: NormalizedFarePolicy | undefined;
            if (storedFlight?.conditions) {
                farePolicy = { ...normalizeDuffelPolicy(storedFlight), policyVersion: 'revalidated', policySource: 'duffel' };
            }

            const nowIso = new Date().toISOString();

            result = {
                success: true,
                priceChanged: false,
                oldPrice: oldPrice,
                newPrice: oldPrice,
                seatsAvailable: true,
                provider: body.provider,
                validatedFlight: { price: oldPrice, baseFare: oldPrice, taxes: 0, currency: body.flightPayload.currency || 'USD', pricePerAdult: oldPrice },
                farePolicy,
                revalidatedAt: nowIso,
                durationMs: Date.now() - startMs,
            };
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
            provider: FP.MYSTIFLY,
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
            provider: FP.MYSTIFLY,
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: 'traceId (fareSourceCode) is required for Mystifly revalidation',
            durationMs: Date.now() - startMs,
        };
    }

    // ── Call Mystifly API (catch errors gracefully instead of letting them 500) ──
    let raw: any;
    try {
        raw = body.provider === 'mystifly_v2'
            ? await revalidateFareV2(traceId, sessionId, conversationId)
            : await revalidateFare(traceId, sessionId, conversationId);
    } catch (err: any) {
        const msg = err?.message || 'Mystifly revalidation request failed';
        const isExpired = /expired|not found|not available|timeout|abort/i.test(msg);
        const isParse = err?.type === 'PARSE' || /invalid json|empty response/i.test(msg);
        console.error(`[revalidate-flight] Mystifly API error (${body.provider}):`, msg);

        // V2 PARSE errors (empty response) = endpoint may not exist.
        // Soft-pass: trust the fare from search and let the booking API validate it.
        if (body.provider === 'mystifly_v2' && isParse) {
            console.warn('[revalidate-flight] V2 revalidation unavailable — soft-passing with original price');
            return {
                success: true,
                priceChanged: false,
                oldPrice,
                newPrice: oldPrice,
                seatsAvailable: true,
                provider: body.provider,
                validatedFlight: {
                    price: oldPrice,
                    baseFare: oldPrice,
                    taxes: 0,
                    currency: body.flightPayload.currency || 'USD',
                    pricePerAdult: oldPrice,
                    traceId,
                },
                revalidationSkipped: true,
                durationMs: Date.now() - startMs,
            };
        }

        return {
            success: true, // success=true means we handled it; seatsAvailable=false means fare is gone
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: body.provider,
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: isExpired
                ? 'Flight fare has expired. Please search again.'
                : `Revalidation failed: ${msg}`,
            durationMs: Date.now() - startMs,
        };
    }

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
            provider: FP.MYSTIFLY,
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: isUnavailable ? 'Flight no longer available' : msg,
            durationMs: Date.now() - startMs,
        };
    }

    // ── Parse updated pricing ──
    const revalData = raw.Data ?? {};
    const priceChanged = revalData.PriceChanged === true;

    // Mystifly Sandbox occasionally uses 'Itinerary' or an array 'PricedItineraries' instead of 'FareItinerary' when PriceChanged is true.
    const itinerary = revalData.FareItinerary ?? revalData.Itinerary ??
        (revalData.PricedItineraries && revalData.PricedItineraries.length > 0 ? revalData.PricedItineraries[0] : revalData);

    const fareInfo = itinerary.AirItineraryFareInfo ?? itinerary.AirItineraryPricingInfo ?? revalData;
    const itinFare = fareInfo.ItinTotalFare;

    let currency: string;
    let newPrice = 0;
    let baseFare = 0;
    let taxes = 0;
    let pricePerAdult = 0;

    let newTraceId = traceId;
    let freshFarePolicy: NormalizedFarePolicy;

    // V2 Pricing Structure (FlightFaresList)
    if (body.provider === 'mystifly_v2' && (revalData.FlightFaresList ?? []).length > 0) {
        const fare = revalData.FlightFaresList[0];
        currency = fare.Currency ?? body.flightPayload.currency ?? 'USD';
        const passengerFares: any[] = fare.PassengerFare ?? [];
        for (const pf of passengerFares) {
            const paxTotal = parseFloat(pf.TotalFare) || 0;
            const paxBase = parseFloat(pf.BaseFare) || 0;
            const qty = Number(pf.Quantity) || 1;
            newPrice += paxTotal * qty;
            baseFare += paxBase * qty;
            if (pf.PaxType === 'ADT') pricePerAdult = paxTotal;
        }
        if (pricePerAdult === 0) pricePerAdult = newPrice;
        taxes = Math.max(0, newPrice - baseFare);

        newTraceId = fare.FareSourceCode ?? revalData.FareSourceCode ?? traceId;
        freshFarePolicy = {
            ...normalizeMystiflyV2Policy(fare),
            policyVersion: 'revalidated',
            policySource: 'mystifly_v2',
        };
    } else {
        // V1 Pricing Structure
        currency = itinFare?.TotalFare?.CurrencyCode ?? body.flightPayload.currency ?? 'USD';
        newPrice = Number(itinFare?.TotalFare?.Amount) || 0;
        baseFare = Number(itinFare?.BaseFare?.Amount) || 0;
        taxes = Number(itinFare?.TotalTax?.Amount) || 0;

        pricePerAdult = newPrice;
        const fareBreakdown: any[] = fareInfo.FareBreakdown ?? [];
        for (const fb of fareBreakdown) {
            if (fb?.PassengerTypeQuantity?.Code === 'ADT') {
                pricePerAdult = Number(fb?.PassengerFare?.TotalFare?.Amount) || newPrice;
                break;
            }
        }

        newTraceId = fareInfo.FareSourceCode ?? revalData.FareSourceCode ?? traceId;
        const freshItinerary = revalData.FareItinerary ?? revalData.Itinerary ?? revalData;

        freshFarePolicy = {
            ...normalizeMystiflyV1Policy(freshItinerary),
            policyVersion: 'revalidated',
            policySource: 'mystifly_v1',
        };
    }

    const nowIso = new Date().toISOString();

    // ── Currency Normalization for comparison ──
    // Providers often return prices in USD/EUR even if the search was in PHP/KRW.
    // We must normalize to the oldPrice's currency (provided in flightPayload)
    // for an accurate delta check.
    const searchCurrency = (body.flightPayload.currency || 'USD').toUpperCase();
    const revalCurrency = (currency || 'USD').toUpperCase();

    let normalizedNewPrice = newPrice;
    if (searchCurrency !== revalCurrency) {
        // Simple fixed rates for major production currencies to avoid false 409s
        const rates: Record<string, number> = { 'PHP': 58, 'KRW': 1350, 'USD': 1 };
        const rateToUsd = rates[revalCurrency] || 1;
        const rateFromUsd = rates[searchCurrency] || 1;
        normalizedNewPrice = (newPrice / rateToUsd) * rateFromUsd;
        console.log(`[revalidate-flight] Normalizing ${newPrice} ${revalCurrency} to ${normalizedNewPrice} ${searchCurrency} for comparison.`);
    }

    return {
        success: true,
        priceChanged: priceChanged || Math.abs(normalizedNewPrice - oldPrice) > 1.0, // Increased tolerance to $1/58PHP to avoid micro-rounding noise
        oldPrice,
        newPrice,
        seatsAvailable: true,
        provider: body.provider,
        debugRaw: revalData,
        validatedFlight: {
            price: newPrice,
            baseFare,
            taxes,
            currency,
            pricePerAdult,
            traceId: newTraceId,
        },
        farePolicy: freshFarePolicy,
        revalidatedAt: nowIso,
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
