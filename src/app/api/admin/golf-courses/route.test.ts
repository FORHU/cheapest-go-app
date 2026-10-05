import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/courses', () => ({
    listCoursesForAdmin: vi.fn(async () => ({ courses: [], total: 0, page: 1, pageSize: 20, totalPages: 1 })),
    createCourse: vi.fn(async (input: { slug: string }) => ({ id: 'c1', status: 'draft', ...input })),
    updateCourse: vi.fn(async () => null),
    setCourseStatus: vi.fn(async () => true),
    setCourseTimezone: vi.fn(async (id: string, timezone: string) => ({ id, timezone })),
    deleteCourses: vi.fn(async (ids: string[]) => ids.length),
}));

import { GET, POST } from './route';
import { createCourse, deleteCourses, setCourseStatus, setCourseTimezone, updateCourse } from '@/lib/server/golf/courses';
import {
    CourseHasBookingsError, CourseNotBookableError, SlugTakenError, TimezoneLockedError,
} from '@/lib/server/golf/errors';

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-courses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

const course = { name: 'Wack Wack', country: 'Philippines', city: 'Manila', holes: 18 };

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-courses', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const res = await GET(new Request('http://localhost/api/admin/golf-courses') as never);
        expect(res.status).toBe(403);
    });

    it('lists courses for an admin', async () => {
        const res = await GET(new Request('http://localhost/api/admin/golf-courses?q=wack') as never);
        expect(await res.json()).toEqual({ success: true, data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
    });

    it('creates a course from valid input', async () => {
        const res = await post({ action: 'create', course });
        expect(res.status).toBe(201);
        expect(createCourse).toHaveBeenCalledWith(expect.objectContaining({ slug: 'wack-wack-manila', holes: 18 }));
    });

    it('answers invalid input with errors per field', async () => {
        const res = await post({ action: 'create', course: { ...course, holes: 12 } });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.holes).toBeDefined();
    });

    it('answers a taken slug with 409 on the slug field', async () => {
        vi.mocked(createCourse).mockRejectedValueOnce(new SlugTakenError('wack-wack-manila'));
        const res = await post({ action: 'create', course });
        expect(res.status).toBe(409);
        expect((await res.json()).fieldErrors.slug).toBeDefined();
    });

    it('answers an update to an unknown course with 404', async () => {
        const res = await post({ action: 'update', id: crypto.randomUUID(), course });
        expect(res.status).toBe(404);
    });

    it('rejects an unknown action', async () => {
        expect((await post({ action: 'explode' })).status).toBe(400);
    });

    it('answers deleting a course with bookings with 409', async () => {
        vi.mocked(deleteCourses).mockRejectedValueOnce(new CourseHasBookingsError());
        const res = await post({ action: 'delete', id: crypto.randomUUID() });
        expect(res.status).toBe(409);
    });

    it('answers publishing a course that cannot be booked with 409', async () => {
        vi.mocked(setCourseStatus).mockRejectedValueOnce(new CourseNotBookableError());
        const res = await post({ action: 'publish', id: crypto.randomUUID() });
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain('time zone');
    });

    it('answers a locked time zone with 409 on the field', async () => {
        vi.mocked(updateCourse).mockRejectedValueOnce(new TimezoneLockedError());
        const res = await post({ action: 'update', id: crypto.randomUUID(), course });
        expect(res.status).toBe(409);
        expect((await res.json()).fieldErrors.timezone).toBeDefined();
    });

    it('sets a time zone, refusing an invented one', async () => {
        const id = crypto.randomUUID();
        expect((await post({ action: 'set-timezone', id, timezone: 'Mars/Base' })).status).toBe(400);
        const res = await post({ action: 'set-timezone', id, timezone: 'Asia/Manila' });
        expect(res.status).toBe(200);
        expect(setCourseTimezone).toHaveBeenCalledWith(id, 'Asia/Manila');
    });
});
