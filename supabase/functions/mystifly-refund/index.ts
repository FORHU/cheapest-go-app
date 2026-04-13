/**
 * Mystifly Refund — Supabase Edge Function
 *
 * Handles the post-ticketing refund flow per Mystifly /api/Refund docs:
 *   step=quote   → AcceptQuote:"None"   — get refund breakdown + PTRId
 *   step=execute → AcceptQuote:"Accept" — execute the refund
 *
 * POST body:
 *   { step: "quote",   mfRef, passengers, originDestinations }
 *   { step: "execute", mfRef, passengers, ptrId, originDestinations, refundDetails, bookingId? }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { refundQuote, executeRefund, MystiflyError, type VoidOriginDestination } from '../_shared/mystiflyClient.ts';

declare const Deno: any;

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { step } = body;

        if (!step || !['quote', 'execute'].includes(step)) {
            return jsonResponse(corsHeaders, { success: false, error: 'step must be "quote" or "execute"' }, 400);
        }

        // ── Step 1: Refund Quote (AcceptQuote: "None") ───────────────
        if (step === 'quote') {
            const { mfRef, passengers, originDestinations } = body;
            if (!mfRef || !passengers?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'mfRef and passengers are required' }, 400);
            }
            if (!originDestinations?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'originDestinations is required' }, 400);
            }

            console.log(`[mystifly-refund] RefundQuote for ${mfRef}`);
            const raw = await refundQuote(mfRef, passengers, originDestinations as VoidOriginDestination[]);
            const durationMs = Date.now() - startMs;
            console.log(`[mystifly-refund] RefundQuote response:`, JSON.stringify(raw).slice(0, 500));

            if (!raw.Success) {
                const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
                const msg = errors[0]?.Message ?? raw.Message ?? 'RefundQuote failed';
                return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
            }

            const data = raw.Data ?? raw;
            return jsonResponse(corsHeaders, {
                success: true,
                ptrId: data.PTRId ?? null,
                ptrStatus: data.PTRStatus ?? null,
                ptrFee: data.PTRFee ?? 0,
                refundDetails: data.RefundDetails ?? [],
                passengerChanges: data.PassengerChanges ?? data.RefundDetails ?? [],
                totalAmountChanges: data.TotalAmountChanges ?? [],
                mfRef: data.MfRef ?? mfRef,
                durationMs,
            });
        }

        // ── Step 2: Execute Refund (AcceptQuote: "Accept") ──────────
        if (step === 'execute') {
            const { mfRef, passengers, ptrId, originDestinations, refundDetails, bookingId } = body;
            if (!mfRef || !passengers?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'mfRef and passengers are required' }, 400);
            }
            if (!originDestinations?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'originDestinations is required' }, 400);
            }

            console.log(`[mystifly-refund] Executing Refund for ${mfRef}, ptrId: ${ptrId}`);
            const raw = await executeRefund(
                mfRef,
                passengers,
                Number(ptrId ?? 0),
                originDestinations as VoidOriginDestination[],
                refundDetails ?? [],
            );
            const durationMs = Date.now() - startMs;
            console.log(`[mystifly-refund] Refund response:`, JSON.stringify(raw).slice(0, 500));

            if (!raw.Success) {
                const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
                const msg = errors[0]?.Message ?? raw.Message ?? 'Refund failed';
                return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
            }

            // Mark booking as refunded in DB
            if (bookingId) {
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                if (supabaseUrl && serviceRoleKey) {
                    const supabase = createClient(supabaseUrl, serviceRoleKey);
                    await supabase
                        .from('flight_bookings')
                        .update({ status: 'refunded', notes: `Refund submitted — MF: ${mfRef}` })
                        .eq('id', bookingId);
                }
            }

            const data = raw.Data ?? raw;
            return jsonResponse(corsHeaders, {
                success: true,
                ptrId: data.PTRId ?? null,
                ptrStatus: data.PTRStatus ?? null,
                message: data.Message ?? 'Refund submitted successfully.',
                durationMs,
            });
        }

    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-refund] Error:', err.message);
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders, { success: false, error: err.message || 'Refund request failed', durationMs }, status);
    }
});

function jsonResponse(headers: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
    });
}
