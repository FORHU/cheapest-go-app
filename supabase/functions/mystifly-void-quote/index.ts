/**
 * Mystifly Void Quote — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-void-quote
 *
 * Gets a void quote for a ticketed Mystifly booking.
 * Returns the voiding window and per-passenger refund amounts.
 *
 * POST body: { mfRef: string, passengers: Array<{ firstName, lastName, title, eTicket, passengerType }> }
 *
 * Response: { success, ptrId, ptrStatus, voidingWindow, slaMinutes, voidQuotes, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { voidQuote, MystiflyError, type VoidOriginDestination } from '../_shared/mystiflyClient.ts';

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { mfRef, passengers, originDestinations } = body;

        if (!mfRef) {
            return jsonResponse(corsHeaders, { success: false, error: 'mfRef is required' }, 400);
        }
        if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
            return jsonResponse(corsHeaders, { success: false, error: 'passengers array is required' }, 400);
        }
        if (!originDestinations || !Array.isArray(originDestinations) || originDestinations.length === 0) {
            return jsonResponse(corsHeaders, { success: false, error: 'originDestinations array is required' }, 400);
        }

        console.log(`[mystifly-void-quote] Getting void quote for: ${mfRef}`);

        const raw = await voidQuote(mfRef, passengers, originDestinations as VoidOriginDestination[]);
        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-void-quote] Raw response for ${mfRef}:`, JSON.stringify(raw).slice(0, 500));

        if (!raw.Success) {
            const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
            const code = errors[0]?.Code ?? '';
            const msg = errors[0]?.Message ?? raw.Message ?? 'Void quote failed';
            console.warn(`[mystifly-void-quote] Failed (${code}): ${msg}`);
            return jsonResponse(corsHeaders, { success: false, error: msg, code, durationMs });
        }

        const data = raw.Data ?? raw;

        return jsonResponse(corsHeaders, {
            success: true,
            ptrId: data.PTRId ?? null,
            ptrStatus: data.PTRStatus ?? null,
            voidingWindow: data.VoidingWindow ?? null,
            slaMinutes: data.SLAInMinutes ?? 0,
            voidQuotes: data.VoidQuotes ?? [],
            mfRef: data.MfRef ?? mfRef,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-void-quote] Error:', err.message);
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'Void quote failed', durationMs },
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
