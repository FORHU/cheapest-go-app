import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Duffel telling us an order was cancelled (staff did it in Duffel's dashboard, or the airline did).
 *
 * The traveller's booking has to end up where it would have if they had pressed Cancel: reconciled
 * against what Duffel recorded, the card refunded in proportion, the status moved, the emails sent.
 * That is cancelFlightBooking's job and it is mocked here; what this file pins is everything around
 * it: that a real, correctly signed Duffel delivery is recognised, that nothing unsigned is acted
 * on, that the right booking is found, and that a booking someone else is already handling is left
 * alone.
 */

const h = vi.hoisted(() => ({
    bookings: [] as any[],
    cancel: vi.fn(),
    notify: vi.fn(),
}));

function query(table: string) {
    const filters: Array<(row: any) => boolean> = [];
    const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return chain; },
        or: () => { throw new Error('the Duffel path must look up by duffel_order_id with plain eq()'); },
        maybeSingle: async () => ({ data: (table === 'flight_bookings' ? h.bookings : []).find(r => filters.every(f => f(r))) ?? null, error: null }),
        single: async () => ({ data: (table === 'flight_bookings' ? h.bookings : []).find(r => filters.every(f => f(r))) ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
        rpc: async () => ({ data: null, error: null }),
    };
    return chain;
}

vi.mock('@/utils/postgres/admin', () => ({
    createAdminClient: () => ({ from: (t: string) => query(t), rpc: async () => ({ data: null, error: null }) }),
}));
vi.mock('@/utils/env', () => ({ env: {} }));
vi.mock('@/lib/server/admin/notify', () => ({ createNotification: (...a: unknown[]) => h.notify(...a) }));
vi.mock('@/lib/server/email', () => ({
    sendFlightBookingConfirmationEmail: vi.fn(),
    sendFlightRefundEmail: vi.fn(),
}));
vi.mock('@/lib/server/flights/cancel-flight-booking', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/flights/cancel-flight-booking')>('@/lib/server/flights/cancel-flight-booking');
    return { ...actual, cancelFlightBooking: (...a: unknown[]) => h.cancel(...a) };
});

import { POST } from './route';

const SECRET = 'whsec_flight_test';

const booking = (over: Record<string, unknown> = {}) => ({
    id: 'bk_1', user_id: 'user_1', status: 'ticketed', provider: 'duffel', pnr: '22BH4Z',
    duffel_order_id: 'ord_0000BBMAeol123GZFKyago', payment_intent_id: 'pi_1', total_price: 123.96,
    ...over,
});

const cancellationConfirmed = (orderId = 'ord_0000BBMAeol123GZFKyago') => ({
    id: 'wev_0000A3tQSmKyqOrcySrGbo',
    type: 'order_cancellation.confirmed',
    live_mode: false,
    created_at: '2026-10-13T03:50:01Z',
    data: { object: {
        id: 'ore_0000AyQ', order_id: orderId, refund_amount: '114.96', refund_currency: 'USD',
        refund_to: 'balance', confirmed_at: '2026-10-13T03:50:00Z',
    } },
});

/** A request signed exactly as Duffel documents. */
function delivery(payload: unknown, opts: { secret?: string; t?: string; header?: string | null } = {}) {
    const body = JSON.stringify(payload);
    const t = opts.t ?? '1760330000';
    const v1 = createHmac('sha256', opts.secret ?? SECRET).update(`${t}.${body}`).digest('hex');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.header !== null) headers['X-Duffel-Signature'] = opts.header ?? `t=${t},v1=${v1}`;
    return POST(new Request('http://localhost/api/webhooks/flight-supplier', { method: 'POST', headers, body }) as any);
}

