import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/server/admin/notify';
import { sendFlightBookingConfirmationEmail, sendFlightRefundEmail } from '@/lib/server/email';
import { env } from '@/utils/env';

/**
 * Generic Webhook Receiver for Async Flight Supplier Events
 * 
 * Airlines often issue tickets or process refunds asynchronously.
 * This webhook consumes events from Duffel and Mystifly, updates
 * the local booking status, and inserts any strictly financial events
 * (like refunds resolving) into the `booking_financial_events` ledger.
 */
export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const payload = JSON.parse(rawBody);

        // ── Webhook Signature Verification ──────────────────────────────
        const duffelSignature = req.headers.get('duffel-signature');
        const mystiflyToken = req.headers.get('x-mystifly-webhook-token');

        // Duffel webhook verification
        if (payload.type && payload.type.startsWith('order.')) {
            const DUFFEL_WEBHOOK_SECRET = process.env.DUFFEL_WEBHOOK_SECRET;
            const isProduction = process.env.NODE_ENV === 'production';

            if (!DUFFEL_WEBHOOK_SECRET) {
                if (isProduction) {
                    // In production, a missing secret is a misconfiguration — reject to prevent unauthenticated processing
                    console.error('[Flight Webhook] DUFFEL_WEBHOOK_SECRET not set in production — rejecting event');
                    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
                }
                console.warn('[Flight Webhook] DUFFEL_WEBHOOK_SECRET not configured - skipping signature verification (dev only)');
            } else if (!duffelSignature) {
                console.error('[Flight Webhook] Missing Duffel-Signature header');
                return NextResponse.json({ error: 'Unauthorized - Missing signature' }, { status: 401 });
            } else {
                // Verify HMAC-SHA256 signature using timing-safe comparison to prevent timing attacks
                const crypto = await import('crypto');
                const expectedSignature = crypto
                    .createHmac('sha256', DUFFEL_WEBHOOK_SECRET)
                    .update(rawBody)
                    .digest('hex');

                const sigValid = (() => {
                    try {
                        const a = Buffer.from(duffelSignature, 'hex');
                        const b = Buffer.from(expectedSignature, 'hex');
                        return a.length === b.length && crypto.timingSafeEqual(a, b);
                    } catch {
                        return false;
                    }
                })();

                if (!sigValid) {
                    console.error('[Flight Webhook] Invalid Duffel signature');
                    return NextResponse.json({ error: 'Unauthorized - Invalid signature' }, { status: 401 });
                }
            }
        }
        // Mystifly webhook verification
        else if (payload.event_type && (payload.pnr || payload.order_id)) {
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

        const supabase = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // ─── 1. Provider Parsing & Event Mapping ─────────────────────
        let provider = 'unknown';
        let referenceId = ''; // Either PNR or Duffel Order ID
        let eventType = '';
        let newStatus = '';
        let refundAmount = 0;
        let currency = 'USD';

        // Duffel Webhook Strategy
        if (payload.type && payload.type.startsWith('order.')) {
            provider = 'duffel';
            referenceId = payload.data?.id;

            if (payload.type === 'order.tickets_generated') {
                eventType = 'ticketed';
                newStatus = 'ticketed';
            } else if (payload.type === 'order.ticketing_failed') {
                eventType = 'ticketing_failed';
                newStatus = 'failed';
            } else if (payload.type === 'order.cancellation.confirmed') {
                eventType = 'refunded';
                newStatus = 'refunded';
                refundAmount = parseFloat(payload.data?.refund_amount || '0');
                currency = payload.data?.refund_currency || 'USD';
            }
        }
        // Mystifly Webhook Strategy (Hypothetical PNR event payload)
        else if (payload.event_type && (payload.pnr || payload.order_id)) {
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
