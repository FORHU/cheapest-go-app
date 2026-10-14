import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const guard = vi.hoisted(() => ({
    actor: { id: 'staff-1', email: 'staff@club.test', courseIds: ['c-mine'] } as unknown,
}));

vi.mock('@/lib/server/golf/courseAccess', async importOriginal => {
    const original = await importOriginal<typeof import('@/lib/server/golf/courseAccess')>();
    return {
        ...original,
        requireCourseStaff: vi.fn(async () => guard.actor),
        isCourseAuthError: (r: unknown) => r instanceof Response,
    };
});
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/bookings', () => ({
    listBookingsForCourses: vi.fn(),
    getBookingById: vi.fn(),
    confirmBooking: vi.fn(),
    declineBooking: vi.fn(),
}));

import { GET, POST } from './route';
import { confirmBooking, declineBooking, getBookingById, listBookingsForCourses } from '@/lib/server/golf/bookings';
import { logAdminAction } from '@/lib/server/admin/audit';

const mineId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const theirsId = '0a9d3c52-1f4e-4b7a-8c11-5e2d6f7a8b90';

const booking = (over: Record<string, unknown> = {}) => ({
    id: mineId, reference: 'CG-ABC234', status: 'requested', courseId: 'c-mine', courseName: 'Mine GC',
    timezone: 'Asia/Manila', startsAt: '2026-10-20T00:00:00.000Z', players: 2, leadName: 'Ana Cruz',
    contactEmail: 'ana@example.com', paymentIntentId: 'pi_secret',
    // What the customer paid, in pesos, and what the course set, in dollars (ADR-0051).
    serviceFee: 837.45, total: 17123.45, greenFeeTotal: 9714.29, currency: 'PHP',
    courseGreenFeeTotal: 170, courseCurrency: 'USD',
    extras: [{ code: 'cart', quantity: 1, unitPrice: 1428.57, total: 1428.57 }],
    decideBy: '2026-10-14T00:00:00.000Z', requestedAt: '2026-10-12T00:00:00.000Z', ...over,
});

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/course/golf-bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);

beforeEach(() => {
    vi.clearAllMocks();
    guard.actor = { id: 'staff-1', email: 'staff@club.test', courseIds: ['c-mine'] };
});

describe('/api/course/golf-bookings', () => {
    it('refuses anyone who is not course staff', async () => {
        guard.actor = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await GET(new Request('http://localhost/api/course/golf-bookings') as never)).status).toBe(403);
        expect((await post({ action: 'confirm', id: mineId })).status).toBe(403);
        expect(confirmBooking).not.toHaveBeenCalled();
    });

    it('lists only the staff member\'s courses, without the payer\'s details', async () => {
        vi.mocked(listBookingsForCourses).mockResolvedValueOnce([booking()] as never);
        const res = await GET(new Request('http://localhost/api/course/golf-bookings?view=waiting') as never);
        expect(listBookingsForCourses).toHaveBeenCalledWith(['c-mine'], 'waiting');
        const body = await res.json();
        // The course sees its own figure in its own currency, never what the customer paid.
        expect(body.data[0]).toMatchObject({ reference: 'CG-ABC234', leadName: 'Ana Cruz', greenFeeTotal: 170, currency: 'USD' });
        const text = JSON.stringify(body);
        expect(text).not.toContain('ana@example.com');
        expect(text).not.toContain('pi_secret');
        expect(text).not.toContain('17123.45');
        expect(text).not.toContain('9714.29');
        expect(text).not.toContain('PHP');
    });

    it('confirms a booking of their own course and records who did it', async () => {
        vi.mocked(getBookingById).mockResolvedValueOnce(booking() as never);
        vi.mocked(confirmBooking).mockResolvedValueOnce(booking({ status: 'confirmed' }) as never);
        const res = await post({ action: 'confirm', id: mineId });
        expect(res.status).toBe(200);
        expect(confirmBooking).toHaveBeenCalledWith(mineId);
        expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
            action: 'course_confirm_golf_booking', adminId: 'staff-1', targetId: mineId,
        }));
    });

    it('declines a booking of their own course', async () => {
        vi.mocked(getBookingById).mockResolvedValueOnce(booking() as never);
        vi.mocked(declineBooking).mockResolvedValueOnce(booking({ status: 'declined' }) as never);
        expect((await post({ action: 'decline', id: mineId })).status).toBe(200);
        expect(declineBooking).toHaveBeenCalledWith(mineId, 'declined_by_team');
    });

    it('reads another course\'s booking as missing and does nothing to it', async () => {
        vi.mocked(getBookingById).mockResolvedValueOnce(booking({ id: theirsId, courseId: 'c-theirs' }) as never);
        const res = await post({ action: 'confirm', id: theirsId });
        expect(res.status).toBe(404);
        expect(confirmBooking).not.toHaveBeenCalled();

        vi.mocked(getBookingById).mockResolvedValueOnce(null);
        expect((await post({ action: 'decline', id: theirsId })).status).toBe(404);
    });

    it('does not offer cancelling: that moves money out and stays with the team', async () => {
        expect((await post({ action: 'cancel', id: mineId })).status).toBe(400);
        expect(getBookingById).not.toHaveBeenCalled();
    });

    it('turns a refused payment into a message that does not leak Stripe', async () => {
        vi.mocked(getBookingById).mockResolvedValueOnce(booking() as never);
        vi.mocked(confirmBooking).mockRejectedValueOnce(new Error('card_declined: sk_test_secret'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const res = await post({ action: 'confirm', id: mineId });
        expect(res.status).toBe(502);
        expect(JSON.stringify(await res.json())).not.toContain('sk_test');
    });
});
