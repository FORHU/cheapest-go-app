import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * Asking Duffel whether a booking the traveller is looking at has been cancelled there.
 *
 * Duffel's webhook is the push channel, and it cannot reach a developer's machine or an
 * unconfigured deployment. This is the pull channel: when the traveller opens My Trips, look at the
 * order itself. It must end exactly where the webhook and the Cancel button end (cancelFlightBooking,
 * mocked here: it has its own suites), and it must never act on anything but a confirmed Duffel
 * cancellation, because acting means moving a customer's money.
 */

const h = vi.hoisted(() => ({ cancel: vi.fn() }));

vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'duffel_test_abc' } }));
vi.mock('@/lib/server/flights/cancel-flight-booking', () => ({
    cancelFlightBooking: (...a: unknown[]) => h.cancel(...a),
}));

import { syncDuffelCancellation, DUFFEL_RECONCILABLE_STATUSES } from './sync-duffel-cancellation';

const ORDER_ID = 'ord_0000BBMYongK0N';

const booking = (over: Record<string, unknown> = {}) => ({
    id: 'bk_1', user_id: 'user_1', status: 'ticketed', provider: 'duffel', pnr: 'U5V64Y',
    duffel_order_id: ORDER_ID, payment_intent_id: 'pi_1', total_price: 130.61, ...over,
});

const CANCELLED = {
    id: ORDER_ID, cancelled_at: '2026-10-13T08:30:00Z', available_actions: [],
    cancellation: { refund_amount: '120.00', refund_currency: 'USD', refund_to: 'balance', confirmed_at: '2026-10-13T08:30:00Z' },
};
const LIVE = { id: ORDER_ID, cancelled_at: null, cancellation: null, available_actions: ['cancel', 'change'] };

function duffelReturns(order: unknown, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: order }), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const run = (b = booking()) => syncDuffelCancellation({ supabase: {}, booking: b, bookingId: b.id as string });

beforeEach(() => {
    h.cancel.mockReset();
    h.cancel.mockResolvedValue(NextResponse.json({
        success: true, status: 'refunded', refundAmount: 120, refundCurrency: 'USD',
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('syncDuffelCancellation — what it reconciles', () => {
    it('reconciles a booking whose order Duffel has confirmed cancelled', async () => {
        duffelReturns(CANCELLED);

        const out = await run();

        expect(h.cancel).toHaveBeenCalledTimes(1);
        expect(h.cancel.mock.calls[0][0]).toMatchObject({ bookingId: 'bk_1', trigger: 'duffel_sync' });
        expect(out).toMatchObject({ changed: true, status: 'refunded', refundAmount: 120, refundCurrency: 'USD' });
    });

    it('leaves a booking alone while its order is live at Duffel', async () => {
        duffelReturns(LIVE);

        const out = await run();

        expect(h.cancel).not.toHaveBeenCalled();
        expect(out).toMatchObject({ changed: false, reason: 'live_at_duffel' });
    });

    it('does not treat an unconfirmed cancellation quote as a cancellation', async () => {
        duffelReturns({
            id: ORDER_ID, cancelled_at: null, available_actions: ['cancel'],
            cancellation: { refund_amount: '120.00', refund_currency: 'USD', confirmed_at: null },
        });

        await run();

        expect(h.cancel).not.toHaveBeenCalled();
    });

    it('offers the reconciliation the same statuses the webhook does, and never the one the Cancel button owns', async () => {
        duffelReturns(CANCELLED);

        await run();

        const { eligibleStatuses } = h.cancel.mock.calls[0][0];
        expect(eligibleStatuses).toEqual(DUFFEL_RECONCILABLE_STATUSES);
        expect(eligibleStatuses).not.toContain('cancel_requested');
        expect(eligibleStatuses).not.toContain('refund_failed');
    });
});

describe('syncDuffelCancellation — what it never touches', () => {
    it.each(['refunded', 'refund_pending', 'cancelled', 'cancel_requested', 'refund_failed', 'failed'])(
        'does not even ask Duffel about a booking that is already %s',
        async (status) => {
            const fetchMock = duffelReturns(CANCELLED);

            const out = await run(booking({ status }));

            expect(fetchMock).not.toHaveBeenCalled();
            expect(h.cancel).not.toHaveBeenCalled();
            expect(out).toMatchObject({ changed: false, reason: 'not_live' });
        },
    );

    it('ignores Mystifly bookings', async () => {
        const fetchMock = duffelReturns(CANCELLED);

        const out = await run(booking({ provider: 'mystifly_v2', duffel_order_id: null }));

        expect(fetchMock).not.toHaveBeenCalled();
        expect(out).toMatchObject({ changed: false, reason: 'not_duffel' });
    });

    it('ignores a Duffel booking that has no order id to look up', async () => {
        const fetchMock = duffelReturns(CANCELLED);

        const out = await run(booking({ duffel_order_id: null }));

        expect(fetchMock).not.toHaveBeenCalled();
        expect(out).toMatchObject({ changed: false, reason: 'not_duffel' });
    });
});

describe('syncDuffelCancellation — when Duffel cannot be read', () => {
    it.each([
        ['an error response', 500],
        ['an order it cannot find', 404],
    ])('does nothing for %s: absence is not a cancellation', async (_label, status) => {
        duffelReturns({ errors: [{ message: 'nope' }] }, status);

        const out = await run();

        // cancelFlightBooking treats a 404 as "supplier record gone" and refunds in full. That is
        // right when a traveller asked to cancel; it is not something to do on a page view.
        expect(h.cancel).not.toHaveBeenCalled();
        expect(out).toMatchObject({ changed: false, reason: 'unreachable' });
    });

    it('does nothing when the request itself fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

        const out = await run();

        expect(h.cancel).not.toHaveBeenCalled();
        expect(out).toMatchObject({ changed: false, reason: 'unreachable' });
    });

    it('reports, and does not throw, when reconciling fails on our side', async () => {
        duffelReturns(CANCELLED);
        h.cancel.mockResolvedValue(NextResponse.json({ success: false, error: 'db down' }, { status: 500 }));

        const out = await run();

        expect(out).toMatchObject({ changed: false, reason: 'reconcile_failed' });
    });
});
