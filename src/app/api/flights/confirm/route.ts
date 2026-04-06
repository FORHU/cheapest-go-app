import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createClient } from '@supabase/supabase-js';
import { sendFlightBookingConfirmationEmail, sendFlightAwaitingTicketEmail } from '@/lib/server/email';
import { rateLimit } from '@/lib/server/rate-limit';
import { z } from 'zod';

const flightConfirmSchema = z.object({
    paymentIntentId: z.string().min(1, 'paymentIntentId is required'),
    sessionId: z.string().min(1, 'sessionId is required'),
});

export const dynamic = 'force-dynamic';

/**
 * POST /api/flights/confirm
 *
 * Architecture: Webhook is PRIMARY. This endpoint is a UX fallback only.
 *
 * Mystifly (manual capture):
 *   Checks paymentIntent.status === 'requires_capture'
 *   → DB first: webhook already booked? Return PNR
 *   → Fallback: call create-booking (which captures/cancels Stripe after Mystifly responds)
 *
 * Duffel (automatic capture):
 *   Checks paymentIntent.status === 'succeeded'
 *   → DB first: webhook already booked? Return PNR
 *   → Fallback: call create-booking + issue-ticket
 *
 * Body: { paymentIntentId: string, sessionId: string }
 */
export async function POST(req: NextRequest) {
    // 10 confirm attempts per minute per IP
    const rl = rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'flights-confirm' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        const { user, error: authError } = await getAuthenticatedUser();
        const { env } = await import("@/utils/env");
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const rawBody = await req.json();
        const confirmParsed = flightConfirmSchema.safeParse(rawBody);
        if (!confirmParsed.success) {
            return NextResponse.json(
                { success: false, error: confirmParsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 },
            );
        }
        const { paymentIntentId, sessionId } = confirmParsed.data;

        // Service-role client for all DB operations
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // ── Step 1: Verify payment server-side (never trust the client) ──────
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const provider = paymentIntent.metadata?.provider ?? '';
        const isMystifly = provider === 'mystifly' || provider === 'mystifly_v2';

        // Validate this PaymentIntent belongs to this session
        if (paymentIntent.metadata?.bookingSessionId !== sessionId) {
            return NextResponse.json({ success: false, error: 'Session/payment mismatch' }, { status: 403 });
        }

        // ── Step 2: DB-first check — webhook may have already processed it ─
        // If booking exists, return it immediately regardless of PI status.
        // (Webhook may have already captured → PI is now 'succeeded' for Mystifly too)
        const { data: existingBooking } = await supabase
            .from('flight_bookings')
            .select('id, pnr, status, payment_intent_id')
            .eq('session_id', sessionId)
            .maybeSingle();

        if (existingBooking) {
            // Security: prevent session-swapping attacks.
            if (existingBooking.payment_intent_id && existingBooking.payment_intent_id !== paymentIntentId) {
                console.error('[/confirm] payment_intent_id mismatch — possible session swap attack', {
                    stored: existingBooking.payment_intent_id,
                    received: paymentIntentId,
                    sessionId,
                });
                return NextResponse.json({ success: false, error: 'Payment mismatch' }, { status: 403 });
            }

            // Booking already failed — don't retry, surface the error directly
            if (existingBooking.status === 'failed') {
                console.log('[/confirm] Booking already failed for session:', sessionId);
                return NextResponse.json({
                    success: false,
                    error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
                }, { status: 400 });
            }

            if (existingBooking.pnr) {
                console.log('[/confirm] Webhook already ran, returning existing booking. PNR:', existingBooking.pnr);
                return NextResponse.json({
                    success: true,
                    bookingId: existingBooking.id,
                    pnr: existingBooking.pnr,
                    status: existingBooking.status,
                    source: 'webhook',
                });
            }
        }

        // ── Step 3: Strict per-provider status check (fallback path only) ───
        // Webhook hasn't run yet — validate the PI is in the correct state
        // before we trigger booking manually.
        if (isMystifly) {
            // Mystifly: card must be authorized (held) but not yet captured
            if (paymentIntent.status !== 'requires_capture') {
                return NextResponse.json(
                    { success: false, error: `Payment not authorized for Mystifly (status: ${paymentIntent.status})` },
                    { status: 402 },
                );
            }
        } else {
            // Duffel: payment must be fully captured
            if (paymentIntent.status !== 'succeeded') {
                return NextResponse.json(
                    { success: false, error: `Payment not completed for Duffel (status: ${paymentIntent.status})` },
                    { status: 402 },
                );
            }
        }

        // ── Step 4: Webhook hasn't run yet — trigger booking as fallback ────
        // create-booking handles:
        //   Mystifly: calls supplier → if PNR → captures Stripe; if no PNR → cancels Stripe
        //   Duffel:   creates order (payment already captured)
        console.log('[/confirm] Booking not in DB, calling create-booking as fallback. Session:', sessionId);

        const edgeFnHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        };

        const bookingRes = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking`, {
            method: 'POST',
            headers: edgeFnHeaders,
            body: JSON.stringify({ sessionId }),
        });

        const bookingData = await bookingRes.json();
        console.log('[/confirm] create-booking response:', JSON.stringify(bookingData));

        if (bookingData.success) {
            // Duffel: auto-ticket if needed
            if (!isMystifly && bookingData.status !== 'ticketed' && !bookingData.alreadyBooked && bookingData.bookingId) {
                console.log('[/confirm] Auto-ticketing Duffel order:', bookingData.bookingId);
                const ticketRes = await fetch(`${env.SUPABASE_URL}/functions/v1/issue-ticket`, {
                    method: 'POST',
                    headers: edgeFnHeaders,
                    body: JSON.stringify({ bookingId: bookingData.bookingId }),
                });
                const ticketData = await ticketRes.json();
                console.log(ticketData.success ? '[/confirm] Duffel ticketing OK' : `[/confirm] Duffel ticketing failed: ${ticketData.error}`);
            }

            // Send the right email based on whether the ticket was issued immediately
            // or is still awaiting confirmation from the airline.
            if (!bookingData.alreadyBooked) {
                fireBookingEmail(supabase, sessionId, bookingData, provider)
                    .catch(e => console.error('[/confirm] Email error:', e));
            }

            return NextResponse.json({
                success: true,
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                status: bookingData.status,
                ticketStatus: bookingData.ticketStatus,
                source: 'confirm-fallback',
            });
        }

        // Booking explicitly failed
        return NextResponse.json({
            success: false,
            error: bookingData.error || 'Booking failed — your card has not been charged.',
        }, { status: 400 });
    } catch (err) {
        console.error('[/confirm] Error:', err);
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Confirmation failed' },
            { status: 500 },
        );
    }
}
// ─── Email Helpers ─────────────────────────────────────────────────────────────

/**
 * Routes to the correct email (awaiting vs confirmed) based on booking status.
 * Must not throw — always call with .catch().
 */
async function fireBookingEmail(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    sessionId: string,
    bookingData: { bookingId?: string; pnr?: string; status?: string; confirmedPrice?: number; confirmedCurrency?: string },
    provider: string,
) {
    if (!bookingData.bookingId || !bookingData.pnr) return;

    const [{ data: session }, { data: segments }] = await Promise.all([
        supabase.from('booking_sessions').select('contact, passengers').eq('id', sessionId).single(),
        supabase.from('flight_segments').select('*').eq('booking_id', bookingData.bookingId),
    ]);

    const email = (session as any)?.contact?.email;
    if (!email) { console.warn('[Email] No contact email in session', sessionId); return; }

    const pax0 = (session as any)?.passengers?.[0];
    const passengerName = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';

    const mappedSegments = ((segments as any[]) ?? []).map((s: any) => ({
        airline: s.airline,
        flightNumber: s.flight_number,
        origin: s.origin,
        destination: s.destination,
        departureTime: s.departure,
        arrivalTime: s.arrival,
    }));

    const isAwaiting = bookingData.status === 'awaiting_ticket';

    if (isAwaiting) {
        // Email 1: amber — seat held, e-ticket still processing
        const result = await sendFlightAwaitingTicketEmail({
            bookingId: bookingData.bookingId,
            pnr: bookingData.pnr,
            email,
            passengerName,
            segments: mappedSegments,
            totalPrice: bookingData.confirmedPrice ?? 0,
            currency: bookingData.confirmedCurrency ?? 'USD',
        });
        console.log('[Email] Awaiting-ticket email sent:', result.success, result.error ?? '');
    } else {
        // Email 2A: green — e-ticket issued immediately
        const result = await sendFlightBookingConfirmationEmail({
            bookingId: bookingData.bookingId,
            pnr: bookingData.pnr,
            email,
            passengerName,
            provider,
            segments: mappedSegments,
            totalPrice: bookingData.confirmedPrice ?? 0,
            currency: bookingData.confirmedCurrency ?? 'USD',
        });
        console.log('[Email] Confirmation email sent:', result.success, result.error ?? '');
    }
}
