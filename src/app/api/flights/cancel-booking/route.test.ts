import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Cancelling a booking whose Duffel order has already been cancelled.
 *
 * The case that started this: staff cancel the order in Duffel's dashboard, the traveller (or an
 * admin) then presses Cancel in the app. The app has to notice the order is already gone, take the
 * refund Duffel recorded, and refund the card, rather than reporting that it "cannot be cancelled
 * via API" and leaving the money with us and the booking looking live.
 */

const h = vi.hoisted(() => ({
    tables: {} as Record<string, any[]>,
    updates: [] as Array<{ table: string; values: any }>,
    retrieve: vi.fn(),
    refundsCreate: vi.fn(),
    piCancel: vi.fn(),
    notify: vi.fn(),
    sendCancellation: vi.fn(),
    sendRefund: vi.fn(),
}));

// An in-memory stand-in for the admin client: just enough query surface for this route.
function query(table: string) {
    const filters: Array<(row: any) => boolean> = [];
    let patch: any = null;
    const run = () => {
        const matched = (h.tables[table] ?? []).filter(r => filters.every(f => f(r)));
        if (patch) {
            for (const r of matched) Object.assign(r, patch);
            h.updates.push({ table, values: patch });
        }
        return matched;
    };
    const chain: any = {
        select: () => chain,
        update: (values: any) => { patch = values; return chain; },
        eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return chain; },
        in: (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return chain; },
        single: async () => {
            const m = run();
            // A copy, as a database returns: handing back the stored object would let this route's own
            // status update change the booking it is holding, which no real query does.
            return m.length ? { data: structuredClone(m[0]), error: null } : { data: null, error: { message: 'not found' } };
        },
        maybeSingle: async () => { const r = run()[0]; return { data: r ? structuredClone(r) : null, error: null }; },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
    };
    return chain;
}

vi.mock('@/utils/postgres/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }));
vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ user: { id: 'user_1' } }) }));
vi.mock('@/lib/server/csrf', () => ({ checkCsrf: () => null }));
vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'duffel_test_abc' } }));
vi.mock('@/lib/server/admin/notify', () => ({ createNotification: (...a: unknown[]) => h.notify(...a) }));
vi.mock('@/lib/server/email', () => ({
    sendFlightCancellationEmail: (...a: unknown[]) => h.sendCancellation(...a),
    sendFlightCancellationRefundEmail: (...a: unknown[]) => h.sendRefund(...a),
    mapFlightSegmentsForEmail: () => [],
}));
vi.mock('@/lib/stripe/server', () => ({
    stripe: {
        paymentIntents: {
            retrieve: (...a: unknown[]) => h.retrieve(...a),
            cancel: (...a: unknown[]) => h.piCancel(...a),
            search: async () => ({ data: [] }),
        },
        refunds: { create: (...a: unknown[]) => h.refundsCreate(...a) },
    },
}));

import { POST } from './route';

const booking = (over: Record<string, unknown> = {}) => ({
    id: 'bk_1', user_id: 'user_1', status: 'ticketed', provider: 'duffel', pnr: '22BH4Z',
    payment_intent_id: 'pi_1', created_at: '2026-10-13T03:29:42Z', cancellation_log: [], session_id: 'sess_1',
    total_price: 123.96, charged_price: 135, payment_currency: 'USD', refund_amount: null,
    refund_penalty_amount: null, refund_currency: null, supplier_currency: null, duffel_order_id: 'ord_1',
    ...over,
});

const CANCELLED_AT_DUFFEL = {
    id: 'ord_1', booking_reference: '22BH4Z', cancelled_at: '2026-10-13T03:50:00Z',
    cancellation: {
        refund_amount: '110.00', refund_currency: 'USD', refund_to: 'balance',
        confirmed_at: '2026-10-13T03:50:00Z', expires_at: null,
    },
    available_actions: [],
};

const LIVE_ORDER = { id: 'ord_1', cancelled_at: null, cancellation: null, available_actions: ['cancel', 'change'] };