beforeEach(() => {
    vi.stubEnv('DUFFEL_WEBHOOK_SECRET', SECRET);
    h.bookings = [booking()];
    h.cancel.mockReset();
    h.notify.mockReset();
    h.cancel.mockResolvedValue(NextResponse.json({ success: true, status: 'refunded' }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('POST /api/webhooks/flight-supplier — a cancellation confirmed at Duffel', () => {
    it('reconciles the booking the same way the Cancel button would', async () => {
        const res = await delivery(cancellationConfirmed());

        expect(res.status).toBe(200);
        expect(h.cancel).toHaveBeenCalledTimes(1);
        const input = h.cancel.mock.calls[0][0];
        expect(input).toMatchObject({ bookingId: 'bk_1', trigger: 'duffel_webhook' });
        expect(input.booking.duffel_order_id).toBe('ord_0000BBMAeol123GZFKyago');
    });

    it('does not take over a booking the traveller\'s own Cancel is already working on', async () => {
        h.bookings = [booking({ status: 'cancel_requested' })];

        const res = await delivery(cancellationConfirmed());

        // Starting a second cancellation alongside theirs could refund twice and send two sets of emails.
        expect(res.status).toBe(200);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('never offers cancel_requested or refund_failed to the cancellation it starts', async () => {
        await delivery(cancellationConfirmed());

        const { eligibleStatuses } = h.cancel.mock.calls[0][0];
        expect(eligibleStatuses).toEqual(expect.arrayContaining(['ticketed', 'confirmed']));
        expect(eligibleStatuses).not.toContain('cancel_requested');
        expect(eligibleStatuses).not.toContain('refund_failed');
    });

    it('leaves a booking that is already refunded alone', async () => {
        h.bookings = [booking({ status: 'refunded' })];

        const res = await delivery(cancellationConfirmed());

        expect(res.status).toBe(200);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('answers 200 for an order we have no booking for, so Duffel does not retry for three days', async () => {
        const res = await delivery(cancellationConfirmed('ord_someone_elses'));

        expect(res.status).toBe(200);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('answers 200 and does nothing when the event does not say which order it is about', async () => {
        const res = await delivery({ id: 'wev_x', type: 'order_cancellation.confirmed', data: { object: { id: 'ore_1' } } });

        expect(res.status).toBe(200);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('ignores Duffel events that are not a confirmed cancellation', async () => {
        for (const type of ['order.created', 'order_cancellation.created', 'air.payment.succeeded', 'ping.triggered']) {
            const res = await delivery({ id: 'wev_1', type, data: { object: { id: 'ord_0000BBMAeol123GZFKyago', order_id: 'ord_0000BBMAeol123GZFKyago' } } });
            expect(res.status).toBe(200);
        }
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('asks Duffel to retry, and tells ops, when reconciling fails on our side', async () => {
        h.cancel.mockResolvedValue(NextResponse.json({ success: false, error: 'db down' }, { status: 500 }));

        const res = await delivery(cancellationConfirmed());

        expect(res.status).toBe(500);
        expect(h.notify).toHaveBeenCalled();
    });
});

describe('POST /api/webhooks/flight-supplier — who may call it', () => {
    it('rejects a delivery with no signature', async () => {
        const res = await delivery(cancellationConfirmed(), { header: null });

        expect(res.status).toBe(401);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('rejects a delivery signed with another secret', async () => {
        const res = await delivery(cancellationConfirmed(), { secret: 'not_our_secret' });

        expect(res.status).toBe(401);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('rejects the scheme the old handler checked: a bare HMAC of the body in the wrong header', async () => {
        const body = JSON.stringify(cancellationConfirmed());
        const bare = createHmac('sha256', SECRET).update(body).digest('hex');

        const res = await POST(new Request('http://localhost/api/webhooks/flight-supplier', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'duffel-signature': bare }, body,
        }) as any);

        expect(res.status).toBe(401);
        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('refuses to run unsigned in production when no secret is configured', async () => {
        vi.stubEnv('DUFFEL_WEBHOOK_SECRET', '');
        vi.stubEnv('NODE_ENV', 'production');

        const res = await delivery(cancellationConfirmed(), { header: null });

        expect(res.status).toBe(500);
        expect(h.cancel).not.toHaveBeenCalled();
    });
});
