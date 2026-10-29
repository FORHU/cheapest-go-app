import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe } from '@/lib/stripe/server';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { withDuffelServicePrices } from './duffel-service-prices';
import type { PayFirstDeps, SessionStore, PaymentGateway } from './pay-first-payment';

/** Statuses in which a session still represents a live attempt (matches the unique index). */
const LIVE = ['initiated', 'payment_initiated', 'payment_authorized', 'processing'];

/** Exported for the integration test, which runs the SQL below against the local database. */
export function createSessionStore(): SessionStore {
    const db = createAdminClient();
    return {
        async getOrCreate(row) {
            const { data, error } = await db
                .from('booking_sessions')
                .insert(row as any)
                .select('id, payment_intent_id, booking_reference')
                .single();
            if (!error && data) {
                return { sessionId: data.id, paymentIntentId: data.payment_intent_id ?? null, bookingReference: data.booking_reference };
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
            return { sessionId: existing.id, paymentIntentId: existing.payment_intent_id ?? null, bookingReference: existing.booking_reference };
        },

        async attachPayment(sessionId, fields) {
            // Only a session that is still waiting for its first intent may take one: a row in any
            // other state was expired or moved on while this request was in flight.
            const { data, error } = await db
                .from('booking_sessions')
                .update({ ...fields, status: 'payment_initiated' })
                .eq('id', sessionId)
                .eq('status', 'initiated')
                .select('id');
            if (error) throw new Error(error.message);
            if (!data || data.length === 0) throw new Error('Booking session is no longer open for payment');
        },

        async getPaymentIntentId(sessionId) {
            const sql = getSqlAdmin();
            const rows = await sql`SELECT payment_intent_id FROM booking_sessions WHERE id = ${sessionId}`;
            return (rows[0]?.payment_intent_id ?? null) as string | null;
        },

        async listOtherAttempts(userId, offerId, excludeHash) {
            const sql = getSqlAdmin();
            // Order-bearing sessions are included: the post-authorisation step writes the order id
            // while a pay-first session is still paying, and that session must still block a
            // second attempt. The module never retires one (`hasOrder`).
            const rows = await sql`
                SELECT id, status, payment_intent_id, (duffel_pre_order_id IS NOT NULL) AS has_order
                FROM booking_sessions
                WHERE user_id = ${userId}
                  AND status IN ${sql(LIVE)}
                  AND flight->'_rawOffer'->>'id' = ${offerId}
                  AND quote_hash IS DISTINCT FROM ${excludeHash}
            `;
            return rows.map((r: any) => ({
                sessionId: r.id as string,
                status: r.status as string,
                paymentIntentId: (r.payment_intent_id ?? null) as string | null,
                hasOrder: r.has_order === true,
            }));
        },

        async expireSessions(sessionIds) {
            if (sessionIds.length === 0) return [];
            const sql = getSqlAdmin();
            // Never touches a session that is authorised, processing or finished, and reports only
            // the rows it actually moved — their holds are the only ones the caller may release.
            const rows = await sql`
                UPDATE booking_sessions
                SET status = 'expired'
                WHERE id IN ${sql(sessionIds)}
                  AND status IN ('initiated', 'payment_initiated')
                RETURNING id, payment_intent_id
            `;
            return rows.map((r: any) => ({
                sessionId: r.id as string,
                paymentIntentId: (r.payment_intent_id ?? null) as string | null,
            }));
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
        // Cached per instance; only fetches when this instance has no rates or stale ones.
        ensureRates: async () => { await refreshExchangeRates(); },
        store: createSessionStore(),
        gateway: paymentGateway(),
    };
}
