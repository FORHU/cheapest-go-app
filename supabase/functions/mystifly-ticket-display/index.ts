/**
 * Mystifly TicketDisplay — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-ticket-display
 *
 * Fetches ticket details from Mystifly CoreAPI for a specific e-ticket number.
 * Returns fare breakdown, grand total, itinerary details, endorsement restrictions.
 *
 * POST body: { mfRef: string, ticketNumber: string }
 *
 * Response: { success, ticketData, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { getTicketDisplay, MystiflyError } from '../_shared/mystiflyClient.ts';

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { mfRef, ticketNumber } = body;

        if (!mfRef || !ticketNumber) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'mfRef and ticketNumber are required' },
                400,
            );
        }

        console.log(`[mystifly-ticket-display] Fetching ticket display for ${mfRef} / ${ticketNumber}`);

        const raw = await getTicketDisplay(mfRef, ticketNumber);
        const durationMs = Date.now() - startMs;

        if (raw.Success === false) {
            const msg: string = raw.Message ?? raw.Errors?.[0]?.Message ?? 'TicketDisplay request failed';
            console.warn(`[mystifly-ticket-display] API returned failure: ${msg}`);
            return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
        }

        console.log(`[mystifly-ticket-display] Success for ${mfRef}/${ticketNumber}, ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            ticketData: raw.Data ?? raw,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-ticket-display] Error:', err.message);
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'TicketDisplay request failed', durationMs },
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
