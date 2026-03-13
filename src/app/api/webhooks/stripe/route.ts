import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendFlightBookingConfirmationEmail } from '@/lib/server/email';
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

    console.log(`[Stripe Webhook] Event: ${event.type}`);

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

        if (provider !== 'mystifly' && provider !== 'mystifly_v2') {
            // Only Mystifly uses manual capture — ignore for other providers
            return NextResponse.json({ received: true });
        }

        console.log(`[Webhook] Mystifly card authorized. Booking session: ${bookingSessionId}`);

        try {
            // Mark session as payment_authorized before calling create-booking
            await supabase
                .from('booking_sessions')
                .update({ status: 'payment_authorized' })
                .eq('id', bookingSessionId)
                .eq('status', 'initiated');

            const bookingRes = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ sessionId: bookingSessionId }),
            });

            const bookingData = await bookingRes.json();

            if (bookingData.success) {
                console.log(`[Webhook] Mystifly booking complete. PNR: ${bookingData.pnr} Status: ${bookingData.status}`);
                // Send confirmation email — fire-and-forget (webhook fires exactly once)
                fireBookingConfirmationEmail(supabase, bookingSessionId, bookingData, pi.metadata?.provider ?? 'mystifly')
                    .catch(e => console.error('[Webhook] Mystifly email error:', e));
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
        if (provider === 'mystifly' || provider === 'mystifly_v2') {
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
                fireBookingConfirmationEmail(supabase, bookingSessionId, bookingData, 'duffel')
                    .catch(e => console.error('[Webhook] Duffel email error:', e));
            }

        } catch (err) {
            console.error('[Webhook] Duffel booking error:', err);
            // DO NOT return 5xx — that causes Stripe to retry and may double-book.
            // Alert on-call team in production.
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
