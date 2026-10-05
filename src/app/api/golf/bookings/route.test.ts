import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'u1', email: 'ana@example.com' } as { id: string; email: string } | null }));

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn(async () => ({ user: session.user, error: session.user ? null : 'Not authenticated' })) }));
vi.mock('@/lib/server/csrf', () => ({ checkCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/bookings', () => ({
    holdTeeTime: vi.fn(async () => ({
        booking: { reference: 'CG-ABC234', holdExpiresAt: '2026-10-06T10:15:00.000Z', greenFeeTotal: 200, serviceFee: 12.2, total: 212.2, currency: 'USD' },
        clientSecret: 'pi_1_secret',
    })),
}));

import { POST } from './route';
import { holdTeeTime } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

const teeTimeId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/golf/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { session.user = { id: 'u1', email: 'ana@example.com' }; });

describe('POST /api/golf/bookings', () => {
    it('needs a logged-in customer', async () => {
        session.user = null;
        expect((await post({ teeTimeId, players: 2, leadName: 'Ana Cruz' })).status).toBe(401);
    });

    it('answers invalid input with errors per field', async () => {
        const res = await post({ teeTimeId, players: 9, leadName: '' });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors).toMatchObject({ players: expect.any(Array), leadName: expect.any(Array) });
    });

    it('holds the tee time for the session\'s customer and returns the client secret', async () => {
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana Cruz' });
        expect(res.status).toBe(201);
        expect(holdTeeTime).toHaveBeenCalledWith({ userId: 'u1', email: 'ana@example.com', teeTimeId, players: 2, leadName: 'Ana Cruz' });
        expect((await res.json()).data).toMatchObject({ reference: 'CG-ABC234', clientSecret: 'pi_1_secret', total: 212.2 });
    });

    it('passes a refusal through with its code and detail', async () => {
        vi.mocked(holdTeeTime).mockRejectedValueOnce(new GolfBookingError('not_enough_spots', 'Only 1 spot(s) left', { spotsLeft: 1 }));
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana Cruz' });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'not_enough_spots', spotsLeft: 1 });
    });
});
