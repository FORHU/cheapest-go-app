import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { sendFlightBookingConfirmationEmail, sendFlightAwaitingTicketEmail } from '@/lib/server/email';
import { rateLimit } from '@/lib/server/rate-limit';
import { getMobileApiKey } from '@/lib/server/mobile-auth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/flights/confirm
 *
 * Mobile equivalent of /api/flights/confirm.
 * Authenticates via X-Mobile-Api-Key header instead of session cookies.
 *
 * Body: { paymentIntentId: string, sessionId: string }
 * Returns: { success, bookingId, pnr, status }
 */
export async function POST(req: NextRequest) {
    // ── API key auth — DB key takes priority over env var ─────────────────
    const apiKey = req.headers.get('x-mobile-api-key');
    const activeKey = await getMobileApiKey();
    if (!apiKey || !activeKey || apiKey !== activeKey) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limiting ─────────────────────────────────────────────────────
    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'mobile-flights-confirm' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        const { paymentIntentId, sessionId } = await req.json();

        if (!paymentIntentId || !sessionId) {
            return NextResponse.json({ success: false, error: 'paymentIntentId and sessionId are required' }, { status: 400 });
        }

        // Validate Supabase token if present (used for audit logging)
        const supabaseToken = req.headers.get('x-supabase-token');
        if (supabaseToken) {
            const svc = createAdminClient();
            const { data: { user: tokenUser } } = await svc.auth.getUser(supabaseToken);
            if (!tokenUser) {
                return NextResponse.json({ success: false, error: 'Invalid session. Please log in again.' }, { status: 401 });
            }
        }

        const supabase = createAdminClient();
        const edgeFnHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        };

        // ── Verify payment server-side ────────────────────────────────────
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const provider = paymentIntent.metadata?.provider ?? 'duffel';

        // Validate this PI belongs to this session
        if (paymentIntent.metadata?.bookingSessionId !== sessionId) {
            return NextResponse.json({ success: false, error: 'Session/payment mismatch' }, { status: 403 });
        }

        // ── DB-first check — webhook may have already processed it ─────────
        const { data: existingBooking } = await supabase
            .from('flight_bookings')
            .select('id, pnr, status, payment_intent_id')
            .eq('session_id', sessionId)
            .maybeSingle();

        if (existingBooking) {
            if (existingBooking.payment_intent_id && existingBooking.payment_intent_id !== paymentIntentId) {
                return NextResponse.json({ success: false, error: 'Payment mismatch' }, { status: 403 });
            }
            if (existingBooking.status === 'failed') {
                return NextResponse.json({
                    success: false,
                    error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
                }, { status: 400 });
            }
            if (existingBooking.pnr) {
                return NextResponse.json({
                    success: true,
                    bookingId: existingBooking.id,
                    pnr: existingBooking.pnr,
                    status: existingBooking.status,
                    source: 'webhook',
                });
            }
        }

        // ── Verify payment status ─────────────────────────────────────────
        if (paymentIntent.status !== 'succeeded') {
            return NextResponse.json({
                success: false,
                error: `Payment not completed (status: ${paymentIntent.status}). Please try again.`,
            }, { status: 402 });
        }

        // ── Call create-booking as fallback ───────────────────────────────
        const bookingAbort = new AbortController();
        const bookingTimeout = setTimeout(() => bookingAbort.abort(), 55_000);

        let bookingRes: Response;
        try {
            bookingRes = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking`, {
                method: 'POST',
                headers: edgeFnHeaders,
                body: JSON.stringify({ sessionId }),
                signal: bookingAbort.signal,
            });
        } catch (fetchErr: any) {
            clearTimeout(bookingTimeout);
            const isTimeout = fetchErr?.name === 'AbortError';
            return NextResponse.json(
                { success: false, error: isTimeout ? 'Booking timed out. Please check your trips page.' : `Booking service error: ${fetchErr.message}` },
                { status: 502 },
            );
        }
        clearTimeout(bookingTimeout);

        let bookingData: any;
        try {
            bookingData = await bookingRes.json();
        } catch {
            return NextResponse.json({ success: false, error: `Booking service error (HTTP ${bookingRes.status})` }, { status: 502 });
        }

        if (bookingData.success) {
            // Duffel: auto-ticket if needed
            if (bookingData.bookingId && bookingData.status !== 'ticketed' && !bookingData.alreadyBooked) {
                const ticketRes = await fetch(`${env.SUPABASE_URL}/functions/v1/issue-ticket`, {
                    method: 'POST',
                    headers: edgeFnHeaders,
                    body: JSON.stringify({ bookingId: bookingData.bookingId }),
                });
                const ticketData = await ticketRes.json().catch(() => ({}));
                console.log(`[mobile/confirm] Ticketing: ${ticketData.success ? 'OK' : ticketData.error}`);
            }

            // Send confirmation email (non-blocking)
            if (!bookingData.alreadyBooked && bookingData.bookingId && bookingData.pnr) {
                fireBookingEmail(supabase, sessionId, bookingData, provider).catch(e =>
                    console.error('[mobile/confirm] Email error:', e)
                );
            }

            return NextResponse.json({
                success: true,
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                status: bookingData.status,
                ticketStatus: bookingData.ticketStatus,
            });
        }

        // Final DB check — webhook may have run concurrently
        const { data: lateBooking } = await supabase
            .from('flight_bookings')
            .select('id, pnr, status')
            .eq('session_id', sessionId)
            .maybeSingle();

        if (lateBooking?.pnr) {
            return NextResponse.json({ success: true, bookingId: lateBooking.id, pnr: lateBooking.pnr, status: lateBooking.status });
        }

        return NextResponse.json({ success: false, error: bookingData.error || 'Booking failed — your card has not been charged.' }, { status: 400 });

    } catch (err: any) {
        console.error('[mobile/confirm]', err);
        return NextResponse.json({ success: false, error: err.message || 'Confirmation failed' }, { status: 500 });
    }
}

async function fireBookingEmail(
    supabase: any,
    sessionId: string,
    bookingData: { bookingId?: string; pnr?: string; status?: string },
    provider: string,
) {
    const [{ data: session }, { data: segments }] = await Promise.all([
        supabase.from('booking_sessions').select('contact, passengers').eq('id', sessionId).single(),
        supabase.from('flight_segments').select('*').eq('booking_id', bookingData.bookingId),
    ]);

    const email = (session as any)?.contact?.email;
    if (!email) return;

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

    if (bookingData.status === 'awaiting_ticket') {
        await sendFlightAwaitingTicketEmail({ bookingId: bookingData.bookingId!, pnr: bookingData.pnr!, email, passengerName, segments: mappedSegments, totalPrice: 0, currency: 'USD' });
    } else {
        await sendFlightBookingConfirmationEmail({ bookingId: bookingData.bookingId!, pnr: bookingData.pnr!, email, passengerName, provider, segments: mappedSegments, totalPrice: 0, currency: 'USD' });
    }
}