function duffel(order: unknown) {
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ method, url });
        if (method === 'GET' && url.includes('/air/orders/')) {
            return new Response(JSON.stringify({ data: order }), { status: 200 });
        }
        if (method === 'POST' && url.endsWith('/air/order_cancellations')) {
            return new Response(JSON.stringify({ data: { id: 'ore_1', refund_amount: '100.00', refund_currency: 'USD' } }), { status: 201 });
        }
        if (method === 'POST' && url.endsWith('/actions/confirm')) {
            return new Response(JSON.stringify({ data: {
                id: 'ore_1', refund_amount: '100.00', refund_currency: 'USD', refund_to: 'balance',
                confirmed_at: '2026-10-13T04:00:00Z',
            } }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
    }));
    return calls;
}

const cancel = () => POST(new Request('http://localhost/api/flights/cancel-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'bk_1' }),
}) as any);

/** Requests that ask Duffel to START a cancellation (the quote), not the confirm that follows it. */
const supplierCalls = (calls: Array<{ method: string; url: string }>) =>
    calls.filter(c => c.method === 'POST' && c.url.endsWith('/air/order_cancellations'));

const row = () => h.tables.flight_bookings[0];

beforeEach(() => {
    h.tables = {
        flight_bookings: [booking()],
        booking_sessions: [{ id: 'sess_1', contact: { email: 'ana@example.com' }, passengers: [{ firstName: 'Ana', lastName: 'Cruz' }] }],
        flight_segments: [],
    };
    h.updates.length = 0;
    for (const fn of [h.retrieve, h.refundsCreate, h.piCancel, h.notify, h.sendCancellation, h.sendRefund]) fn.mockReset();
    // The traveller paid $135.00 for a $123.96 order (our markup on top).
    h.retrieve.mockResolvedValue({ id: 'pi_1', status: 'succeeded', amount: 13500, currency: 'usd' });
    h.refundsCreate.mockResolvedValue({ id: 're_1', status: 'succeeded' });
    h.sendCancellation.mockResolvedValue({ success: true });
    h.sendRefund.mockResolvedValue({ success: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('POST /api/flights/cancel-booking — order already cancelled at Duffel', () => {
    it('refunds the card and marks the booking refunded, from the refund Duffel recorded', async () => {
        const calls = duffel(CANCELLED_AT_DUFFEL);

        const res = await cancel();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toMatchObject({ success: true, status: 'refunded' });
        // The customer gets the share of what they paid that matches what Duffel refunded us.
        const expectedCents = Math.round(13500 * (110 / (110 + (123.96 - 110))));
        expect(h.refundsCreate).toHaveBeenCalledTimes(1);
        expect(h.refundsCreate.mock.calls[0][0]).toMatchObject({ payment_intent: 'pi_1', amount: expectedCents });
        expect(row().status).toBe('refunded');
        // It must not try to cancel an order that is already cancelled.
        expect(supplierCalls(calls)).toHaveLength(0);
    });

    it('does the same when Duffel still lists "cancel" among the order\'s actions', async () => {
        const calls = duffel({ ...CANCELLED_AT_DUFFEL, available_actions: ['cancel', 'change'] });

        const json = await (await cancel()).json();

        expect(json).toMatchObject({ success: true, status: 'refunded' });
        expect(h.refundsCreate).toHaveBeenCalledTimes(1);
        expect(supplierCalls(calls)).toHaveLength(0);
    });

    it('says in the booking\'s log that Duffel had already cancelled it', async () => {
        duffel(CANCELLED_AT_DUFFEL);

        await cancel();

        const log = JSON.stringify(row().cancellation_log);
        expect(log).toMatch(/already cancelled at Duffel/i);
    });

    it('does not guess a refund when Duffel recorded none: it holds the booking for a person to decide', async () => {
        duffel({
            ...CANCELLED_AT_DUFFEL,
            cancellation: { refund_amount: null, refund_currency: null, refund_to: 'awaiting_payment', confirmed_at: '2026-10-13T03:50:00Z' },
        });

        await cancel();

        expect(h.refundsCreate).not.toHaveBeenCalled();
        expect(row().status).toBe('cancelled');
        expect(h.notify).toHaveBeenCalled();
    });

    it('is safe to press twice: a second request does not refund again', async () => {
        duffel(CANCELLED_AT_DUFFEL);

        await cancel();
        const second = await (await cancel()).json();

        expect(second).toMatchObject({ success: true, idempotent: true });
        expect(h.refundsCreate).toHaveBeenCalledTimes(1);
    });
});

describe('POST /api/flights/cancel-booking — behaviour that must not change', () => {
    it('still cancels a live order through Duffel and refunds from the confirmed amount', async () => {
        const calls = duffel(LIVE_ORDER);

        const json = await (await cancel()).json();

        expect(json).toMatchObject({ success: true, status: 'refunded' });
        expect(supplierCalls(calls)).toHaveLength(1);
        expect(calls.some(c => c.url.endsWith('/actions/confirm'))).toBe(true);
        expect(h.refundsCreate).toHaveBeenCalledTimes(1);
    });

    it('still refuses a live order Duffel will not cancel through the API, and refunds nothing', async () => {
        duffel({ id: 'ord_1', cancelled_at: null, cancellation: null, available_actions: ['change'] });

        const res = await cancel();
        const json = await res.json();

        expect(res.status).toBe(422);
        expect(json).toMatchObject({ success: false, status: 'cancel_failed', requiresManualCancellation: true });
        expect(h.refundsCreate).not.toHaveBeenCalled();
    });

    it('does not refund for a quote that was created and never confirmed', async () => {
        // An unconfirmed quote sitting on a live order is not a cancellation.
        const calls = duffel({
            id: 'ord_1', cancelled_at: null, available_actions: ['cancel'],
            cancellation: { refund_amount: '110.00', refund_currency: 'USD', confirmed_at: null },
        });

        await cancel();

        // It went down the normal path (asked Duffel to cancel), rather than refunding on the strength of a quote.
        expect(supplierCalls(calls)).toHaveLength(1);
    });
});

describe('POST /api/flights/cancel-booking — who the booking records as having cancelled it', () => {
    it('records the supplier when Duffel had already cancelled the order', async () => {
        duffel(CANCELLED_AT_DUFFEL);

        await cancel();

        // The Trips card says "Cancelled by Duffel" from this, not from reading the log's wording.
        expect(row().cancelled_by).toBe('supplier');
    });

    it('records the supplier on a cancellation held for a person too, not only on a refund', async () => {
        duffel({
            ...CANCELLED_AT_DUFFEL,
            cancellation: { refund_amount: null, refund_currency: null, refund_to: 'awaiting_payment', confirmed_at: '2026-10-13T03:50:00Z' },
        });

        await cancel();

        expect(row().status).toBe('cancelled');
        expect(row().cancelled_by).toBe('supplier');
    });

    it('records the traveller when this request is what cancelled the order', async () => {
        duffel(LIVE_ORDER);

        await cancel();

        expect(row().status).toBe('refunded');
        expect(row().cancelled_by).toBe('traveller');
    });

    it('does not rewrite who cancelled when a failed refund is retried', async () => {
        // The retry skips the supplier, so it cannot tell the order was cancelled elsewhere; it must not
        // conclude that the traveller did it.
        h.tables.flight_bookings = [booking({ status: 'refund_failed', refund_amount: 110, refund_currency: 'USD', cancelled_by: 'supplier' })];
        duffel(CANCELLED_AT_DUFFEL);

        await cancel();

        expect(row().status).toBe('refunded');
        expect(row().cancelled_by).toBe('supplier');
    });

    it('leaves a booking that was never cancelled with no recorded canceller', async () => {
        duffel({ id: 'ord_1', cancelled_at: null, cancellation: null, available_actions: ['change'] });

        await cancel();

        expect(row().status).toBe('cancel_failed');
        expect(row().cancelled_by ?? null).toBeNull();
    });
});
