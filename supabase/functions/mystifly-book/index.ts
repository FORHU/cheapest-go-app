import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { CreateBookingRequest, CreateBookingResponse } from '../_shared/types.ts';
import { createSession, bookFlight } from '../_shared/mystiflyClient.ts';

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
        const body: CreateBookingRequest = JSON.parse(await req.text());

        // ── Validate ──
        if (!body.traceId) {
            return new Response(
                JSON.stringify({ success: false, error: 'traceId (fareSourceCode) is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }
        if (!body.passengers?.length) {
            return new Response(
                JSON.stringify({ success: false, error: 'At least one passenger is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }
        if (!body.contact?.email || !body.contact?.phone) {
            return new Response(
                JSON.stringify({ success: false, error: 'Contact email and phone are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        console.log('[mystifly-book] Booking flight:', {
            passengerCount: body.passengers.length,
            contactEmail: body.contact.email,
        });

        // ── Session + Book ──
        // TODO: Create session and book flight
        // const sessionId = await createSession();
        // const rawResponse = await bookFlight(body, sessionId);
        //
        // Parse response:
        // - Check rawResponse.Success
        // - Extract UniqueID (= bookingId / PNR)
        // - Map Status to our BookingStatus enum
        // - Return CreateBookingResponse

        const result: CreateBookingResponse = {
            success: false,
            bookingId: '',
            pnr: '',
            status: 'failed',
            price: 0,
            currency: 'USD',
            error: 'mystifly-book not yet implemented',
        }; // placeholder

        console.log('[mystifly-book] Result:', {
            success: result.success,
            bookingId: result.bookingId,
            status: result.status,
        });

        return new Response(
            JSON.stringify(result),
            {
                status: result.success ? 200 : 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
        );
    } catch (err: any) {
        console.error('[mystifly-book] Error:', err.message);
        return new Response(
            JSON.stringify({ success: false, error: err.message || 'Booking failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
