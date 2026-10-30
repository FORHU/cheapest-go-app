import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import type { SessionRow } from './pay-first-payment';

/**
 * The real SQL behind the pay-first session store (`createSessionStore` in pay-first-deps.ts),
 * run against the LOCAL Postgres (`cheapest-go-app-postgres-1`).
 *
 * Integration rather than unit: what matters here is what Postgres does with the partial unique
 * index (23505 on a duplicate live attempt), `IS DISTINCT FROM`, the `IN ${sql(list)}` helper and
 * the status guards, none of which a mocked `sql` can prove.
 *
 * Safety: skipped unless RUN_DB_IT=1 is set AND DATABASE_URL names a loopback host (the explicit
 * opt-in guards against a localhost tunnel to a remote database). The check runs BEFORE the database
 * module is imported, so nothing connects (and no startup DDL runs) against a remote database.
 * It uses a random user id and unique hashes, deletes everything it created in afterAll, and
 * never calls Stripe or Duffel.
 */

function pointsAtLocalDatabase(): boolean {
    if (process.env.RUN_DB_IT !== '1') return false;
    const url = process.env.DATABASE_URL;
    if (!url) return false;
    try {
        const host = new URL(url).hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    } catch {
        return false;
    }
}

async function databaseReachable(): Promise<boolean> {
    if (!pointsAtLocalDatabase()) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function store() {
    const { createSessionStore } = await import('./pay-first-deps');
    return createSessionStore();
}

const userId = randomUUID();
const otherUserId = randomUUID();
const run = randomUUID().slice(0, 8);
const offerX = `off_it_x_${run}`;
const offerY = `off_it_y_${run}`;
const hash = (label: string) => `it_${run}_${label}`;

function sessionRow(over: Partial<SessionRow> & { offerId?: string } = {}): SessionRow {
    const { offerId = offerX, ...rest } = over;
    const h = rest.quote_hash ?? hash(randomUUID().slice(0, 6));
    return {
        user_id: userId, provider: 'duffel', booking_reference: `IT-${run}`,
        flight: { _rawOffer: { id: offerId, total_amount: '100.00', total_currency: 'USD' } },
        passengers: [], contact: { email: 'it@example.com' },
        idempotency_key: h, quote_hash: h,
        fare_policy: null, policy_source: null, policy_version: null,
        is_refundable: null, is_changeable: null, refund_penalty_amount: null, refund_penalty_currency: null,
        policy_locked: true, status: 'initiated', expires_at: new Date(Date.now() + 3600_000).toISOString(),
        ...rest,
    };
}

/** Insert a session in any status directly, bypassing the store. */
async function insertRaw(o: {
    user?: string; offerId?: string; status: string; quoteHash: string; preOrderId?: string | null; paymentIntentId?: string | null;
}): Promise<string> {
    const db = await sql();
    const [row] = await db`
        INSERT INTO booking_sessions (user_id, provider, flight, status, expires_at, quote_hash, duffel_pre_order_id, payment_intent_id)
        VALUES (${o.user ?? userId}, 'duffel', ${db.json({ _rawOffer: { id: o.offerId ?? offerX } } as any)}, ${o.status},
                now() + interval '1 hour', ${o.quoteHash}, ${o.preOrderId ?? null}, ${o.paymentIntentId ?? null})
        RETURNING id
    `;
    return row.id;
}

async function statusOf(id: string): Promise<string> {
    const db = await sql();
    const [row] = await db`SELECT status FROM booking_sessions WHERE id = ${id}`;
    return row.status;
}

afterAll(async () => {
    if (!pointsAtLocalDatabase()) return;
    try {
        const db = await sql();
        await db`DELETE FROM booking_sessions WHERE user_id = ANY(${[userId, otherUserId]})`;
    } catch {
        // Nothing was created if the database was never reachable.
    }
});

describe('pay-first session store (real SQL)', () => {
    it('getOrCreate inserts once, then hands back the live session for an identical attempt (23505)', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const s = await store();
        const row = sessionRow({ quote_hash: hash('dup') });

        const first = await s.getOrCreate(row);
        expect(first.paymentIntentId).toBeNull();

        // Same user + hash, different booking reference: must resolve to the first session.
        const second = await s.getOrCreate({ ...row, booking_reference: `IT-other-${run}` });
        expect(second.sessionId).toBe(first.sessionId);
        expect(second.bookingReference).toBe(`IT-${run}`);

        await s.attachPayment(first.sessionId, {
            payment_intent_id: `pi_it_${run}`, currency: 'usd', original_price: 100, charged_price: 105, markup_pct: 0.05, payment_currency: 'USD',
        });
        const third = await s.getOrCreate(row);
        expect(third.sessionId).toBe(first.sessionId);
        expect(third.paymentIntentId).toBe(`pi_it_${run}`);

        // Once expired, the same hash is a new attempt (the unique index covers live statuses only).
        await s.expireSessions([first.sessionId]);
        const fresh = await s.getOrCreate(row);
        expect(fresh.sessionId).not.toBe(first.sessionId);
    });

    it('attachPayment only fills a session that is still `initiated`, and says so otherwise', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const s = await store();
        const created = await s.getOrCreate(sessionRow({ quote_hash: hash('attach') }));
        const fields = { payment_intent_id: `pi_a_${run}`, currency: 'usd', original_price: 100, charged_price: 105, markup_pct: 0.05, payment_currency: 'USD' };

        await s.attachPayment(created.sessionId, fields);
        const db = await sql();
        const [row] = await db`SELECT status, payment_intent_id, charged_price FROM booking_sessions WHERE id = ${created.sessionId}`;
        expect(row).toMatchObject({ status: 'payment_initiated', payment_intent_id: `pi_a_${run}` });
        expect(Number(row.charged_price)).toBe(105);

        // Already moved on: a second attach must not silently overwrite or pretend to succeed.
        await expect(s.attachPayment(created.sessionId, { ...fields, payment_intent_id: 'pi_overwrite' })).rejects.toThrow();
        const [after] = await db`SELECT payment_intent_id FROM booking_sessions WHERE id = ${created.sessionId}`;
        expect(after.payment_intent_id).toBe(`pi_a_${run}`);

        const expired = await s.getOrCreate(sessionRow({ quote_hash: hash('attach-exp') }));
        await s.expireSessions([expired.sessionId]);
        await expect(s.attachPayment(expired.sessionId, fields)).rejects.toThrow();

        await expect(s.attachPayment(randomUUID(), fields)).rejects.toThrow();
    });

    it('listOtherAttempts returns every live session for this user and offer with a different hash, flagging the ones that hold an order', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const s = await store();
        const keep = hash('list-keep');
        // Its own offer id: earlier tests in this file leave live sessions on offerX.
        const offerL = `off_it_l_${run}`;

        const initiated = await insertRaw({ offerId: offerL, status: 'initiated', quoteHash: hash('list-init') });
        const paymentInitiated = await insertRaw({ offerId: offerL, status: 'payment_initiated', quoteHash: hash('list-pi'), paymentIntentId: `pi_l1_${run}` });
        const authorized = await insertRaw({ offerId: offerL, status: 'payment_authorized', quoteHash: hash('list-auth'), paymentIntentId: `pi_l2_${run}` });
        const processing = await insertRaw({ offerId: offerL, status: 'processing', quoteHash: hash('list-proc') });
        // A session that already holds an airline order (the post-authorisation step writes
        // duffel_pre_order_id while it is still processing; legacy pre-order sessions have it too).
        const orderPayment = await insertRaw({ offerId: offerL, status: 'payment_initiated', quoteHash: hash('list-order'), preOrderId: `ord_${run}` });
        const orderProcessing = await insertRaw({ offerId: offerL, status: 'processing', quoteHash: hash('list-order-proc'), preOrderId: `ord2_${run}` });
        // Must NOT be returned:
        const sameHash = await insertRaw({ offerId: offerL, status: 'initiated', quoteHash: keep });
        const otherOffer = await insertRaw({ status: 'initiated', quoteHash: hash('list-offer'), offerId: offerY });
        const otherUser = await insertRaw({ offerId: offerL, status: 'initiated', quoteHash: hash('list-user'), user: otherUserId });
        const expired = await insertRaw({ offerId: offerL, status: 'expired', quoteHash: hash('list-exp') });
        const booked = await insertRaw({ offerId: offerL, status: 'booked', quoteHash: hash('list-booked') });

        const found = await s.listOtherAttempts(userId, offerL, keep);
        const byId = new Map(found.map(f => [f.sessionId, f]));

        expect([...byId.keys()].sort()).toEqual([initiated, paymentInitiated, authorized, processing, orderPayment, orderProcessing].sort());
        expect(byId.get(paymentInitiated)).toEqual({ sessionId: paymentInitiated, status: 'payment_initiated', paymentIntentId: `pi_l1_${run}`, hasOrder: false });
        expect(byId.get(authorized)!.status).toBe('payment_authorized');
        expect(byId.get(initiated)!.paymentIntentId).toBeNull();
        for (const plain of [initiated, paymentInitiated, authorized, processing]) {
            expect(byId.get(plain)!.hasOrder).toBe(false);
        }
        expect(byId.get(orderPayment)).toEqual({ sessionId: orderPayment, status: 'payment_initiated', paymentIntentId: null, hasOrder: true });
        expect(byId.get(orderProcessing)!.hasOrder).toBe(true);
        for (const excluded of [sameHash, otherOffer, otherUser, expired, booked]) {
            expect(byId.has(excluded)).toBe(false);
        }
    });

    it('listOtherAttempts also returns a session with no quote hash recorded (IS DISTINCT FROM)', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const s = await store();
        const db = await sql();
        const offerZ = `off_it_z_${run}`;
        const [row] = await db`
            INSERT INTO booking_sessions (user_id, provider, flight, status, expires_at, quote_hash)
            VALUES (${userId}, 'duffel', ${db.json({ _rawOffer: { id: offerZ } } as any)}, 'initiated', now() + interval '1 hour', NULL)
            RETURNING id
        `;
        const found = await s.listOtherAttempts(userId, offerZ, hash('anything'));
        expect(found.map(f => f.sessionId)).toEqual([row.id]);
    });

    it('expireSessions retires only initiated / payment_initiated sessions, returns exactly the rows it moved, and ignores an empty list', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const s = await store();
        const ids = {
            initiated: await insertRaw({ status: 'initiated', quoteHash: hash('exp-init') }),
            paymentInitiated: await insertRaw({ status: 'payment_initiated', quoteHash: hash('exp-pi'), paymentIntentId: `pi_e1_${run}` }),
            authorized: await insertRaw({ status: 'payment_authorized', quoteHash: hash('exp-auth'), paymentIntentId: `pi_e2_${run}` }),
            processing: await insertRaw({ status: 'processing', quoteHash: hash('exp-proc') }),
            booked: await insertRaw({ status: 'booked', quoteHash: hash('exp-booked') }),
            untouched: await insertRaw({ status: 'initiated', quoteHash: hash('exp-untouched') }),
        };

        expect(await s.expireSessions([])).toEqual([]);
        expect(await statusOf(ids.initiated)).toBe('initiated');

        const moved = await s.expireSessions([ids.initiated, ids.paymentInitiated, ids.authorized, ids.processing, ids.booked]);

        // Only what the UPDATE transitioned, with the intent the row held at that moment.
        expect([...moved].sort((a, b) => a.sessionId.localeCompare(b.sessionId))).toEqual([
            { sessionId: ids.initiated, paymentIntentId: null },
            { sessionId: ids.paymentInitiated, paymentIntentId: `pi_e1_${run}` },
        ].sort((a, b) => a.sessionId.localeCompare(b.sessionId)));

        expect(await statusOf(ids.initiated)).toBe('expired');
        expect(await statusOf(ids.paymentInitiated)).toBe('expired');
        expect(await statusOf(ids.authorized)).toBe('payment_authorized');
        expect(await statusOf(ids.processing)).toBe('processing');
        expect(await statusOf(ids.booked)).toBe('booked');
        expect(await statusOf(ids.untouched)).toBe('initiated');

        // Already expired: a second call moves nothing and returns nothing.
        expect(await s.expireSessions([ids.initiated, ids.paymentInitiated])).toEqual([]);
    });

    it('getPaymentIntentId reads the intent a session currently holds, or null', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const s = await store();
        const created = await s.getOrCreate(sessionRow({ quote_hash: hash('getpi') }));
        expect(await s.getPaymentIntentId(created.sessionId)).toBeNull();

        await s.attachPayment(created.sessionId, {
            payment_intent_id: `pi_g_${run}`, currency: 'usd', original_price: 100, charged_price: 105, markup_pct: 0.05, payment_currency: 'USD',
        });
        expect(await s.getPaymentIntentId(created.sessionId)).toBe(`pi_g_${run}`);

        // No such session: null, not an error.
        expect(await s.getPaymentIntentId(randomUUID())).toBeNull();
    });
});
