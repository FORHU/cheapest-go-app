import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'u1', email: 'ana@example.com' } as { id: string; email: string } | null }));

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn(async () => ({ user: session.user, error: null })) }));
vi.mock('@/lib/server/csrf', () => ({ checkCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/bookings', () => ({
    cancelByCustomer: vi.fn(async () => ({ status: 'cancelled', refundAmount: 212.2 })),
}));

import { POST } from './route';
import { cancelByCustomer } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

const cancel = (reference: string) =>
    POST(new Request(`http://localhost/api/golf/bookings/${reference}/cancel`, { method: 'POST' }) as never,
        { params: Promise.resolve({ reference }) });

beforeEach(() => { session.user = { id: 'u1', email: 'ana@example.com' }; });

describe('POST /api/golf/bookings/[reference]/cancel', () => {
    it('needs a logged-in customer', async () => {
        session.user = null;
        expect((await cancel('CG-ABC234')).status).toBe(401);
    });

    it('answers something that is not a reference with 404', async () => {
        expect((await cancel('nope')).status).toBe(404);
        expect(cancelByCustomer).not.toHaveBeenCalled();
    });

    it('cancels as the session\'s customer', async () => {
        const res = await cancel('CG-ABC234');
        expect(res.status).toBe(200);
        expect(cancelByCustomer).toHaveBeenCalledWith('CG-ABC234', 'u1');
        expect((await res.json()).data).toEqual({ status: 'cancelled', refundAmount: 212.2 });
    });

    it('passes a refusal through with its code', async () => {
        vi.mocked(cancelByCustomer).mockRejectedValueOnce(new GolfBookingError('free_cancellation_ended', 'Free cancellation has ended for this tee time.'));
        const res = await cancel('CG-ABC234');
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe('free_cancellation_ended');
    });
});
