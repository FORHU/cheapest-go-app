/**
 * Mystifly Void — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-void
 *
 * Executes a void (refund) for a ticketed Mystifly booking.
 * Call this AFTER getting a VoidQuote and confirming with the user.
 *
 * POST body: { mfRef: string, passengers: Array<{ firstName, lastName, title, eTicket, passengerType }> }
 *
 * Response: { success, ptrId, ptrStatus, slaMinutes, passengerChanges, totalAmountChanges, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

import { voidBooking, MystiflyError } from '../_shared/mystiflyClient.ts';

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { mfRef, passengers, bookingId } = body;

        if (!mfRef) {
            return jsonResponse(corsHeaders, { success: false, error: 'mfRef is required' }, 400);
        }
        if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
            return jsonResponse(corsHeaders, { success: false, error: 'passengers array is required' }, 400);
        }

        console.log(`[mystifly-void] Executing void for: ${mfRef}`);

        const raw = await voidBooking(mfRef, passengers);
        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-void] Raw response for ${mfRef}:`, JSON.stringify(raw).slice(0, 500));

        if (!raw.Success) {
            const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
            const code = errors[0]?.Code ?? '';
            const msg = errors[0]?.Message ?? raw.Message ?? 'Void failed';
            console.warn(`[mystifly-void] Failed (${code}): ${msg}`);
            return jsonResponse(corsHeaders, { success: false, error: msg, code, durationMs });
        }

        const data = raw.Data ?? raw;

        // Update booking status to 'voided' in DB if bookingId provided
        if (bookingId) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            if (supabaseUrl && serviceRoleKey) {
                const supabase = createClient(supabaseUrl, serviceRoleKey);
                await supabase
                    .from('flight_bookings')
                    .update({ status: 'cancelled', notes: `Voided via PostTicketingRequest PTR: ${data.PTRId ?? ''}` })
                    .eq('id', bookingId);
                console.log(`[mystifly-void] Booking ${bookingId} marked as cancelled`);
            }
        }

        return jsonResponse(corsHeaders, {
            success: true,
            ptrId: data.PTRId ?? null,
            ptrStatus: data.PTRStatus ?? data.Status ?? null,
            slaMinutes: data.SLAInMinutes ?? 0,
            toBeVoidedBy: data.ToBeVoidedBy ?? null,
            passengerChanges: data.PassengerChanges ?? [],
            totalAmountChanges: data.TotalAmountChanges ?? [],
            mfRef: data.MfRef ?? mfRef,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-void] Error:', err.message);
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'Void failed', durationMs },
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
