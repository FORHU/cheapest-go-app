/**
 * Mystifly Refund — Supabase Edge Function
 *
 * Handles the post-ticketing refund flow per Mystifly docs:
 *   step=quote   → ptrType:"RefundQuote" — get quote & PTRId
 *   step=get     → ptrType:"GetQuote"    — fetch refund breakdown
 *   step=execute → ptrType:"Refund"      — execute the refund (mFRef + passengers)
 *
 * POST body:
 *   { step: "quote",   mfRef, passengers }
 *   { step: "get",     ptrId }
 *   { step: "execute", mfRef, passengers, bookingId? }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { refundQuote, getRefundQuote, executeRefund, MystiflyError } from '../_shared/mystiflyClient.ts';

declare const Deno: any;

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { step } = body;

        if (!step || !['quote', 'get', 'execute'].includes(step)) {
            return jsonResponse(corsHeaders, { success: false, error: 'step must be "quote", "get", or "execute"' }, 400);
        }

        // ── Step 1: RefundQuote ──────────────────────────────────────
        if (step === 'quote') {
            const { mfRef, passengers } = body;
            if (!mfRef || !passengers?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'mfRef and passengers are required' }, 400);
            }

            console.log(`[mystifly-refund] RefundQuote for ${mfRef}`);
            const raw = await refundQuote(mfRef, passengers);
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
                mfRef: data.MfRef ?? mfRef,
                durationMs,
            });
        }

        // ── Step 2: GetQuote ─────────────────────────────────────────
        if (step === 'get') {
            const { ptrId } = body;
            if (!ptrId) return jsonResponse(corsHeaders, { success: false, error: 'ptrId is required' }, 400);

            console.log(`[mystifly-refund] GetQuote for PTRId ${ptrId}`);
            const raw = await getRefundQuote(ptrId);
            const durationMs = Date.now() - startMs;
            console.log(`[mystifly-refund] GetQuote response:`, JSON.stringify(raw).slice(0, 500));

            if (!raw.Success) {
                const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
                const msg = errors[0]?.Message ?? raw.Message ?? 'GetQuote failed';
                return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
            }

            const data = raw.Data ?? raw;
            return jsonResponse(corsHeaders, {
                success: true,
                ptrId: data.PTRId ?? ptrId,
                ptrStatus: data.PTRStatus ?? null,
                ptrFee: data.PTRFee ?? 0,
                passengerChanges: data.PassengerChanges ?? [],
                totalAmountChanges: data.TotalAmountChanges ?? [],
                durationMs,
            });
        }

        // ── Step 3: Execute Refund (ptrType: "Refund") ───────────────
        if (step === 'execute') {
            const { mfRef, passengers, bookingId } = body;
            if (!mfRef || !passengers?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'mfRef and passengers are required' }, 400);
            }

            console.log(`[mystifly-refund] Executing Refund for ${mfRef}`);
            const raw = await executeRefund(mfRef, passengers);
            const durationMs = Date.now() - startMs;
            console.log(`[mystifly-refund] Refund response:`, JSON.stringify(raw).slice(0, 500));

            if (!raw.Success) {
                const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
                const msg = errors[0]?.Message ?? raw.Message ?? 'Refund failed';
                return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
            }

            // Mark booking as cancelled in DB
            if (bookingId) {
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                if (supabaseUrl && serviceRoleKey) {
                    const supabase = createClient(supabaseUrl, serviceRoleKey);
                    await supabase
                        .from('flight_bookings')
                        .update({ status: 'cancelled', notes: `Refund submitted — MF: ${mfRef}` })
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
