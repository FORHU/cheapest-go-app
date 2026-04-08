/**
 * Mystifly Cancel Booking — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-cancel
 *
 * Cancels a confirmed Mystifly booking.
 * UniqueID must start with MF followed by 8 digits.
 *
 * POST body: { uniqueId: string }
 *
 * Response: { success, refundAmount, penaltyAmount, currency, cancellationId, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { cancelBooking, MystiflyError } from '../_shared/mystiflyClient.ts';

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
            return jsonResponse(corsHeaders, { success: false, error: 'uniqueId is required' }, 400);
        }

        console.log(`[mystifly-cancel] Cancelling booking: ${uniqueId}`);

        const raw = await cancelBooking(uniqueId);
        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-cancel] Raw response for ${uniqueId}:`, JSON.stringify(raw).slice(0, 300));

        if (!raw.Success) {
            const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
            const code = errors[0]?.Code ?? '';
            const msg = errors[0]?.Message ?? raw.Message ?? 'Cancellation failed';

            // ERCBN005 = already cancelled
            const alreadyCancelled = code === 'ERCBN005' || /already cancelled/i.test(msg);

            console.warn(`[mystifly-cancel] Failed (${code}): ${msg}`);

            return jsonResponse(corsHeaders, {
                success: false,
                alreadyCancelled,
                error: msg,
                code,
                durationMs,
            });
        }

        const data = raw.Data ?? raw;

        // Mystifly cancel response may include refund/penalty info
        const refundAmount = Number(data.RefundAmount ?? data.refundAmount ?? 0);
        const penaltyAmount = Number(data.PenaltyAmount ?? data.penaltyAmount ?? 0);
        const currency = data.Currency ?? data.currency ?? 'USD';
        const cancellationId = data.CancellationId ?? data.UniqueID ?? uniqueId;

        console.log(`[mystifly-cancel] Success: ${uniqueId}, refund=${refundAmount} ${currency}, penalty=${penaltyAmount}, ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            refundAmount,
            penaltyAmount,
            currency,
            cancellationId,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-cancel] Error:', err.message);

        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'Cancellation failed', durationMs },
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
