import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendFlightBookingConfirmationEmail } from '@/lib/server/email';
import { createNotification } from '@/lib/server/admin/notify';
import { awaitBookingRow } from '@/lib/server/flights/await-booking-row';
import { env } from '@/utils/env';

// Must cover the whole chain this handler drives: create-booking (itself allowed
// 120s) plus issue-ticket. At 30s the platform killed the request mid-booking,
// and because the event had already been marked processed, Stripe's retry was
// discarded as a duplicate and the booking was never completed by anyone.
export const maxDuration = 180;

// Lazy-initialize Stripe to avoid module-level crash during Vercel build
// (env vars aren't available at build time when Next.js collects page data)
let _stripe: import('stripe').default | null = null;
function getStripe() {
    if (!_stripe) {
        const key = env.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
        _stripe = new Stripe(key, { apiVersion: '2025-01-27.acacia' as any });
    }
    return _stripe;
}

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;


/**
 * Stripe Webhook Handler
 *
 * Mystifly flow (manual capture):
 *   payment_intent.amount_capturable_updated → card authorized → book with Mystifly
 *   create-booking: if PNR received → capture payment
 *                   if no PNR      → cancel payment intent
 *
 * Duffel flow (automatic capture):
 *   payment_intent.succeeded → book with Duffel (existing flow, unchanged)
 */
