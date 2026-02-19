/**
 * Mystifly Fare Revalidation — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-revalidate
 *
 * Checks if a flight offer is still available and returns the current price.
 * Must be called before booking to ensure the fare hasn't changed.
 *
 * Request body: { fareSourceCode: string }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { RevalidateResponse } from '../_shared/types.ts';
import { createSession, revalidateFare } from '../_shared/mystiflyClient.ts';

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
        const body = JSON.parse(await req.text());
        const { fareSourceCode } = body;

        if (!fareSourceCode) {
            return new Response(
                JSON.stringify({ success: false, error: 'fareSourceCode is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        console.log('[mystifly-revalidate] Revalidating fare');

        // ── Session + Revalidate ──
        // TODO: Create session and revalidate
        // const sessionId = await createSession();
        // const rawResponse = await revalidateFare(fareSourceCode, sessionId);
        //
        // Parse response:
        // - Check rawResponse.Success
        // - Extract PriceChanged flag
        // - Extract updated pricing from FareItinerary.AirItineraryFareInfo
        // - Extract new FareSourceCode if it changed
        // - Return RevalidateResponse

        const result: RevalidateResponse = {
            success: true,
            available: false,
            price: 0,
            currency: 'USD',
            baseFare: 0,
            taxes: 0,
            priceChanged: false,
        }; // placeholder

        console.log('[mystifly-revalidate] Result:', {
            available: result.available,
            priceChanged: result.priceChanged,
        });

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[mystifly-revalidate] Error:', err.message);
        return new Response(
            JSON.stringify({ success: false, error: err.message || 'Revalidation failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
