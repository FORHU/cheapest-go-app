/**
 * Save Flight Booking — Supabase Edge Function
 *
 * POST /functions/v1/save-flight-booking
 *
 * Persists a flight booking to the unified_bookings table after a
 * successful provider booking (Mystifly or Duffel).
 *
 * Uses the Supabase service role key for direct database writes
 * (bypasses RLS — the function validates userId).
 *
 * POST body: SaveBookingRequest
 *   {
 *     userId, provider, externalId, status, totalPrice, currency,
 *     metadata: { pnr, offerId, passengers, contact, segments, traceId, ... }
 *   }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

import type { SaveBookingRequest, SaveBookingResponse } from '../_shared/types.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = ALLOWED_ORIGINS.length > 0
        ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : '*';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const body: SaveBookingRequest = JSON.parse(await req.text());

        if (!body.userId) {
            return jsonResponse(corsHeaders, { success: false, error: 'userId is required' }, 400);
        }
        if (!body.provider) {
            return jsonResponse(corsHeaders, { success: false, error: 'provider is required' }, 400);
        }
        if (!body.externalId) {
            return jsonResponse(corsHeaders, { success: false, error: 'externalId is required' }, 400);
        }
        if (body.totalPrice == null || body.totalPrice < 0) {
            return jsonResponse(corsHeaders, { success: false, error: 'totalPrice must be a non-negative number' }, 400);
        }

        console.log('[save-flight-booking] Saving:', {
            userId: body.userId,
            provider: body.provider,
            externalId: body.externalId,
            status: body.status,
            totalPrice: body.totalPrice,
            currency: body.currency,
        });

        // ── Supabase Admin Client (bypasses RLS) ──
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

        // ── Check for duplicate (idempotency) ──
        const { data: existing } = await supabaseAdmin
            .from('unified_bookings')
            .select('id')
            .eq('external_id', body.externalId)
            .eq('provider', body.provider)
            .maybeSingle();

        if (existing) {
            console.log(`[save-flight-booking] Duplicate detected, returning existing: ${existing.id}`);
            return jsonResponse(corsHeaders, {
                success: true,
                bookingId: existing.id,
            } satisfies SaveBookingResponse);
        }

        // ── Insert into unified_bookings ──
        const now = new Date().toISOString();

        const { data: inserted, error: dbError } = await supabaseAdmin
            .from('unified_bookings')
            .insert({
                user_id: body.userId,
                type: 'flight',
                provider: body.provider,
                external_id: body.externalId,
                status: body.status ?? 'pending',
                total_price: body.totalPrice,
                currency: body.currency ?? 'USD',
                metadata: body.metadata ?? {},
                created_at: now,
                updated_at: now,
            })
            .select('id')
            .single();

        if (dbError) {
            console.error('[save-flight-booking] DB error:', dbError);
            throw new Error(`Database insert failed: ${dbError.message}`);
        }

        const bookingId: string = inserted.id;

        console.log(`[save-flight-booking] Saved: ${bookingId} in ${Date.now() - startMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            bookingId,
        } satisfies SaveBookingResponse);
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[save-flight-booking] Error:', err.message);

        return jsonResponse(corsHeaders,
            { success: false, bookingId: '', error: err.message || 'Failed to save booking' },
            500,
        );
    }
});

function jsonResponse(headers: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
}
