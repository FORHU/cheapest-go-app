import { sendFlightBookingConfirmationEmail, mapFlightSegmentsForEmail } from '@/lib/server/email';
import { fetchStripeFee } from '@/lib/stripe/fee';
import { fromStripeAmount } from '@/lib/pricing';
import { createNotification } from '@/lib/server/admin/notify';
import { issueTicket } from './issue-ticket';

// ─── Email Helper ─────────────────────────────────────────────────────────────

/**
 * Query the booking session + segments and fire a confirmation email.
 * Must not throw — always call with .catch().
 */
export async function fireBookingConfirmationEmail(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    sessionId: string,
    bookingData: { bookingId?: string; pnr?: string; confirmedPrice?: number; confirmedCurrency?: string },
    provider: string,
) {
    if (!bookingData.bookingId || !bookingData.pnr) return;

    const [{ data: session }, { data: segments }, { data: booking }, { data: passengerRows }] = await Promise.all([
        supabase.from('booking_sessions').select('contact, passengers').eq('id', sessionId).single(),
        supabase.from('flight_segments').select('*').eq('booking_id', bookingData.bookingId),
        supabase.from('flight_bookings').select('ticket_numbers, fare_policy').eq('id', bookingData.bookingId).maybeSingle(),
        supabase.from('passengers').select('first_name, last_name, type, ticket_number, seat_number').eq('booking_id', bookingData.bookingId),
    ]);

    const email = (session as any)?.contact?.email;
    if (!email) { console.warn('[Email] No contact email in session', sessionId); return; }

    // Prefer the passengers table (authoritative post-booking: real seat/ticket per person)
    // over the pre-booking session form data, falling back to the session when a booking has
    // no passengers rows yet (e.g. older bookings created before that table was populated here).
    const paxRows: any[] = (passengerRows as any[]) ?? [];
    const passengerTypeMap: Record<string, string> = { ADT: 'adult', CHD: 'child', INF: 'infant' };

    let passengerName: string;
    let tickets: { name: string; number: string }[];
    let passengerType: string | undefined;
    let seatNumber: string | undefined;

    if (paxRows.length > 0) {
        passengerName = `${paxRows[0].first_name} ${paxRows[0].last_name}`;
        passengerType = passengerTypeMap[paxRows[0].type];
        seatNumber = paxRows[0].seat_number ?? undefined;
        tickets = paxRows.filter(p => p.ticket_number).map(p => ({ name: `${p.first_name} ${p.last_name}`, number: p.ticket_number }));
    } else {
        const pax0 = (session as any)?.passengers?.[0];
        passengerName = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';
        const rawTickets: string[] = (() => {
            const raw = (booking as any)?.ticket_numbers;
            if (!raw) return [];
            if (Array.isArray(raw)) return raw;
            try { return JSON.parse(raw); } catch { return []; }
        })();
        const sessionPassengers: any[] = (session as any)?.passengers ?? [];
        tickets = rawTickets.map((num, i) => ({
            number: num,
            name: sessionPassengers[i] ? `${sessionPassengers[i].firstName} ${sessionPassengers[i].lastName}` : `Passenger ${i + 1}`,
        }));
    }

    const result = await sendFlightBookingConfirmationEmail({
        bookingId: bookingData.bookingId,
        pnr: bookingData.pnr,
        email,
        passengerName,
        passengerType,
        seatNumber,
        provider,
        segments: mapFlightSegmentsForEmail(segments as any[]),
        tickets: tickets.length > 0 ? tickets : undefined,
        totalPrice: bookingData.confirmedPrice ?? 0,
        currency: bookingData.confirmedCurrency ?? 'USD',
        farePolicy: (booking as any)?.fare_policy ?? undefined,
    });

    console.log('[Email] Confirmation sent:', result.success, result.error ?? '');
}

// ─── Financial Ledger Helper ─────────────────────────────────────────────────

/**
 * Insert a payment event into the booking_financial_events ledger.
 * Fire-and-forget — must not throw.
 *
 * ## Why this records the real Stripe fee
 *
 * `STRIPE_RATE` in pricing.ts is an *estimate* — it has to be, because the markup
 * is computed before a charge exists. But it was never checked against anything.
 * It carried the US domestic-card rate (2.9%) while Charge Currency is KRW, USD
 * and PHP, so most customers plausibly cost nearer 5.4% once the international-card
 * and conversion surcharges land, and nothing anywhere would have said so.
 *
 * Stripe reports the exact fee per charge on the balance transaction, for free.
 * Recording it here turns the estimate into something reconcilable: the model
 * still prices from `STRIPE_RATE`, but the ledger knows what was actually taken,
 * so drift becomes visible instead of arriving as a surprise invoice. See ADR-0036.
 *
 * The fee is best-effort. A booking must never fail, or lose its ledger row,
 * because a reporting figure could not be fetched.
 */
export async function logFlightPaymentEvent(
    supabase: any,
    params: {
        bookingId: string;
        amount: number;
        currency: string;
        provider: string;
        transactionId: string;
        metadata?: Record<string, any>;
    },
) {
    try {
        const fee = await fetchStripeFee(params.transactionId);

        const { error } = await supabase
            .from('booking_financial_events')
            .insert({
                booking_id: params.bookingId,
                event_type: 'payment',
                amount: params.amount,
                currency: params.currency,
                provider: params.provider,
                transaction_id: params.transactionId,
                metadata: { ...(params.metadata || {}), ...fee },
            });

        if (error) {
            console.error('[Stripe Webhook] Failed to log financial event:', error.message);
        } else {
            console.log(`[Stripe Webhook] Ledger: payment event logged for ${params.bookingId}`);
        }
    } catch (err) {
        console.error('[Stripe Webhook] Ledger insert error:', err);
    }
}

/**
 * Everything that follows a Duffel booking being recorded: auto-ticketing, the team notification,
 * the confirmation email and the payment ledger entry. Shared by the webhook and auto-recover so
 * a booking finalised by either is completed the same way.
 */
export async function completeDuffelBooking({ supabase, sessionId, paymentIntent, booking }: {
    supabase: any;
    sessionId: string;
    paymentIntent: { id: string; amount: number; currency: string | null };
    booking: { bookingId?: string; pnr?: string; status?: string; alreadyBooked?: boolean };
}): Promise<void> {
    if (booking.alreadyBooked) return;

    if (booking.status !== 'ticketed' && booking.bookingId) {
        const ticket = await issueTicket(booking.bookingId);
        console.log(ticket.success ? '[post-booking] Duffel ticketing OK' : `[post-booking] Duffel ticketing failed: ${ticket.error}`);
    }

    createNotification('Flight Booking Confirmed', `Duffel booking ${booking.pnr || sessionId} confirmed.`, 'booking');

    fireBookingConfirmationEmail(supabase, sessionId, booking, 'duffel')
        .catch(e => console.error('[post-booking] Duffel email error:', e));

    if (booking.bookingId) {
        logFlightPaymentEvent(supabase, {
            bookingId: booking.bookingId,
            amount: fromStripeAmount(paymentIntent.amount, paymentIntent.currency || 'usd'),
            currency: (paymentIntent.currency || 'usd').toUpperCase(),
            provider: 'duffel',
            transactionId: paymentIntent.id,
            metadata: { sessionId, pnr: booking.pnr },
        });
    }
}