export async function POST(req: NextRequest) {
    if (!webhookSecret) {
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'No signature found' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
        console.error('Webhook signature verification failed.', err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    console.log(`[Stripe Webhook] Event: ${event.type} id=${event.id}`);

    // ── Idempotency: claim the event, and commit it only once it is done ─────
    //
    // The claim (this insert) stops two concurrent deliveries of the same event
    // from both booking. The commit (`completed_at`, written at the end) is what
    // makes a LATER delivery a no-op.
    //
    // These used to be the same act: the row was written before the work, so a
    // delivery that died part-way — the platform killing a slow booking — left
    // the event permanently marked processed, and Stripe's retry was discarded as
    // a duplicate. The booking was then finished by nobody.
    const dedupClient = createAdminClient();
    {
        const { error: dedupError } = await dedupClient
            .from('stripe_processed_events')
            .insert({ event_id: event.id, event_type: event.type, processed_at: new Date().toISOString() });

        if (dedupError) {
            if (dedupError.code === '23505') {
                // Already claimed. Only skip if it also finished — otherwise this is a
                // retry of a delivery that died, and it should run.
                const { data: prior } = await dedupClient
                    .from('stripe_processed_events')
                    .select('completed_at')
                    .eq('event_id', event.id)
                    .maybeSingle();

                if (prior?.completed_at) {
                    console.log(`[Stripe Webhook] Duplicate event ${event.id} — already completed, skipping`);
                    return NextResponse.json({ received: true });
                }
                console.warn(`[Stripe Webhook] Event ${event.id} was claimed but never completed — reprocessing. Downstream handlers are idempotent.`);
            } else {
                console.warn('[Stripe Webhook] Dedup insert error:', dedupError.message);
            }
        }
    }

    /** Mark the claim finished so later deliveries of this event are skipped. */
    const commitEvent = async () => {
        const { error } = await dedupClient
            .from('stripe_processed_events')
            .update({ completed_at: new Date().toISOString() })
            .eq('event_id', event.id);
        if (error) console.warn(`[Stripe Webhook] Could not mark event ${event.id} complete:`, error.message);
    };

    const internalHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
    };

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Create supabase client once — used in both Mystifly and Duffel handlers
    const supabase = createAdminClient();

    // ── Mystifly: manual capture → amount_capturable_updated ────────────────
    if (event.type === 'payment_intent.amount_capturable_updated') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { bookingSessionId, provider } = pi.metadata ?? {};

        if (!bookingSessionId) {
            console.error('[Webhook] amount_capturable_updated missing bookingSessionId', pi.id);
            await commitEvent();
            return NextResponse.json({ received: true });
        }

        if (provider !== 'mystifly_v2') {
            // Only Mystifly uses manual capture — ignore for other providers
            await commitEvent();
            return NextResponse.json({ received: true });
        }

        console.log(`[Webhook] Mystifly card authorized. Booking session: ${bookingSessionId}`);

        try {
            // Mark session as payment_authorized before calling create-booking
            // Accept both 'initiated' (legacy) and 'payment_initiated' (current /book sets this)
            await supabase
                .from('booking_sessions')
                .update({ status: 'payment_authorized' })
                .eq('id', bookingSessionId)
                .in('status', ['initiated', 'payment_initiated']);

            const bookingRes = await fetch(`${siteUrl}/api/internal/create-booking`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({ sessionId: bookingSessionId }),
            });

            const bookingData = await bookingRes.json();

            if (bookingData.success) {
                console.log(`[Webhook] Mystifly booking complete. PNR: ${bookingData.pnr} Status: ${bookingData.status}`);
                createNotification(
                    'Flight Booking Confirmed',
                    `Mystifly booking ${bookingData.pnr || bookingSessionId} confirmed.`,
                    'booking'
                );
                // Send confirmation email — fire-and-forget (webhook fires exactly once)
                fireBookingConfirmationEmail(supabase, bookingSessionId, bookingData, pi.metadata?.provider ?? 'mystifly_v2')
                    .catch(e => console.error('[Webhook] Mystifly email error:', e));

                // Financial ledger: log payment event
                if (bookingData.bookingId) {
                    logFlightPaymentEvent(supabase, {
                        bookingId: bookingData.bookingId,
                        amount: pi.amount / 100,
                        currency: (pi.currency || 'usd').toUpperCase(),
                        provider: 'mystifly_v2',
                        transactionId: pi.id,
                        metadata: { sessionId: bookingSessionId, pnr: bookingData.pnr },
                    });
                }
            } else {
                // create-booking handles the cancel + DB failure update internally
                console.error('[Webhook] Mystifly create-booking failed:', bookingData.error);
            }
        } catch (err) {
            console.error('[Webhook] Mystifly booking error:', err);
        }
    }

    // ── Duffel: automatic capture → payment_intent.succeeded ────────────────
    else if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { bookingSessionId, provider } = pi.metadata ?? {};

        if (!bookingSessionId) {
            console.error('[Webhook] payment_intent.succeeded missing bookingSessionId', pi.id);
            await commitEvent();
            return NextResponse.json({ received: true });
        }

        // skip Mystifly here — it's handled by amount_capturable_updated above
        if (provider === 'mystifly_v2') {
            await commitEvent();
            return NextResponse.json({ received: true });
        }

        console.log(`[Webhook] Duffel payment succeeded. Session: ${bookingSessionId}`);

        try {
            // FIX 3: Optimistic session lock — prevents double-booking if Stripe delivers
            // the webhook twice concurrently before the dedup table write completes.
            // Matches the pattern used in the Mystifly path.
            await supabase
                .from('booking_sessions')
                .update({ status: 'payment_authorized' })
                .eq('id', bookingSessionId)
                .in('status', ['initiated', 'payment_initiated']);

            // Idempotent: create-booking returns existing booking if /confirm already ran.
            // Pass piId directly — DO NOT rely solely on booking_sessions.payment_intent_id,
            // which can be null if the Step 3a update in /api/flights/book failed silently
            // (e.g. column doesn't exist yet). This ensures flight_bookings always gets the
            // PI ID so cancel-booking can issue Stripe refunds correctly.
            const bookingRes = await fetch(`${siteUrl}/api/internal/create-booking`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({ sessionId: bookingSessionId, paymentIntentId: pi.id }),
            });

            const bookingData = await bookingRes.json();

            if (!bookingData.success) {
                // `alreadyBooked` is not a failure. create-booking answers it when it
                // could not take the session lock — which, by design, is exactly what
                // happens when the /confirm fallback the client fires 3s after payment
                // got there first and is mid-insert.
                //
                // Treating it as a failure fell straight into the catch below and
                // REFUNDED a card whose ticket was being issued as we read. The Duffel
                // order is bought from our balance before Stripe is ever charged, so
                // that combination is a live ticket and a full refund.
                //
                // Wait out the other path before deciding anything.
                if (bookingData.alreadyBooked) {
                    const settled = await awaitBookingRow(supabase, bookingSessionId);
                    if (settled?.pnr) {
                        console.log(`[Webhook] Session ${bookingSessionId} was booked concurrently by /confirm. PNR: ${settled.pnr} — nothing to do`);
                        await commitEvent();
                        return NextResponse.json({ received: true });
                    }
                    if (settled?.status === 'failed') {
                        console.error(`[Webhook] Session ${bookingSessionId} was recorded failed by the concurrent path — refunding`);
                        throw new Error('Booking recorded as failed by concurrent path');
                    }

                    // Locked by someone, and still no row. This is NOT a refund: the
                    // lock means another path owns this booking and may yet finish it,
                    // and refunding a live Duffel ticket cannot be undone. Hand it to
                    // auto-recover, which sweeps succeeded-PI sessions every 10 minutes
                    // and is built for exactly this.
                    console.error(
                        `[Webhook] Session ${bookingSessionId} is locked elsewhere and produced no booking row — ` +
                        `leaving it for auto-recover rather than refunding a possibly-live ticket. PI: ${pi.id}`,
                    );
                    createNotification(
                        'Flight booking needs review',
                        `Session ${bookingSessionId} (PI ${pi.id}) was paid but its booking row never appeared while the webhook waited. ` +
                        `Not refunded — auto-recover will retry. Check for a live Duffel order before taking any manual action.`,
                        'booking',
                    );
                    await commitEvent();
                    return NextResponse.json({ received: true });
                }
                throw new Error(bookingData.error || 'create-booking failed');
            }

            // Auto-ticket Duffel orders
            if (bookingData.status !== 'ticketed' && !bookingData.alreadyBooked && bookingData.bookingId) {
                console.log(`[Webhook] Auto-ticketing Duffel order: ${bookingData.bookingId}`);
                const ticketRes = await fetch(`${siteUrl}/api/internal/issue-ticket`, {
                    method: 'POST',
                    headers: internalHeaders,
                    body: JSON.stringify({ bookingId: bookingData.bookingId }),
                });
                const ticketData = await ticketRes.json();
                console.log(ticketData.success
                    ? `[Webhook] Duffel ticketing OK`
                    : `[Webhook] Duffel ticketing failed: ${ticketData.error}`
                );
            }

            console.log(`[Webhook] Duffel booking complete. PNR: ${bookingData.pnr}, alreadyBooked: ${bookingData.alreadyBooked}`);

            // Send confirmation email — fire-and-forget, only on fresh booking
            if (!bookingData.alreadyBooked) {
                createNotification(
                    'Flight Booking Confirmed',
                    `Duffel booking ${bookingData.pnr || bookingSessionId} confirmed.`,
                    'booking'
                );
                fireBookingConfirmationEmail(supabase, bookingSessionId, bookingData, 'duffel')
                    .catch(e => console.error('[Webhook] Duffel email error:', e));

                // Financial ledger: log payment event
                if (bookingData.bookingId) {
                    logFlightPaymentEvent(supabase, {
                        bookingId: bookingData.bookingId,
                        amount: pi.amount / 100,
                        currency: (pi.currency || 'usd').toUpperCase(),
                        provider: 'duffel',
                        transactionId: pi.id,
                        metadata: { sessionId: bookingSessionId, pnr: bookingData.pnr },
                    });
                }
            }

        } catch (err) {
            console.error('[Webhook] Duffel booking error:', err);
            // Payment was captured but booking failed — auto-refund the customer.
            // Key on event.id (not pi.id): one refund attempt per Stripe webhook delivery.
            // If Stripe retries the same event, the idempotency key deduplicates at Stripe.
            // If a genuinely different event fires for the same PI, it gets its own key and
            // is blocked by Stripe's "already refunded" check — not a double-refund risk.
            try {
                await getStripe().refunds.create(
                    { payment_intent: pi.id },
                    { idempotencyKey: `webhook-auto-refund-${event.id}` },
                );
                console.log(`[Webhook] Auto-refunded PI ${pi.id} after Duffel booking failure`);
                await supabase
                    .from('booking_sessions')
                    .update({ status: 'payment_failed' })
                    .eq('id', bookingSessionId);
            } catch (refundErr: any) {
                console.error(`[Webhook] CRITICAL: Auto-refund failed for PI ${pi.id}:`, refundErr.message);
            }
            // DO NOT return 5xx — that causes Stripe to retry and may double-book.
        }
    }

    // ── Duffel: cancel orphaned pre-order when payment fails ────────────────
    else if (
        event.type === 'payment_intent.payment_failed' ||
        event.type === 'payment_intent.canceled'
    ) {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { bookingSessionId, duffelOrderId, provider } = pi.metadata ?? {};

        if (provider !== 'duffel' || !duffelOrderId) {
            await commitEvent();
            return NextResponse.json({ received: true });
        }

        console.log(`[Stripe Webhook] Duffel payment failed/cancelled — cancelling pre-order ${duffelOrderId}`);

        try {
            const duffelToken = process.env.DUFFEL_TOKEN;
            if (!duffelToken) {
                console.error('[Stripe Webhook] DUFFEL_TOKEN not set — cannot cancel orphaned order');
                await commitEvent();
                return NextResponse.json({ received: true });
            }

            // Step 1: Create a cancellation
            const cancelRes = await fetch('https://api.duffel.com/air/order_cancellations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${duffelToken}`,
                    'Duffel-Version': 'v2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: { order_id: duffelOrderId } }),
            });

            if (!cancelRes.ok) {
                const errData = await cancelRes.json().catch(() => ({}));
                console.warn(`[Stripe Webhook] Duffel cancellation init failed (${cancelRes.status}):`, errData?.errors?.[0]?.message);
            } else {
                const cancelData = await cancelRes.json();
                const cancellationId = cancelData?.data?.id;

                // Step 2: Confirm the cancellation
                if (cancellationId) {
                    const confirmRes = await fetch(
                        `https://api.duffel.com/air/order_cancellations/${cancellationId}/actions/confirm`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${duffelToken}`,
                                'Duffel-Version': 'v2',
                                'Content-Type': 'application/json',
                            },
                        }
                    );
                    console.log(confirmRes.ok
                        ? `[Stripe Webhook] Orphaned Duffel order ${duffelOrderId} cancelled successfully`
                        : `[Stripe Webhook] Duffel cancellation confirm failed (${confirmRes.status})`
                    );
                }
            }

            // Mark the booking session as payment_failed
            if (bookingSessionId) {
                await supabase
                    .from('booking_sessions')
                    .update({ status: 'payment_failed' })
                    .eq('id', bookingSessionId)
                    .in('status', ['payment_initiated', 'initiated']);
            }
        } catch (err) {
            console.error('[Stripe Webhook] Error cancelling orphaned Duffel order:', err);
        }
    }

    // ── Refund Resilience: update booking status when Stripe confirms refund ──
    else if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent as any)?.id;

        if (piId) {
            console.log(`[Stripe Webhook] Charge refunded for PI: ${piId}. Syncing booking status.`);

            // Hotel bookings (bookings table)
            const { data: hotelUpdated, error: hotelErr } = await supabase
                .from('bookings')
                .update({ status: 'cancelled_refunded', updated_at: new Date().toISOString() })
                .eq('payment_intent_id', piId)
                .in('status', ['cancelled_refund_failed', 'cancelled'])
                .select('booking_id');

            if (hotelErr) {
                console.error('[Stripe Webhook] Failed to update hotel booking to cancelled_refunded:', hotelErr.message);
            } else if (hotelUpdated && hotelUpdated.length > 0) {
                console.log(`[Stripe Webhook] Marked ${hotelUpdated.length} hotel booking(s) as cancelled_refunded:`, hotelUpdated.map((b: any) => b.booking_id));
            }

            // Flight bookings (flight_bookings table)
            const { data: flightUpdated, error: flightErr } = await supabase
                .from('flight_bookings')
                .update({ status: 'refunded' })
                .eq('payment_intent_id', piId)
                .in('status', ['refund_pending', 'cancel_requested', 'confirmed', 'ticketed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed'])
                .select('id');

            if (flightErr) {
                console.error('[Stripe Webhook] Failed to update flight booking to refunded:', flightErr.message);
            } else if (flightUpdated && flightUpdated.length > 0) {
                console.log(`[Stripe Webhook] Marked ${flightUpdated.length} flight booking(s) as refunded.`);
            }
        }
    }

    else {
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    await commitEvent();
    return NextResponse.json({ received: true });
}

// ─── Email Helper ─────────────────────────────────────────────────────────────

/**
 * Query the booking session + segments and fire a confirmation email.
 * Must not throw — always call with .catch().
 */
async function fireBookingConfirmationEmail(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    sessionId: string,
    bookingData: { bookingId?: string; pnr?: string; confirmedPrice?: number; confirmedCurrency?: string },
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

    const result = await sendFlightBookingConfirmationEmail({
        bookingId: bookingData.bookingId,
        pnr: bookingData.pnr,
        email,
        passengerName,
        provider,
        segments: ((segments as any[]) ?? []).map((s: any) => ({
            airline: s.airline,
            flightNumber: s.flight_number,
            origin: s.origin,
            destination: s.destination,
            departureTime: s.departure,
            arrivalTime: s.arrival,
        })),
        tickets: tickets.length > 0 ? tickets : undefined,
        totalPrice: bookingData.confirmedPrice ?? 0,
        currency: bookingData.confirmedCurrency ?? 'USD',
    });

    console.log('[Email] Confirmation sent:', result.success, result.error ?? '');
}

// ─── Financial Ledger Helper ─────────────────────────────────────────────────

/**
 * Insert a payment event into the booking_financial_events ledger.
 * Fire-and-forget — must not throw.
 */
async function logFlightPaymentEvent(
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
        const { error } = await supabase
            .from('booking_financial_events')
            .insert({
                booking_id: params.bookingId,
                event_type: 'payment',
                amount: params.amount,
                currency: params.currency,
                provider: params.provider,
                transaction_id: params.transactionId,
                metadata: params.metadata || {},
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
