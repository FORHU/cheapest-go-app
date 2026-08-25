import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { sendFlightBookingConfirmationEmail, sendFlightAwaitingTicketEmail } from '@/lib/server/email';
import { rateLimit } from '@/lib/server/rate-limit';
import { getMobileApiKey } from '@/lib/server/mobile-auth';
import { issueTicket } from '@/lib/server/flights/issue-ticket';
import { createBooking } from '@/lib/server/flights/create-booking';

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

        // Note: x-supabase-token header is no longer used (migrated to Lucia auth).
        // Mobile auth is handled exclusively via X-Mobile-Api-Key above.

        const supabase = createAdminClient();
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const internalHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
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
        // Direct call rather than a loopback request — see ADR-0012.
        let bookingData: any;
        try {
            bookingData = await createBooking({ sessionId });
        } catch (bookingErr: any) {
            console.error('[mobile/confirm] createBooking threw:', bookingErr?.message ?? bookingErr);
            return NextResponse.json(
                { success: false, error: `Booking could not be completed: ${bookingErr?.message ?? 'unknown error'}` },
                { status: 502 },
            );
        }

        if (bookingData.success) {
            // Duffel: auto-ticket if needed
            if (bookingData.bookingId && bookingData.status !== 'ticketed' && !bookingData.alreadyBooked) {
                // Direct call rather than a loopback request — see ADR-0012.
                const ticketData = await issueTicket(bookingData.bookingId);
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
    bookingData: { bookingId?: string; pnr?: string; status?: string; confirmedPrice?: number; confirmedCurrency?: string },
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

    const totalPrice = bookingData.confirmedPrice ?? 0;
    const currency = bookingData.confirmedCurrency ?? 'USD';

    if (bookingData.status === 'awaiting_ticket') {
        await sendFlightAwaitingTicketEmail({ bookingId: bookingData.bookingId!, pnr: bookingData.pnr!, email, passengerName, segments: mappedSegments, totalPrice, currency });
    } else {
        await sendFlightBookingConfirmationEmail({ bookingId: bookingData.bookingId!, pnr: bookingData.pnr!, email, passengerName, provider, segments: mappedSegments, totalPrice, currency });
    }
}
