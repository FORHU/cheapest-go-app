import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendFlightBookingConfirmationEmail } from '@/lib/server/email';
import { createNotification } from '@/lib/server/admin/notify';
import { env } from '@/utils/env';

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

    // ── Idempotency: deduplicate processed events ────────────────────────────
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient: createSbClient } = await import('@supabase/supabase-js');
        const dedupClient = createSbClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const { error: dedupError } = await dedupClient
            .from('stripe_processed_events')
            .insert({ event_id: event.id, event_type: event.type, processed_at: new Date().toISOString() });

        if (dedupError) {
            if (dedupError.code === '23505') {
                // Unique violation — already processed
                console.log(`[Stripe Webhook] Duplicate event ${event.id} — skipping`);
                return NextResponse.json({ received: true });
            }
            // Table may not exist yet — log and continue
            if (!dedupError.message?.includes('does not exist')) {
                console.warn('[Stripe Webhook] Dedup insert error:', dedupError.message);
            }
        }
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    };

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[Stripe Webhook] Missing Supabase env vars');
        return NextResponse.json({ received: true });
    }

    // Create supabase client once — used in both Mystifly and Duffel handlers
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // ── Mystifly: manual capture → amount_capturable_updated ────────────────
    if (event.type === 'payment_intent.amount_capturable_updated') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { bookingSessionId, provider } = pi.metadata ?? {};

        if (!bookingSessionId) {
            console.error('[Webhook] amount_capturable_updated missing bookingSessionId', pi.id);
            return NextResponse.json({ received: true });
        }

        if (provider !== 'mystifly_v2') {
            // Only Mystifly uses manual capture — ignore for other providers
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

            const bookingRes = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking`, {
                method: 'POST',
                headers,
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
            return NextResponse.json({ received: true });
        }

        // skip Mystifly here — it's handled by amount_capturable_updated above
        if (provider === 'mystifly_v2') {
            return NextResponse.json({ received: true });
        }

        console.log(`[Webhook] Duffel payment succeeded. Session: ${bookingSessionId}`);

        try {
            // Idempotent: create-booking returns existing booking if /confirm already ran
            const bookingRes = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ sessionId: bookingSessionId }),
            });

            const bookingData = await bookingRes.json();

            if (!bookingData.success) {
                throw new Error(bookingData.error || 'create-booking failed');
            }

            // Auto-ticket Duffel orders
            if (bookingData.status !== 'ticketed' && !bookingData.alreadyBooked && bookingData.bookingId) {
                console.log(`[Webhook] Auto-ticketing Duffel order: ${bookingData.bookingId}`);
                const ticketRes = await fetch(`${env.SUPABASE_URL}/functions/v1/issue-ticket`, {
                    method: 'POST',
                    headers,
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
            // DO NOT return 5xx — that causes Stripe to retry and may double-book.
            // Alert on-call team in production.
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
            return NextResponse.json({ received: true });
        }

        console.log(`[Stripe Webhook] Duffel payment failed/cancelled — cancelling pre-order ${duffelOrderId}`);

        try {
            const duffelToken = process.env.DUFFEL_TOKEN;
            if (!duffelToken) {
                console.error('[Stripe Webhook] DUFFEL_TOKEN not set — cannot cancel orphaned order');
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

    else {
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

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

    const [{ data: session }, { data: segments }] = await Promise.all([
        supabase.from('booking_sessions').select('contact, passengers').eq('id', sessionId).single(),
        supabase.from('flight_segments').select('*').eq('booking_id', bookingData.bookingId),
    ]);

    const email = (session as any)?.contact?.email;
    if (!email) { console.warn('[Email] No contact email in session', sessionId); return; }

    const pax0 = (session as any)?.passengers?.[0];
    const passengerName = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';

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
