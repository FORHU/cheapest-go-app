import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { createNotification } from '@/lib/server/admin/notify';
import { sendFlightBookingConfirmationEmail, sendFlightRefundEmail } from '@/lib/server/email';
import { env } from '@/utils/env';
import { verifyDuffelSignature, parseDuffelEvent } from '@/lib/server/flights/duffel-webhook';
import { cancelFlightBooking, CANCEL_BOOKING_COLUMNS } from '@/lib/server/flights/cancel-flight-booking';

export const maxDuration = 60;

/**
 * Generic Webhook Receiver for Async Flight Supplier Events
 *
 * Airlines often issue tickets or process refunds asynchronously.
 * This webhook consumes events from Duffel and Mystifly, updates
 * the local booking status, and inserts any strictly financial events
 * (like refunds resolving) into the `booking_financial_events` ledger.
 *
 * Duffel's only event acted on is `order_cancellation.confirmed`: an order was cancelled at Duffel
 * (in its dashboard, or by the airline) and our booking has to catch up. See handleDuffelEvent.
 */

/**
 * Statuses a Duffel-side cancellation may act on. Deliberately NOT `cancel_requested`: that means
 * the traveller's own Cancel is in flight and owns the booking (and Duffel confirms the cancellation
 * it just made as an event of its own). Not `refund_failed` either: that has its own admin retry.
 */
const DUFFEL_RECONCILABLE_STATUSES = ['ticketed', 'confirmed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed'];

