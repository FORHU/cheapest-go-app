/**
 * Create Booking Session — Supabase Edge Function
 *
 * POST /functions/v1/create-booking-session
 *
 * Stores temporary passenger + selected flight data before the real
 * booking is confirmed. Sessions expire after 30 minutes.
 *
 * SECURITY: Called via service role key from Next.js API route (which verifies JWT).
 * Includes idempotency check to prevent duplicate sessions.
 *
 * POST body:
 *   { userId, provider, flight, passengers, contact, idempotencyKey? }
 *
 * Returns:
 *   { success: true, sessionId: string }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    // MED-5 FIX: Restrict CORS to configured origins (falls back to permissive only if unconfigured)
    const allowedOrigin = ALLOWED_ORIGINS.length > 0
        ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : '*';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

const SESSION_TTL_MINUTES = 15;

// ─── Request Body ───────────────────────────────────────────────────

interface BookingSessionPassenger {
    type: 'ADT' | 'CHD' | 'INF';
    firstName: string;
    lastName: string;
    gender: string;
    birthDate: string;
    passport?: string;
}

interface BookingSessionContact {
    email: string;
    phone: string;
}

interface CreateBookingSessionBody {
    userId: string;
    provider: 'mystifly' | 'duffel' | 'mystifly_v2';
    flight: Record<string, unknown>;
    passengers: BookingSessionPassenger[];
    contact: BookingSessionContact;
    idempotencyKey?: string;
    /** Indicative fare policy from search stage. Will be overwritten after revalidation. */
    farePolicy?: {
        isRefundable?: boolean;
        isChangeable?: boolean;
        refundPenaltyAmount?: number | null;
        refundPenaltyCurrency?: string | null;
        changePenaltyCurrency?: string | null;
        policySource?: string;
        policyVersion?: string;
        rawSupplierPolicy?: unknown;
    };
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const body: CreateBookingSessionBody = JSON.parse(await req.text());

        if (!body.userId) {
            return jsonResponse(corsHeaders, { success: false, error: 'userId is required' }, 400);
        }
        if (!body.provider || !['mystifly', 'duffel', 'mystifly_v2'].includes(body.provider)) {
            return jsonResponse(corsHeaders, { success: false, error: 'invalid provider string passed' }, 400);
        }
        if (!body.flight || typeof body.flight !== 'object') {
            return jsonResponse(corsHeaders, { success: false, error: 'flight object is required' }, 400);
        }
        if (!Array.isArray(body.passengers) || body.passengers.length === 0) {
            return jsonResponse(corsHeaders, { success: false, error: 'At least one passenger is required' }, 400);
        }

        // Validate each passenger
        for (let i = 0; i < body.passengers.length; i++) {
            const pax = body.passengers[i];
            if (!pax.type || !['ADT', 'CHD', 'INF'].includes(pax.type)) {
                return jsonResponse(corsHeaders,
                    { success: false, error: `Passenger ${i + 1}: type must be ADT, CHD, or INF` },
                    400,
                );
            }
            if (!pax.firstName || !pax.lastName) {
                return jsonResponse(corsHeaders,
                    { success: false, error: `Passenger ${i + 1}: firstName and lastName are required` },
                    400,
                );
            }
            if (!pax.gender) {
                return jsonResponse(corsHeaders,
                    { success: false, error: `Passenger ${i + 1}: gender is required` },
                    400,
                );
            }
            if (!pax.birthDate) {
                return jsonResponse(corsHeaders,
                    { success: false, error: `Passenger ${i + 1}: birthDate is required` },
                    400,
                );
            }
        }

        // Validate contact
        if (!body.contact?.email) {
            return jsonResponse(corsHeaders, { success: false, error: 'contact.email is required' }, 400);
        }
        if (!body.contact?.phone) {
            return jsonResponse(corsHeaders, { success: false, error: 'contact.phone is required' }, 400);
        }

        console.log('[create-booking-session] Creating session:', {
            userId: body.userId,
            provider: body.provider,
            passengerCount: body.passengers.length,
            contactEmail: body.contact.email,
            hasIdempotencyKey: !!body.idempotencyKey,
        });

        // ── Supabase Admin Client (bypasses RLS) ──
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

        // ── HIGH-2 FIX: Idempotency check ──
        if (body.idempotencyKey) {
            const { data: existing } = await supabaseAdmin
                .from('booking_sessions')
                .select('id, status')
                .eq('idempotency_key', body.idempotencyKey)
                .eq('user_id', body.userId)
                .maybeSingle();

            if (existing) {
                if (existing.status === 'pending' || existing.status === 'booked') {
                    const durationMs = Date.now() - startMs;
                    console.log(`[create-booking-session] Returning existing session: ${existing.id} (idempotent) in ${durationMs}ms`);
                    return jsonResponse(corsHeaders, { success: true, sessionId: existing.id });
                }
            }
        }

        // ── CRITICAL-2 FIX: Strip rawOffer from stored flight data ──
        // NOTE: We MUST preserve it for Amadeus to ensure segment integrity,
        // but it remains sanitized for Mystifly as a legacy safeguard.
        const sanitizedFlight = { ...body.flight } as Record<string, unknown>;

        if (body.provider === 'mystifly' || body.provider === 'mystifly_v2') {
            delete sanitizedFlight.rawOffer;
            delete sanitizedFlight._raw;
            delete sanitizedFlight._rawOffer;
        }


        // ── Generate session ID and expiry ──
        const sessionId = crypto.randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000);

        // ── Insert into booking_sessions ──
        const { error: dbError } = await supabaseAdmin
            .from('booking_sessions')
            .insert({
                id: sessionId,
                user_id: body.userId,
                provider: body.provider,
                flight: sanitizedFlight,
                passengers: body.passengers,
                contact: body.contact,
                status: 'pending',
                expires_at: expiresAt.toISOString(),
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
                ...(body.idempotencyKey ? { idempotency_key: body.idempotencyKey } : {}),
                // Fare policy — indicative at this stage, locked=false
                ...(body.farePolicy ? {
                    fare_policy: { ...body.farePolicy, policyVersion: 'search' },
                    policy_source: body.farePolicy.policySource ?? null,
                    policy_version: 'search',
                    policy_locked: false,
                } : { policy_locked: false }),
            });

        if (dbError) {
            console.error('[create-booking-session] DB error:', dbError);
            throw new Error(`Database insert failed: ${dbError.message}`);
        }

        const durationMs = Date.now() - startMs;

        console.log(`[create-booking-session] Created: ${sessionId} (expires ${expiresAt.toISOString()}) in ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            sessionId,
        });
    } catch (err: any) {
        console.error('[create-booking-session] Error:', err.message);

        return jsonResponse(getCorsHeaders(req),
            { success: false, error: err.message || 'Failed to create booking session' },
            500,
        );
    }
});

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(corsHeaders: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
