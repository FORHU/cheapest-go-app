import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        const payload = await req.json();

        // SECURITY: In production, verify supplier cryptographic signatures here
        // (e.g. Duffel webhook secret, or Mystifly token)

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

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
            provider = 'mystifly';
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
            .select('id, status, provider, pnr')
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

                // ─── 4. Financial Ledger Logging ────────────────────────
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