async function handleDuffelEvent(req: NextRequest, rawBody: string, payload: any): Promise<NextResponse> {
    // ── Signature: X-Duffel-Signature "t=<unix>,v1=<hex>", HMAC-SHA256 over "<t>.<raw body>" ──
    const secret = process.env.DUFFEL_WEBHOOK_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            // A missing secret in production is a misconfiguration: refuse rather than act unauthenticated.
            console.error('[Flight Webhook] DUFFEL_WEBHOOK_SECRET not set in production — rejecting event');
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }
        console.warn('[Flight Webhook] DUFFEL_WEBHOOK_SECRET not configured — skipping signature verification (dev only)');
    } else if (!verifyDuffelSignature(rawBody, req.headers.get('x-duffel-signature'), secret)) {
        console.error('[Flight Webhook] Invalid or missing X-Duffel-Signature');
        return NextResponse.json({ error: 'Unauthorized - Invalid signature' }, { status: 401 });
    }

    const event = parseDuffelEvent(payload);
    if (!event) {
        console.log('[Flight Webhook] Duffel payload with no event type ignored');
        return NextResponse.json({ received: true });
    }

    if (event.type !== 'order_cancellation.confirmed') {
        // Everything else Duffel sends (order.created, payments, pings…) needs nothing from us.
        // 200 so it is not retried.
        console.log(`[Flight Webhook] Duffel event ${event.type} (${event.id ?? 'no id'}) — nothing to do`);
        return NextResponse.json({ received: true, ignored: true });
    }

    if (!event.orderId) {
        // Say which fields were there, never their values.
        const keys = Object.keys(payload?.data?.object ?? payload?.data ?? {});
        console.error(`[Flight Webhook] ${event.type} ${event.id ?? ''} names no order. Resource fields: ${keys.join(', ') || '(none)'}`);
        return NextResponse.json({ received: true });
    }

    const supabase = createAdminClient();

    // Our rows keep the Duffel order id in duffel_order_id; provider_order_id is empty for them.
    let { data: booking } = await supabase
        .from('flight_bookings')
        .select(CANCEL_BOOKING_COLUMNS)
        .eq('duffel_order_id', event.orderId)
        .maybeSingle();
    if (!booking) {
        ({ data: booking } = await supabase
            .from('flight_bookings')
            .select(CANCEL_BOOKING_COLUMNS)
            .eq('provider_order_id', event.orderId)
            .maybeSingle());
    }

    if (!booking) {
        console.log(`[Flight Webhook] ${event.type}: no booking for Duffel order ${event.orderId}`);
        return NextResponse.json({ received: true });
    }

    if (!DUFFEL_RECONCILABLE_STATUSES.includes(booking.status)) {
        // Already refunded/cancelled (nothing to do), or the traveller's own Cancel is working on it.
        console.log(`[Flight Webhook] Booking ${booking.id} is ${booking.status} — Duffel's cancellation of ${event.orderId} needs nothing more`);
        return NextResponse.json({ received: true });
    }

    console.log(`[Flight Webhook] Duffel cancelled ${event.orderId}; reconciling booking ${booking.id} (${booking.status})`);
    const result = await cancelFlightBooking({
        supabase,
        booking,
        bookingId: booking.id,
        trigger: 'duffel_webhook',
        eligibleStatuses: DUFFEL_RECONCILABLE_STATUSES,
    });

    if (result.status >= 500) {
        // Our side failed. 500 makes Duffel retry for up to 72 hours, and the cancellation is safe to
        // repeat: a refund is keyed on the booking, and a booking already refunded is left alone.
        createNotification(
            'Duffel cancellation could not be reconciled',
            `Duffel cancelled order ${event.orderId} (booking ${booking.id}, PNR ${booking.pnr}) but reconciling it failed. Duffel will retry; check the booking if it keeps failing.`,
            'booking',
        );
        return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 });
    }

    if (result.status >= 400) {
        // A refusal on our terms (not eligible, supplier needs a person). Retrying cannot change it.
        console.error(`[Flight Webhook] Booking ${booking.id} not reconciled (HTTP ${result.status})`);
        createNotification(
            'Duffel cancellation needs attention',
            `Duffel cancelled order ${event.orderId} (booking ${booking.id}, PNR ${booking.pnr}) but the booking could not be reconciled automatically. Review it in the admin.`,
            'booking',
        );
    }

    return NextResponse.json({ received: true });
}

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        let payload: any;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        // ── Duffel ──────────────────────────────────────────────────────
        // Duffel events carry `type`; Mystifly's carry `event_type`. Duffel's has its own handler:
        // its signature scheme, payload nesting and event names are not Mystifly's.
        if (typeof payload?.type === 'string' && payload.event_type === undefined) {
            return await handleDuffelEvent(req, rawBody, payload);
        }

        // ── Mystifly webhook signature verification ─────────────────────
        const mystiflyToken = req.headers.get('x-mystifly-webhook-token');

        if (payload.event_type && (payload.pnr || payload.order_id)) {
            const MYSTIFLY_WEBHOOK_SECRET = process.env.MYSTIFLY_WEBHOOK_SECRET;

            if (!MYSTIFLY_WEBHOOK_SECRET) {
                console.warn('[Flight Webhook] MYSTIFLY_WEBHOOK_SECRET not configured - skipping token verification');
            } else if (!mystiflyToken) {
                console.error('[Flight Webhook] Missing X-Mystifly-Webhook-Token header');
                return NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 });
            } else if (mystiflyToken !== MYSTIFLY_WEBHOOK_SECRET) {
                console.error('[Flight Webhook] Invalid Mystifly webhook token');
                return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
            }
        }

        const supabase = createAdminClient();

        // ─── 1. Provider Parsing & Event Mapping ─────────────────────
        let provider = 'unknown';
        let referenceId = ''; // Either PNR or Duffel Order ID
        let eventType = '';
        let newStatus = '';
        let refundAmount = 0;
        let currency = 'USD';

        // Mystifly Webhook Strategy (Hypothetical PNR event payload)
        if (payload.event_type && (payload.pnr || payload.order_id)) {
            provider = 'mystifly_v2';
            referenceId = payload.pnr || payload.order_id;

            if (payload.event_type === 'ticket_issued') {
                eventType = 'ticketed';
                newStatus = 'ticketed';
            } else if (payload.event_type === 'refund_processed') {
                eventType = 'refunded';
                newStatus = 'refunded';
                refundAmount = payload.refund_amount || 0;
                currency = payload.currency || 'USD';
            }
        } else {
            console.log('[Flight Webhook] Unrecognized payload format:', JSON.stringify(payload).substring(0, 100));
            // Always return 200 to prevent supplier retries formatting spam
            return NextResponse.json({ received: true });
        }

        if (!referenceId) {
            return NextResponse.json({ error: 'Missing Reference ID or PNR' }, { status: 400 });
        }

        console.log(`[Flight Webhook] Provider: ${provider}, Event: ${eventType}, Ref: ${referenceId}`);

        // ─── 2. Locate Active Booking ─────────────────────────────────
        const { data: booking } = await supabase
            .from('flight_bookings')
            .select('id, status, provider, pnr, passenger_email, passenger_name, segments, total_price, currency')
            .or(`provider_order_id.eq.${referenceId},pnr.eq.${referenceId}`)
            .single();

        if (!booking) {
            console.error(`[Flight Webhook] Booking not found for Reference ID: ${referenceId}`);
            return NextResponse.json({ received: true });
        }

        // ─── 3. Database Synchronization ──────────────────────────────
        if (newStatus && booking.status !== newStatus) {

            // Append log of async update
            const asyncLog = {
                at: new Date().toISOString(),
                oldStatus: booking.status,
                newStatus: newStatus,
                note: `Asynchronous webhook update from ${provider}: ${eventType}`
            };

            await supabase
                .rpc('append_cancellation_log', {
                    b_id: booking.id,
                    log_entry: asyncLog
                }); // Note: If RPC missing, update inline via select & append

            const { error: updateErr } = await supabase
                .from('flight_bookings')
                .update({ status: newStatus })
                .eq('id', booking.id);

            if (!updateErr) {
                console.log(`[Flight Webhook] Updated booking ${booking.id} to ${newStatus}`);
                createNotification(
                    `Flight ${eventType === 'ticketed' ? 'Ticketed' : eventType === 'refunded' ? 'Refunded' : 'Updated'}`,
                    `Booking ${booking.pnr || booking.id} status updated to ${newStatus} by ${provider}.`,
                    'booking'
                );

                // ─── 4. Email Notification to Passenger ──────────────────
                const passengerEmail = booking.passenger_email;
                const passengerName = booking.passenger_name || 'Valued Customer';
                const segments = Array.isArray(booking.segments) ? booking.segments : [];

                if (passengerEmail) {
                    if (newStatus === 'ticketed') {
                        sendFlightBookingConfirmationEmail({
                            bookingId: String(booking.id),
                            pnr: booking.pnr || '',
                            email: passengerEmail,
                            passengerName,
                            provider: booking.provider || provider,
                            segments: segments.map((s: any) => ({
                                airline: s.airline || s.carrier || '',
                                airlineName: s.airlineName || s.carrier_name || '',
                                flightNumber: s.flightNumber || s.flight_number || '',
                                origin: s.origin || s.departure_iata || '',
                                destination: s.destination || s.arrival_iata || '',
                                departureTime: s.departureTime || s.departing_at || '',
                                arrivalTime: s.arrivalTime || s.arriving_at || '',
                                originTerminal: s.originTerminal || s.origin_terminal || s.terminal || null,
                                destinationTerminal: s.destinationTerminal || s.destination_terminal || s.arrivalTerminal || null,
                            })),
                            totalPrice: booking.total_price || 0,
                            currency: booking.currency || 'USD',
                        }).catch(e => console.error('[Flight Webhook] Ticketed email error:', e));
                    } else if (newStatus === 'refunded' && refundAmount > 0) {
                        sendFlightRefundEmail({
                            bookingId: String(booking.id),
                            pnr: booking.pnr || '',
                            email: passengerEmail,
                            passengerName,
                            segments: segments.map((s: any) => ({
                                airline: s.airline || s.carrier || '',
                                airlineName: s.airlineName || s.carrier_name || '',
                                flightNumber: s.flightNumber || s.flight_number || '',
                                origin: s.origin || s.departure_iata || '',
                                destination: s.destination || s.arrival_iata || '',
                                departureTime: s.departureTime || s.departing_at || '',
                                arrivalTime: s.arrivalTime || s.arriving_at || '',
                                originTerminal: s.originTerminal || s.origin_terminal || s.terminal || null,
                                destinationTerminal: s.destinationTerminal || s.destination_terminal || s.arrivalTerminal || null,
                            })),
                            totalPrice: refundAmount,
                            currency: currency,
                        }).catch(e => console.error('[Flight Webhook] Refund email error:', e));
                    }
                }

                // ─── 5. Financial Ledger Logging ────────────────────────
                if (newStatus === 'refunded' && refundAmount > 0) {
                    await supabase
                        .from('booking_financial_events')
                        .insert({
                            booking_id: booking.id,
                            event_type: 'refund',
                            amount: refundAmount,
                            currency: currency,
                            provider: provider,
                            transaction_id: payload.transaction_id || `webhook_refund_${referenceId}`,
                            metadata: payload
                        });

                    console.log(`[Flight Webhook] Ledger injected: async refund for ${booking.id}`);
                }
            }
        }

        return NextResponse.json({ success: true, received: true });

    } catch (err: any) {
        console.error('[Flight Webhook] Error processing event:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
