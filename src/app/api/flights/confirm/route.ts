import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import { sendFlightBookingConfirmationEmail, sendFlightAwaitingTicketEmail } from '@/lib/server/email';
import { rateLimit } from '@/lib/server/rate-limit';
import { createNotification } from '@/lib/server/admin/notify';
import { awaitBookingRow } from '@/lib/server/flights/await-booking-row';
import { z } from 'zod';

// Must exceed the create-booking call this handler makes (aborted at 120s) plus
// the concurrent-path wait below. At 60s the platform killed the request while
// create-booking was still allowed to run, so the client saw a gateway error for
// a booking that was still in progress.
export const maxDuration = 180;

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
    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'flights-confirm' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        const { user, error: authError } = await getAuthenticatedUser();
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
        const supabase = createAdminClient();

        // ── Step 1: Verify payment server-side (never trust the client) ──────
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const provider = paymentIntent.metadata?.provider ?? '';
        const isMystifly = provider === 'mystifly_v2' || provider === 'mystifly';

        // Validate this PaymentIntent belongs to this session
        if (paymentIntent.metadata?.bookingSessionId !== sessionId) {
            return NextResponse.json({ success: false, error: 'Session/payment mismatch' }, { status: 403 });
        }

        // …and to this caller. The check above only proves the two ids go together,
        // not that they are the requester's — so any signed-in user holding someone
        // else's pair could read back their booking id and PNR, and drive their
        // booking to completion. /api/flights/booking-status already scopes by
        // user_id; this endpoint did not.
        if (paymentIntent.metadata?.userId && paymentIntent.metadata.userId !== user.id) {
            console.error('[/confirm] userId mismatch — refusing to act on another user\'s payment', {
                sessionId,
                owner: paymentIntent.metadata.userId,
                caller: user.id,
            });
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
                    errorCode: 'booking_failed_refunded',
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

        const internalHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
        };

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const bookingAbort = new AbortController();
        const bookingTimeout = setTimeout(() => bookingAbort.abort(), 120_000); // 2 min — AWS has no 60s function limit

        let bookingRes: Response;
        try {
            bookingRes = await fetch(`${siteUrl}/api/internal/create-booking`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({ sessionId }),
                signal: bookingAbort.signal,
            });
        } catch (fetchErr: any) {
            clearTimeout(bookingTimeout);
            const isTimeout = fetchErr?.name === 'AbortError';
            console.error('[/confirm] create-booking fetch error:', fetchErr.message);
            return NextResponse.json(
                { success: false, error: isTimeout ? 'Booking timed out. Please check your trips page.' : `Booking service unreachable: ${fetchErr.message}` },
                { status: 502 },
            );
        }
        clearTimeout(bookingTimeout);

        const rawText = await bookingRes.text();
        console.log('[/confirm] create-booking raw response (status', bookingRes.status, '):', rawText);

        let bookingData: any;
        try {
            bookingData = JSON.parse(rawText);
        } catch {
            console.error('[/confirm] create-booking returned non-JSON:', rawText.slice(0, 500));
            return NextResponse.json({ success: false, error: `Booking service error (HTTP ${bookingRes.status})` }, { status: 502 });
        }

        if (bookingData.success) {
            // Duffel: auto-ticket if needed
            if (!isMystifly && bookingData.status !== 'ticketed' && !bookingData.alreadyBooked && bookingData.bookingId) {
                console.log('[/confirm] Auto-ticketing Duffel order:', bookingData.bookingId);
                const ticketRes = await fetch(`${siteUrl}/api/internal/issue-ticket`, {
                    method: 'POST',
                    headers: internalHeaders,
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

            createNotification(
                'Flight booked via confirm fallback',
                `Booking ${bookingData.bookingId} (PNR: ${bookingData.pnr}) completed via confirm fallback — Stripe webhook did not fire in time for session ${sessionId}.`,
                'booking'
            );

            return NextResponse.json({
                success: true,
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                status: bookingData.status,
                ticketStatus: bookingData.ticketStatus,
                source: 'confirm-fallback',
            });
        }

        // create-booking returned failure — but the Stripe webhook may have run
        // concurrently and saved the booking while we were waiting. Do a final DB
        // check before surfacing the error to the user.
        //
        // `alreadyBooked` specifically means create-booking could not take the
        // session lock, i.e. the webhook holds it and is mid-insert right now. A
        // single read loses that race and told a traveller whose card HAD been
        // charged that it had not — and the client stops polling on that answer, so
        // the success landing a moment later was never seen. Wait it out.
        const lateBooking = bookingData.alreadyBooked
            ? await awaitBookingRow(supabase, sessionId)
            : (await supabase
                .from('flight_bookings')
                .select('id, pnr, status, payment_intent_id')
                .eq('session_id', sessionId)
                .maybeSingle()).data;

        if (lateBooking?.pnr) {
            console.log('[/confirm] Late webhook booking found after create-booking failure. PNR:', lateBooking.pnr);
            // Webhook already ran and sent the confirmation email — do not duplicate it here.
            return NextResponse.json({
                success: true,
                bookingId: lateBooking.id,
                pnr: lateBooking.pnr,
                status: lateBooking.status,
                source: 'late-webhook',
            });
        }

        // The concurrent path recorded a real failure (and refunded). Report that,
        // not "pending" — the traveller needs to know the money is coming back.
        if (lateBooking?.status === 'failed') {
            return NextResponse.json({
                success: false,
                errorCode: 'booking_failed_refunded',
                error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
            }, { status: 400 });
        }

        // Still nothing after waiting, but the other path never released the session
        // either. The booking is genuinely in flight somewhere we cannot see — say so,
        // rather than asserting a "not charged" the payment record contradicts.
        if (bookingData.alreadyBooked) {
            console.warn(`[/confirm] Session ${sessionId} is locked elsewhere and produced no booking row within the wait — reporting as pending`);
            return NextResponse.json({
                success: false,
                errorCode: 'booking_pending',
                error: 'Your payment went through and the booking is still completing. Check your trips page in a few minutes — do not pay again.',
            }, { status: 202 });
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

    const [{ data: session }, { data: segments }, { data: booking }] = await Promise.all([
        supabase.from('booking_sessions').select('contact, passengers').eq('id', sessionId).single(),
        supabase.from('flight_segments').select('*').eq('booking_id', bookingData.bookingId),
        supabase.from('flight_bookings').select('ticket_numbers').eq('id', bookingData.bookingId).maybeSingle(),
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

    // ticket_numbers is stored as a JSON array of strings e.g. ["1234567890123"]
    const rawTickets: string[] = (() => {
        const raw = (booking as any)?.ticket_numbers;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try { return JSON.parse(raw); } catch { return []; }
    })();
    const passengers: any[] = (session as any)?.passengers ?? [];
    const tickets = rawTickets.map((num, i) => ({
        number: num,
        name: passengers[i] ? `${passengers[i].firstName} ${passengers[i].lastName}` : `Passenger ${i + 1}`,
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
            tickets: tickets.length > 0 ? tickets : undefined,
            totalPrice: bookingData.confirmedPrice ?? 0,
            currency: bookingData.confirmedCurrency ?? 'USD',
        });
        console.log('[Email] Confirmation email sent:', result.success, result.error ?? '');
    }
}
