import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2025-01-27.acacia' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
        console.error('Webhook signature verification failed.', err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            console.log('[Stripe Webhook] PaymentIntent succeeded:', paymentIntent.id);

            const { bookingSessionId, provider, contactEmail, passengerName } = paymentIntent.metadata || {};

            if (!bookingSessionId) {
                console.error('[Stripe Webhook] No bookingSessionId found in metadata!', paymentIntent.id);
                break;
            }

            console.log(`[Stripe Webhook] Processing booking session: ${bookingSessionId} via ${provider}`);

            try {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                if (!supabaseUrl || !serviceRoleKey) {
                    throw new Error('Supabase environment variables not configured');
                }

                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceRoleKey}`,
                };

                // 1. Create the official booking (generates PNR)
                console.log(`[Stripe Webhook] Calling create-booking edge function...`);
                const bookingRes = await fetch(`${supabaseUrl}/functions/v1/create-booking`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ sessionId: bookingSessionId }),
                });

                const bookingData = await bookingRes.json();
                if (!bookingData.success) {
                    throw new Error(bookingData.error || 'Failed to create booking in edge function');
                }

                let finalStatus = bookingData.status || 'confirmed';
                let pnr = bookingData.pnr;
                let bookingId = bookingData.bookingId;

                // 2. Auto-ticket if Duffel
                if (provider === 'duffel' && finalStatus !== 'ticketed') {
                    console.log(`[Stripe Webhook] Triggering auto-ticketing for Duffel booking: ${bookingId}`);
                    const ticketRes = await fetch(`${supabaseUrl}/functions/v1/issue-ticket`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ bookingId: bookingId }),
                    });
                    const ticketResult = await ticketRes.json();
                    if (ticketResult.success) {
                        finalStatus = 'ticketed';
                        console.log(`[Stripe Webhook] Duffel auto-ticketing successful!`);
                    } else {
                        console.warn(`[Stripe Webhook] Duffel auto-ticketing failed:`, ticketResult.error);
                    }
                }

                console.log(`[Stripe Webhook] Booking fully processed! PNR: ${pnr} Status: ${finalStatus}`);

                // Note: Email sending logic can be added here, similar to how it was in the book route.

            } catch (err) {
                console.error('[Stripe Webhook] Critical error processing booking:', err);
                // We don't return a 500 here because we want Stripe to know we *received* the event
                // If we return 500, Stripe will keep retrying and we might double-book. 
                // In production, you'd send an alert to an admin dashboard here!
            }

            break;
        default:
            console.log(`[Stripe Webhook] Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
}
