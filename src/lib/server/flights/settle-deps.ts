import { createAdminClient } from '@/utils/postgres/admin';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { placeDuffelOrder } from './place-duffel-order';
import { withDuffelServicePrices } from './duffel-service-prices';
import { cancelDuffelOrder } from './duffel-cancel';
import { withBookedItinerary } from './duffel-order-segments';
import type { SettleDeps } from './settle-authorized-flight';

export function defaultSettleDeps(): SettleDeps {
    const db = createAdminClient();
    return {
        async retrievePaymentIntent(id) {
            const pi = await stripe.paymentIntents.retrieve(id);
            return { id: pi.id, status: pi.status, amount: pi.amount, currency: pi.currency, metadata: (pi.metadata ?? {}) as Record<string, string> };
        },

        async capturePaymentIntent(id, amountToCaptureMinor) {
            // amount_to_capture may be LESS than the hold (a cheaper order) but never more.
            await stripe.paymentIntents.capture(id, { amount_to_capture: amountToCaptureMinor }, { idempotencyKey: `flight-capture-${id}` });
        },

        withServicePrices: withDuffelServicePrices,
        placeOrder: placeDuffelOrder,
        cancelOrder: (orderId, reason) => cancelDuffelOrder(env.DUFFEL_TOKEN, orderId, reason),

        async saveOrder(sessionId, order, flight) {
            // Stake a claim first: the smallest possible write, one text column. The fuller update
            // below carries arrays and jsonb, and if it rejects, this id is all that points the
            // orphan sweep at a paid order.
            const claim = await db.from('booking_sessions').update({ duffel_pre_order_id: order.orderId }).eq('id', sessionId);
            if (claim.error) console.error(`[settle] could not stake a claim on order ${order.orderId}: ${claim.error.message}`);

            const { error } = await db.from('booking_sessions').update({
                duffel_pre_order_id: order.orderId,
                duffel_pre_order_pnr: order.pnr,
                duffel_pre_order_tickets: order.tickets,
                duffel_pre_order_ticketed: order.isTicketed,
                // The itinerary actually ticketed; create-booking writes flight_segments from it.
                flight: withBookedItinerary(flight, order.rawOrder),
            }).eq('id', sessionId);
            if (error) throw new Error(error.message);
        },
    };
}
