/**
 * Mystifly Fare Revalidation — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-revalidate
 *
 * Checks if a Mystifly flight offer is still available and returns
 * the current price. Call before booking to detect fare changes.
 *
 * POST body: { fareSourceCode: string, oldPrice?: number }
 *
 * Prefer using revalidate-flight for unified multi-provider support.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { revalidateFare, MystiflyError } from '../_shared/mystiflyClient.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { fareSourceCode, oldPrice } = body;

        if (!fareSourceCode) {
            return jsonResponse(
                { success: false, error: 'fareSourceCode is required' },
                400,
            );
        }

        console.log('[mystifly-revalidate] Revalidating fare');

        // ── Call Mystifly ──
        const raw = await revalidateFare(fareSourceCode);

        // ── Handle unavailable ──
        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            const isUnavailable = /not available|not found|expired/i.test(msg);

            console.log(`[mystifly-revalidate] Not available: ${msg}`);

            return jsonResponse({
                success: true,
                available: false,
                price: 0,
                currency: 'USD',
                baseFare: 0,
                taxes: 0,
                priceChanged: false,
                error: isUnavailable ? 'Flight no longer available' : msg,
                durationMs: Date.now() - startMs,
            });
        }

        // ── Parse updated pricing ──
        const revalData = raw.Data ?? {};
        const priceChanged = revalData.PriceChanged === true;

        const itinerary = revalData.FareItinerary ?? revalData;
        const fareInfo = itinerary.AirItineraryFareInfo ?? revalData;
        const itinFare = fareInfo.ItinTotalFare;

        const currency: string = itinFare?.TotalFare?.CurrencyCode ?? 'USD';
        const price = Number(itinFare?.TotalFare?.Amount) || 0;
        const baseFare = Number(itinFare?.BaseFare?.Amount) || 0;
        const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

        // Per-adult price
        let pricePerAdult = price;
        const fareBreakdown: any[] = fareInfo.FareBreakdown ?? [];
        for (const fb of fareBreakdown) {
            if (fb?.PassengerTypeQuantity?.Code === 'ADT') {
                pricePerAdult = Number(fb?.PassengerFare?.TotalFare?.Amount) || price;
                break;
            }
        }

        // Updated FareSourceCode
        const newTraceId: string =
            fareInfo.FareSourceCode ?? revalData.FareSourceCode ?? fareSourceCode;

        const actualPriceChanged = priceChanged
            || (oldPrice != null && Math.abs(price - oldPrice) > 0.01);

        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-revalidate] Available, price: ${currency} ${price}, changed: ${actualPriceChanged}, ${durationMs}ms`);

        return jsonResponse({
            success: true,
            available: true,
            price,
            currency,
            baseFare,
            taxes,
            pricePerAdult,
            priceChanged: actualPriceChanged,
            traceId: newTraceId,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;

        console.error('[mystifly-revalidate] Error:', err.message);

        return jsonResponse(
            { success: false, error: err.message || 'Revalidation failed', durationMs },
            status,
        );
    }
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
