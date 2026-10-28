import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe } from '@/lib/stripe/server';
import { convertCurrencyStrict } from '@/lib/currency';
import { withDuffelServicePrices } from './duffel-service-prices';
import type { PayFirstDeps, SessionStore, PaymentGateway } from './pay-first-payment';

/** Statuses in which a session still represents a live attempt (matches the unique index). */
const LIVE = ['initiated', 'payment_initiated', 'payment_authorized', 'processing'];

function sessionStore(): SessionStore {
    const db = createAdminClient();
    return {
        async getOrCreate(row) {
            const { data, error } = await db
                .from('booking_sessions')
                .insert(row as any)
                .select('id, payment_intent_id, booking_reference')
                .single();
            if (!error && data) {
                return { sessionId: data.id, created: true, paymentIntentId: data.payment_intent_id ?? null, bookingReference: data.booking_reference };
            }
            // 23505 = the partial unique index: an identical live attempt exists. Use it.
            if (error?.code !== '23505') throw new Error(error?.message || 'Failed to create booking session');

            const { data: existing, error: findError } = await db
                .from('booking_sessions')
                .select('id, payment_intent_id, booking_reference')
                .eq('user_id', row.user_id)
                .eq('quote_hash', row.quote_hash)
                .in('status', LIVE)
                .single();
            if (findError || !existing) throw new Error(findError?.message || 'Booking session conflict could not be resolved');
            return { sessionId: existing.id, created: false, paymentIntentId: existing.payment_intent_id ?? null, bookingReference: existing.booking_reference };
        },

        async attachPayment(sessionId, fields) {
            const { error } = await db
                .from('booking_sessions')
                .update({ ...fields, status: 'payment_initiated' })
                .eq('id', sessionId);
            if (error) throw new Error(error.message);
        },

        async supersedeOthers(userId, offerId, keepSessionId) {
            const sql = getSqlAdmin();
            // Only sessions that hold no airline order: an order-bearing session belongs to the
            // old flow (or a live booking) and must not be touched from here.
            const rows = await sql`
                UPDATE booking_sessions
                SET status = 'expired'
                WHERE user_id = ${userId}
                  AND id <> ${keepSessionId}
                  AND status IN ('initiated', 'payment_initiated')
                  AND duffel_pre_order_id IS NULL
                  AND flight->'_rawOffer'->>'id' = ${offerId}
                RETURNING payment_intent_id
            `;
            return rows.map((r: any) => r.payment_intent_id).filter(Boolean) as string[];
        },
    };
}

function paymentGateway(): PaymentGateway {
    const summary = (pi: { id: string; status: string; client_secret: string | null }) => ({
        id: pi.id, status: pi.status, client_secret: pi.client_secret,
    });
    return {
        async createIntent(params, idempotencyKey) {
            return summary(await stripe.paymentIntents.create(params as any, { idempotencyKey }));
        },
        async retrieveIntent(id) {
            return summary(await stripe.paymentIntents.retrieve(id));
        },
        async cancelIntent(id) {
            await stripe.paymentIntents.cancel(id);
        },
    };
}

export function defaultPayFirstDeps(): PayFirstDeps {
    return {
        withServicePrices: withDuffelServicePrices,
        convert: convertCurrencyStrict,
        store: sessionStore(),
        gateway: paymentGateway(),
    };
}
