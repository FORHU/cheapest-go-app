import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const guard = vi.hoisted(() => ({
    actor: { id: 'staff-1', email: 'staff@club.test', courseIds: ['6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44'] } as unknown,
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
vi.mock('@/lib/server/golf/changes', () => ({
    recordChange: vi.fn(async () => undefined),
    listChanges: vi.fn(async () => [{ id: 'c1', kind: 'profile_updated', summary: 'Changed description', by: 'Ana', createdAt: '2030-01-01T00:00:00.000Z' }]),
}));
vi.mock('@/lib/server/golf/courses', () => ({ getCourseById: vi.fn() }));
vi.mock('@/lib/server/golf/profile', async importOriginal => {
    const original = await importOriginal<typeof import('@/lib/server/golf/profile')>();
    return { ...original, updateProfile: vi.fn() };
});

import { GET, POST } from './route';
import { getCourseById } from '@/lib/server/golf/courses';
import { updateProfile } from '@/lib/server/golf/profile';
import { recordChange } from '@/lib/server/golf/changes';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PhotoNotOwnedError } from '@/lib/server/golf/errors';

const mine = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const theirs = '0a9d3c52-1f4e-4b7a-8c11-5e2d6f7a8b90';
const profile = {
    description: 'A links course.', address: null, amenities: ['cart'], imageUrls: [], par: 72, yardage: null,
    yearOpened: null, designer: null, grass: null, weatherPolicy: 'Play on.', bookingWindowDays: 30, freeCancelHours: 24,
};
const course = { id: mine, name: 'Club', slug: 'club', ...profile };
const noWindow = { stopsSelling: 0, withBookings: 0 };

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/course/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);
const get = (query: string) => GET(new Request(`http://localhost/api/course/profile${query}`) as never);

beforeEach(() => {
    vi.clearAllMocks();
    guard.actor = { id: 'staff-1', email: 'staff@club.test', courseIds: [mine] };
});

describe('GET /api/course/profile', () => {
    it('refuses anyone who is not course staff', async () => {
        guard.actor = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await get(`?courseId=${mine}`)).status).toBe(403);
        expect(getCourseById).not.toHaveBeenCalled();
    });

    it('reads a course as missing when it is not the caller\'s', async () => {
        expect((await get(`?courseId=${theirs}`)).status).toBe(404);
        expect(getCourseById).not.toHaveBeenCalled();
    });

    it('needs a course id', async () => {
        expect((await get('')).status).toBe(400);
    });

    it('returns the course with its recent changes', async () => {
        vi.mocked(getCourseById).mockResolvedValueOnce(course as never);
        const res = await get(`?courseId=${mine}`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.course.id).toBe(mine);
        expect(body.data.changes).toHaveLength(1);
    });
});

describe('POST /api/course/profile', () => {
    it('refuses a course that is not theirs', async () => {
        expect((await post({ courseId: theirs, profile })).status).toBe(404);
        expect(updateProfile).not.toHaveBeenCalled();
    });

    it('refuses fields a course may not change, naming them', async () => {
        for (const extra of [{ slug: 'taken' }, { timezone: 'Asia/Manila' }, { status: 'published' }, { name: 'Renamed' }]) {
            const res = await post({ courseId: mine, profile: { ...profile, ...extra } });
            expect(res.status).toBe(400);
        }
        expect(updateProfile).not.toHaveBeenCalled();
    });

    it('returns field errors for values outside the limits', async () => {
        const res = await post({ courseId: mine, profile: { ...profile, bookingWindowDays: 120 } });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.bookingWindowDays).toBeTruthy();
    });

    it('saves, records what changed and who did it', async () => {
        vi.mocked(updateProfile).mockResolvedValueOnce({
            course: course as never, windowImpact: noWindow, created: 0,
            changes: { description: ['Old', 'A links course.'], weatherPolicy: ['', 'Play on.'] },
        });
        const res = await post({ courseId: mine, profile });
        expect(res.status).toBe(200);
        expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ courseId: mine, dryRun: false }));
        expect(recordChange).toHaveBeenCalledWith(expect.objectContaining({
            courseId: mine, userId: 'staff-1', kind: 'profile_updated',
            summary: 'Changed description, weather rule',
            details: { description: ['Old', 'A links course.'], weatherPolicy: ['', 'Play on.'] },
        }));
        expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'course_profile_updated', targetId: mine }));
    });

    it('records nothing when nothing changed', async () => {
        vi.mocked(updateProfile).mockResolvedValueOnce({ course: course as never, windowImpact: noWindow, created: 0, changes: {} });
        const res = await post({ courseId: mine, profile });
        expect(res.status).toBe(200);
        expect(recordChange).not.toHaveBeenCalled();
    });

    it('previews without recording, and reports a shorter window\'s impact', async () => {
        vi.mocked(updateProfile).mockResolvedValueOnce({
            course: course as never, windowImpact: { stopsSelling: 12, withBookings: 2 }, created: 0,
            changes: { bookingWindowDays: [60, 30] },
        });
        const res = await post({ courseId: mine, profile, preview: true });
        expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
        expect(recordChange).not.toHaveBeenCalled();
        expect((await res.json()).data).toMatchObject({ preview: true, windowImpact: { stopsSelling: 12, withBookings: 2 } });
    });

    it('answers 404 when the course is gone', async () => {
        vi.mocked(updateProfile).mockResolvedValueOnce(null);
        expect((await post({ courseId: mine, profile })).status).toBe(404);
    });

    it('turns a photo that is not theirs into a field error', async () => {
        vi.mocked(updateProfile).mockRejectedValueOnce(new PhotoNotOwnedError());
        const res = await post({ courseId: mine, profile });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.imageUrls).toBeTruthy();
    });
});
