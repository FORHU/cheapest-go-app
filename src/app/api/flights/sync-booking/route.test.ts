import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/flights/sync-booking: "look at Duffel for this booking, now".
 *
 * Called by the Trips card for a live Duffel booking. What is pinned here is who may ask and how
 * often; what the answer is, and what it does to money, belongs to syncDuffelCancellation.
 */

const h = vi.hoisted(() => ({
    user: { id: 'user_1' } as { id: string } | null,
    booking: null as any,
    sync: vi.fn(),
}));

vi.mock('@/lib/server/csrf', () => ({ checkCsrf: () => null }));
vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ user: h.user }) }));
vi.mock('@/utils/postgres/admin', () => ({
    createAdminClient: () => ({
        from: () => {
            const chain: any = {
                select: () => chain,
                eq: () => chain,
                single: async () => (h.booking ? { data: h.booking, error: null } : { data: null, error: { message: 'not found' } }),
            };
            return chain;
        },
    }),
}));
vi.mock('@/lib/server/flights/sync-duffel-cancellation', () => ({
    syncDuffelCancellation: (...a: unknown[]) => h.sync(...a),
}));

import { POST } from './route';

let n = 0;
/** A booking id no earlier test used, so the per-booking throttle does not carry between tests. */
const freshId = () => `bk_sync_${++n}`;

const call = (bookingId: string) => POST(new Request('http://localhost/api/flights/sync-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId }),
}) as any);

beforeEach(() => {
    h.user = { id: 'user_1' };
    h.booking = null;
    h.sync.mockReset();
    h.sync.mockResolvedValue({ changed: false, reason: 'live_at_duffel', status: 'ticketed' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('POST /api/flights/sync-booking — who may ask', () => {
    it('requires a signed-in traveller', async () => {
        h.user = null;

        const res = await call(freshId());

        expect(res.status).toBe(401);
        expect(h.sync).not.toHaveBeenCalled();
    });

    it('does not look up a booking that does not exist', async () => {
        h.booking = null;

        const res = await call(freshId());

        expect(res.status).toBe(404);
        expect(h.sync).not.toHaveBeenCalled();
    });

    it("does not act on someone else's booking", async () => {
        const id = freshId();
        h.booking = { id, user_id: 'someone_else', provider: 'duffel', status: 'ticketed' };

        const res = await call(id);

        expect(res.status).toBe(403);
        expect(h.sync).not.toHaveBeenCalled();
    });

    it('rejects a request with no booking id', async () => {
        const res = await POST(new Request('http://localhost/api/flights/sync-booking', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        }) as any);

        expect(res.status).toBe(400);
    });
});

describe('POST /api/flights/sync-booking — what it does', () => {
    it("hands the traveller's own booking to the Duffel check and returns its answer", async () => {
        const id = freshId();
        h.booking = { id, user_id: 'user_1', provider: 'duffel', status: 'ticketed' };
        h.sync.mockResolvedValue({ changed: true, status: 'refunded', cancelledBy: 'supplier', refundAmount: 120, refundCurrency: 'USD' });

        const res = await call(id);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(h.sync).toHaveBeenCalledTimes(1);
        expect(h.sync.mock.calls[0][0]).toMatchObject({ bookingId: id });
        expect(json).toMatchObject({ success: true, changed: true, status: 'refunded', cancelledBy: 'supplier', refundAmount: 120 });
    });

    it('does not ask Duffel again for the same booking within the throttle window', async () => {
        const id = freshId();
        h.booking = { id, user_id: 'user_1', provider: 'duffel', status: 'ticketed' };

        await call(id);
        const second = await (await call(id)).json();

        // Every open card asks on mount; Duffel is a rate-limited API and a traveller reloads.
        expect(h.sync).toHaveBeenCalledTimes(1);
        expect(second).toMatchObject({ success: true, changed: false, reason: 'throttled' });
    });

    it('asks again once the window has passed', async () => {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T08:00:00Z') });
        const id = freshId();
        h.booking = { id, user_id: 'user_1', provider: 'duffel', status: 'ticketed' };

        await call(id);
        vi.setSystemTime(new Date('2026-10-13T08:01:00Z'));
        await call(id);

        expect(h.sync).toHaveBeenCalledTimes(2);
    });

    it('does not start the throttle for a booking that was refused, so a later valid request is not blocked', async () => {
        const id = freshId();
        h.booking = { id, user_id: 'someone_else', provider: 'duffel', status: 'ticketed' };
        await call(id);

        h.booking = { id, user_id: 'user_1', provider: 'duffel', status: 'ticketed' };
        await call(id);

        expect(h.sync).toHaveBeenCalledTimes(1);
    });

    it('answers 500, without throwing, when the check itself fails', async () => {
        const id = freshId();
        h.booking = { id, user_id: 'user_1', provider: 'duffel', status: 'ticketed' };
        h.sync.mockRejectedValue(new Error('boom'));

        const res = await call(id);

        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ success: false });
    });
});
