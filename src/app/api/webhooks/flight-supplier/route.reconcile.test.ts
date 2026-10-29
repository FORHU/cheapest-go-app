import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

/**
 * The whole path with nothing stubbed between the webhook and the money: a signed Duffel
 * "cancellation confirmed" delivery ends in a Stripe refund through the real cancellation function.
 * Only the outside world is faked: the database, Duffel's API, Stripe and email.
 */

const h = vi.hoisted(() => ({
    tables: {} as Record<string, any[]>,
    refundsCreate: vi.fn(),
    retrieve: vi.fn(),
    notify: vi.fn(),
}));

function query(table: string) {
    const filters: Array<(row: any) => boolean> = [];
    let patch: any = null;
    const run = () => {
        const matched = (h.tables[table] ?? []).filter(r => filters.every(f => f(r)));
        if (patch) for (const r of matched) Object.assign(r, patch);
        return matched;
    };
    const chain: any = {
        select: () => chain,
        update: (values: any) => { patch = values; return chain; },
        eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return chain; },
        in: (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return chain; },
        single: async () => { const m = run(); return m.length ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } }; },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
    };
    return chain;
}

vi.mock('@/utils/postgres/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t), rpc: async () => ({}) }) }));
vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'duffel_test_abc' } }));
vi.mock('@/lib/server/admin/notify', () => ({ createNotification: (...a: unknown[]) => h.notify(...a) }));
vi.mock('@/lib/server/email', () => ({
    sendFlightCancellationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendFlightCancellationRefundEmail: vi.fn().mockResolvedValue({ success: true }),
    sendFlightBookingConfirmationEmail: vi.fn(),
    sendFlightRefundEmail: vi.fn(),
    mapFlightSegmentsForEmail: () => [],
}));
vi.mock('@/lib/stripe/server', () => ({
    stripe: {
        paymentIntents: { retrieve: (...a: unknown[]) => h.retrieve(...a), cancel: vi.fn(), search: async () => ({ data: [] }) },
        refunds: { create: (...a: unknown[]) => h.refundsCreate(...a) },
    },
}));

import { POST } from './route';

const SECRET = 'whsec_flight_test';
const ORDER_ID = 'ord_0000BBMAeol123GZFKyago';

const ticketed = (over: Record<string, unknown> = {}) => ({
    id: 'bk_1', user_id: 'user_1', status: 'ticketed', provider: 'duffel', pnr: '22BH4Z',
    payment_intent_id: 'pi_1', created_at: '2026-10-13T03:29:42Z', cancellation_log: [], session_id: 'sess_1',
    total_price: 123.96, charged_price: 135, payment_currency: 'USD', refund_amount: null,
    refund_penalty_amount: null, refund_currency: null, supplier_currency: null, duffel_order_id: ORDER_ID,
    ...over,
});

const event = () => ({
    id: 'wev_0000A3tQSmKyqOrcySrGbo', type: 'order_cancellation.confirmed', live_mode: false,
    data: { object: {
        id: 'ore_1', order_id: ORDER_ID, refund_amount: '110.00', refund_currency: 'USD',
        refund_to: 'balance', confirmed_at: '2026-10-13T03:50:00Z',
    } },
});

function deliver(payload: unknown) {
    const body = JSON.stringify(payload);
    const t = '1760330000';
    const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
    return POST(new Request('http://localhost/api/webhooks/flight-supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Duffel-Signature': `t=${t},v1=${v1}` },
        body,
    }) as any);
}

/** Duffel: the order is already cancelled, with the refund it recorded. */
function duffelHasCancelled() {
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ method, url });
        if (method === 'GET' && url.includes('/air/orders/')) {
            return new Response(JSON.stringify({ data: {
                id: ORDER_ID, cancelled_at: '2026-10-13T03:50:00Z', available_actions: [],
                cancellation: { refund_amount: '110.00', refund_currency: 'USD', refund_to: 'balance', confirmed_at: '2026-10-13T03:50:00Z' },
            } }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
    }));
    return calls;
}

beforeEach(() => {
    vi.stubEnv('DUFFEL_WEBHOOK_SECRET', SECRET);
    h.tables = {
        flight_bookings: [ticketed()],
        booking_sessions: [{ id: 'sess_1', contact: { email: 'ana@example.com' }, passengers: [{ firstName: 'Ana', lastName: 'Cruz' }] }],
        flight_segments: [],
    };
    h.refundsCreate.mockReset().mockResolvedValue({ id: 're_1', status: 'succeeded' });
    h.retrieve.mockReset().mockResolvedValue({ id: 'pi_1', status: 'succeeded', amount: 13500, currency: 'usd' });
    h.notify.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('a cancellation confirmed in Duffel\'s dashboard reaches the traveller\'s card', () => {
    it('refunds the card in proportion to what Duffel refunded, and marks the booking refunded', async () => {
        const calls = duffelHasCancelled();

        const res = await deliver(event());

        expect(res.status).toBe(200);
        const expectedCents = Math.round(13500 * (110 / (110 + (123.96 - 110))));
        expect(h.refundsCreate).toHaveBeenCalledTimes(1);
        expect(h.refundsCreate.mock.calls[0][0]).toMatchObject({ payment_intent: 'pi_1', amount: expectedCents });
        expect(h.tables.flight_bookings[0].status).toBe('refunded');
        expect(JSON.stringify(h.tables.flight_bookings[0].cancellation_log)).toMatch(/webhook/i);
        // It reads Duffel's record; it never asks Duffel to cancel something already cancelled.
        expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
    });

    it('does not refund twice when Duffel delivers the same event again', async () => {
        duffelHasCancelled();

        await deliver(event());
        const second = await deliver(event());

        expect(second.status).toBe(200);
        expect(h.refundsCreate).toHaveBeenCalledTimes(1);
    });

    it('leaves a booking the traveller\'s own Cancel is working on to that request', async () => {
        h.tables.flight_bookings = [ticketed({ status: 'cancel_requested' })];
        duffelHasCancelled();

        const res = await deliver(event());

        expect(res.status).toBe(200);
        expect(h.refundsCreate).not.toHaveBeenCalled();
        expect(h.tables.flight_bookings[0].status).toBe('cancel_requested');
    });

    it('holds the booking for a person when Duffel recorded no refund amount', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: {
            id: ORDER_ID, cancelled_at: '2026-10-13T03:50:00Z', available_actions: [],
            cancellation: { refund_amount: null, refund_currency: null, refund_to: 'awaiting_payment', confirmed_at: '2026-10-13T03:50:00Z' },
        } }), { status: 200 })));

        await deliver(event());

        expect(h.refundsCreate).not.toHaveBeenCalled();
        expect(h.tables.flight_bookings[0].status).toBe('cancelled');
        expect(h.notify).toHaveBeenCalled();
    });
});
