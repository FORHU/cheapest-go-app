import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/bookings', () => ({
    listBookingsForAdmin: vi.fn(async () => []),
    confirmBooking: vi.fn(async () => ({ reference: 'CG-ABC234', status: 'confirmed' })),
    declineBooking: vi.fn(async () => ({ reference: 'CG-ABC234', status: 'declined' })),
    cancelByTeam: vi.fn(async () => ({ reference: 'CG-ABC234', status: 'cancelled' })),
}));

import { GET, POST } from './route';
import { confirmBooking, declineBooking, listBookingsForAdmin } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

const id = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-bookings', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await post({ action: 'confirm', id })).status).toBe(403);
    });

    it('lists a view, waiting by default', async () => {
        await GET(new Request('http://localhost/api/admin/golf-bookings') as never);
        expect(listBookingsForAdmin).toHaveBeenCalledWith('waiting');
        await GET(new Request('http://localhost/api/admin/golf-bookings?view=past') as never);
        expect(listBookingsForAdmin).toHaveBeenCalledWith('past');
    });

    it('confirms and declines', async () => {
        expect((await post({ action: 'confirm', id })).status).toBe(200);
        expect(confirmBooking).toHaveBeenCalledWith(id);
        expect((await post({ action: 'decline', id })).status).toBe(200);
        expect(declineBooking).toHaveBeenCalledWith(id, 'declined_by_team');
    });

    it('answers a booking in the wrong state with 409', async () => {
        vi.mocked(confirmBooking).mockRejectedValueOnce(new GolfBookingError('wrong_status', 'This booking is declined.'));
        expect((await post({ action: 'confirm', id })).status).toBe(409);
    });

    it('answers a Stripe refusal with 502 and its message', async () => {
        vi.mocked(confirmBooking).mockRejectedValueOnce(new Error('This PaymentIntent could not be captured'));
        const res = await post({ action: 'confirm', id });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toContain('could not be captured');
    });

    it('rejects an unknown action and a missing id', async () => {
        expect((await post({ action: 'explode', id })).status).toBe(400);
        expect((await post({ action: 'confirm' })).status).toBe(400);
    });
});
