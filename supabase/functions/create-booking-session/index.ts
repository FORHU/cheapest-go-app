/**
 * Create Booking Session — Supabase Edge Function
 *
 * POST /functions/v1/create-booking-session
 *
 * Stores temporary passenger + selected flight data before the real
 * booking is confirmed. Sessions expire after 30 minutes.
 *
 * POST body:
 *   { userId, provider, flight, passengers, contact }
 *
 * Returns:
 *   { success: true, sessionId: string }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SESSION_TTL_MINUTES = 30;

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
    provider: 'mystifly' | 'amadeus';
    flight: Record<string, unknown>;
    passengers: BookingSessionPassenger[];
    contact: BookingSessionContact;
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const body: CreateBookingSessionBody = JSON.parse(await req.text());

        if (!body.userId) {
            return jsonResponse({ success: false, error: 'userId is required' }, 400);
        }
        if (!body.provider || !['mystifly', 'amadeus'].includes(body.provider)) {
            return jsonResponse({ success: false, error: 'provider must be "mystifly" or "amadeus"' }, 400);
        }
        if (!body.flight || typeof body.flight !== 'object') {
            return jsonResponse({ success: false, error: 'flight object is required' }, 400);
        }
        if (!Array.isArray(body.passengers) || body.passengers.length === 0) {
            return jsonResponse({ success: false, error: 'At least one passenger is required' }, 400);
        }

        // Validate each passenger
        for (let i = 0; i < body.passengers.length; i++) {
            const pax = body.passengers[i];
            if (!pax.type || !['ADT', 'CHD', 'INF'].includes(pax.type)) {
                return jsonResponse(
                    { success: false, error: `Passenger ${i + 1}: type must be ADT, CHD, or INF` },
                    400,
                );
            }
            if (!pax.firstName || !pax.lastName) {
                return jsonResponse(
                    { success: false, error: `Passenger ${i + 1}: firstName and lastName are required` },
                    400,
                );
            }
            if (!pax.gender) {
                return jsonResponse(
                    { success: false, error: `Passenger ${i + 1}: gender is required` },
                    400,
                );
            }
            if (!pax.birthDate) {
                return jsonResponse(
                    { success: false, error: `Passenger ${i + 1}: birthDate is required` },
                    400,
                );
            }
        }

        // Validate contact
        if (!body.contact?.email) {
            return jsonResponse({ success: false, error: 'contact.email is required' }, 400);
        }
        if (!body.contact?.phone) {
            return jsonResponse({ success: false, error: 'contact.phone is required' }, 400);
        }

        console.log('[create-booking-session] Creating session:', {
            userId: body.userId,
            provider: body.provider,
            passengerCount: body.passengers.length,
            contactEmail: body.contact.email,
        });

        // ── Supabase Admin Client (bypasses RLS) ──
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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
                flight: body.flight,
                passengers: body.passengers,
                contact: body.contact,
                status: 'pending',
                expires_at: expiresAt.toISOString(),
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
            });

        if (dbError) {
            console.error('[create-booking-session] DB error:', dbError);
            throw new Error(`Database insert failed: ${dbError.message}`);
        }

        const durationMs = Date.now() - startMs;

        console.log(`[create-booking-session] Created: ${sessionId} (expires ${expiresAt.toISOString()}) in ${durationMs}ms`);

        return jsonResponse({
            success: true,
            sessionId,
        });
    } catch (err: any) {
        console.error('[create-booking-session] Error:', err.message);

        return jsonResponse(
            { success: false, error: err.message || 'Failed to create booking session' },
            500,
        );
    }
});

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
