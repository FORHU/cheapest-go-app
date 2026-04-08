/**
 * Mystifly Booking Note — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-booking-note
 *
 * Adds one or more notes to an existing Mystifly booking.
 * UniqueID must start with MF followed by 8 digits.
 *
 * POST body: { uniqueId: string, notes: string[] }
 *
 * Response: { success, bookingRef, createdOn, durationMs }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { addBookingNote, MystiflyError } from '../_shared/mystiflyClient.ts';

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { uniqueId, notes } = body;

        if (!uniqueId) {
            return jsonResponse(corsHeaders, { success: false, error: 'uniqueId is required' }, 400);
        }
        if (!notes || !Array.isArray(notes) || notes.length === 0) {
            return jsonResponse(corsHeaders, { success: false, error: 'notes must be a non-empty array' }, 400);
        }

        console.log(`[mystifly-booking-note] Adding ${notes.length} note(s) to: ${uniqueId}`);

        const raw = await addBookingNote(uniqueId, notes);
        const durationMs = Date.now() - startMs;

        if (!raw.Success) {
            const msg: string = raw.Message ?? raw.Data?.Errors?.[0]?.Message ?? 'BookingNote request failed';
            console.warn(`[mystifly-booking-note] Failed: ${msg}`);
            return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
        }

        const data = raw.Data ?? raw;
        console.log(`[mystifly-booking-note] Success for ${uniqueId}, ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            bookingRef: data.BookingRef,
            createdOn: data.CreatedOn,
            createdByName: data.CreatedByName,
            noteDetails: data.NoteDetails,
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        console.error('[mystifly-booking-note] Error:', err.message);
        return jsonResponse(corsHeaders,
            { success: false, error: err.message || 'BookingNote request failed', durationMs },
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
