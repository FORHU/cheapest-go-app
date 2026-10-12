import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/courseRequests', () => ({
    listCourseRequests: vi.fn(async () => []),
    approveCourseRequest: vi.fn(),
    rejectCourseRequest: vi.fn(),
}));
vi.mock('@/lib/server/golf/staffEmails', () => ({ sendCourseRequestDecisionEmail: vi.fn(async () => undefined) }));

import { GET, POST } from './route';
import { approveCourseRequest, listCourseRequests, rejectCourseRequest } from '@/lib/server/golf/courseRequests';
import { sendCourseRequestDecisionEmail } from '@/lib/server/golf/staffEmails';
import { CourseStaffError } from '@/lib/server/golf/errors';

const id = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const courseId = '0a9d3c52-1f4e-4b7a-8c11-5e2d6f7a8b90';
const request = { id, contactEmail: 'ana@club.test', courseName: 'New Greens', status: 'approved' };
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-course-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);

beforeEach(() => {
    vi.clearAllMocks();
    auth.result = { user: { id: 'admin-1', email: 'a@x.com' } };
});

describe('/api/admin/golf-course-requests', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await post({ action: 'approve', id })).status).toBe(403);
        expect(approveCourseRequest).not.toHaveBeenCalled();
    });

    it('lists pending requests by default and ignores an unknown status', async () => {
        await GET(new Request('http://localhost/api/admin/golf-course-requests') as never);
        expect(listCourseRequests).toHaveBeenLastCalledWith('pending');
        await GET(new Request('http://localhost/api/admin/golf-course-requests?status=weird') as never);
        expect(listCourseRequests).toHaveBeenLastCalledWith('pending');
        await GET(new Request('http://localhost/api/admin/golf-course-requests?status=rejected') as never);
        expect(listCourseRequests).toHaveBeenLastCalledWith('rejected');
    });

    it('approves, lets the admin choose the course, and tells the requester', async () => {
        vi.mocked(approveCourseRequest).mockResolvedValueOnce({ request, courseId, createdCourse: false } as never);
        const res = await post({ action: 'approve', id, courseId, note: 'Welcome.' });
        expect(res.status).toBe(200);
        expect(approveCourseRequest).toHaveBeenCalledWith({ id, decidedBy: 'admin-1', courseId, note: 'Welcome.' });
        expect(sendCourseRequestDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'ana@club.test', approved: true, courseName: 'New Greens',
        }));
    });

    it('rejects with a note and tells the requester', async () => {
        vi.mocked(rejectCourseRequest).mockResolvedValueOnce({ ...request, status: 'rejected' } as never);
        const res = await post({ action: 'reject', id, note: 'Could not verify.' });
        expect(res.status).toBe(200);
        expect(sendCourseRequestDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ approved: false, note: 'Could not verify.' }));
    });

    it('does not email anyone when the decision was refused', async () => {
        vi.mocked(approveCourseRequest).mockRejectedValueOnce(new CourseStaffError('request_decided', 'Already decided.'));
        const res = await post({ action: 'approve', id });
        expect(res.status).toBe(409);
        expect(sendCourseRequestDecisionEmail).not.toHaveBeenCalled();
    });

    it('validates its input', async () => {
        expect((await post({ action: 'approve', id: 'not-a-uuid' })).status).toBe(400);
        expect((await post({ action: 'approve', id, courseId: 'x' })).status).toBe(400);
        expect((await post({ action: 'banish', id })).status).toBe(400);
    });
});
