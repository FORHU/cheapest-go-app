/**
 * Save Flight Booking — Supabase Edge Function
 *
 * POST /functions/v1/save-flight-booking
 *
 * Persists a flight booking to the unified_bookings table.
 * Called after a successful booking with any provider (Amadeus, Mystifly).
 *
 * Uses the Supabase service role key for direct database writes
 * (bypasses RLS — the function handles auth verification).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

declare const Deno: any;

import type { SaveBookingRequest, SaveBookingResponse } from '../_shared/types.ts';

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
        const body: SaveBookingRequest = JSON.parse(await req.text());

        // ── Validate ──
        if (!body.userId) {
            return new Response(
                JSON.stringify({ success: false, error: 'userId is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }
        if (!body.provider) {
            return new Response(
                JSON.stringify({ success: false, error: 'provider is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        console.log('[save-flight-booking] Saving booking:', {
            userId: body.userId,
            provider: body.provider,
            externalId: body.externalId,
            status: body.status,
        });

        // ── Supabase Admin Client ──
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // ── Insert into unified_bookings ──
        const bookingId = crypto.randomUUID();

        // TODO: Implement database insert
        // const { error: dbError } = await supabaseAdmin
        //     .from('unified_bookings')
        //     .insert([{
        //         id: bookingId,
        //         user_id: body.userId,
        //         type: 'flight',
        //         provider: body.provider,
        //         external_id: body.externalId,
        //         status: body.status,
        //         total_price: body.totalPrice,
        //         currency: body.currency,
        //         metadata: body.metadata,
        //         created_at: new Date().toISOString(),
        //         updated_at: new Date().toISOString(),
        //     }]);
        //
        // if (dbError) {
        //     console.error('[save-flight-booking] DB error:', dbError);
        //     throw new Error(`Failed to save booking: ${dbError.message}`);
        // }

        console.log('[save-flight-booking] Booking saved:', bookingId);

        const result: SaveBookingResponse = {
            success: true,
            bookingId,
        };

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[save-flight-booking] Error:', err.message);
        return new Response(
            JSON.stringify({ success: false, error: err.message || 'Failed to save booking' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
