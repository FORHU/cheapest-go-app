/**
 * Mystifly FareRules — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-fare-rules
 *
 * Returns airline fare rules for a given FareSourceCode.
 * Must be called before or during booking to present fare conditions.
 * FSC expires ~20 minutes after search for pre-booking requests.
 *
 * POST body: { fareSourceCode: string }
 *
 * Response: { success, fareRules: FareRule[], conversationId, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { getFareRules, MystiflyError } from '../_shared/mystiflyClient.ts';

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { fareSourceCode } = body;

        if (!fareSourceCode) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'fareSourceCode is required' },
                400,
            );
        }

        console.log('[mystifly-fare-rules] Fetching fare rules for FSC');

        const raw = await getFareRules(fareSourceCode);
        const durationMs = Date.now() - startMs;

        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            console.warn(`[mystifly-fare-rules] API returned failure: ${msg}`);
            return jsonResponse(corsHeaders, {
                success: false,
                error: msg || 'FareRules request failed',
                durationMs,
            });
        }

        // FareRules is an array; each item has Airline, CityPair, FcaDetails,
        // Category, Rules, Ruletext, Target fields per Mystifly docs.
        const fareRules: any[] = raw.Data?.FareRules ?? raw.FareRules ?? [];

        console.log(`[mystifly-fare-rules] ${fareRules.length} rule(s) returned, ${durationMs}ms`);
        if (fareRules.length > 0) console.log('[mystifly-fare-rules] raw rules:', JSON.stringify(fareRules));

        return jsonResponse(corsHeaders, {
            success: true,
            fareRules,
            conversationId: raw.Data?.ConversationId ?? raw.ConversationId ?? null,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;

        console.error('[mystifly-fare-rules] Error:', err.message);

        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'FareRules request failed', durationMs },
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
