import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'u-1', email: 'ana@club.test', role: 'user' } as unknown }));

vi.mock('@/lib/server/auth', () => ({
    getAuthenticatedUser: vi.fn(async () => ({ user: session.user, error: null })),
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/courseRequests', () => ({ submitCourseRequest: vi.fn() }));

import { POST } from './route';
import { submitCourseRequest } from '@/lib/server/golf/courseRequests';
import { CourseStaffError } from '@/lib/server/golf/errors';

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/golf/course-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);
const valid = { contactName: 'Ana Cruz', courseName: 'New Greens', country: 'Philippines', city: 'Cebu' };

beforeEach(() => {
    vi.clearAllMocks();
    session.user = { id: 'u-1', email: 'ana@club.test', role: 'user' };
});

describe('POST /api/golf/course-requests', () => {
    it('needs a signed-in account', async () => {
        session.user = null;
        expect((await post(valid)).status).toBe(401);
        expect(submitCourseRequest).not.toHaveBeenCalled();
    });

    it('validates the form and returns field errors', async () => {
        const res = await post({ ...valid, courseName: '' });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.courseName).toBeTruthy();
    });

    it('files the request for the signed-in account, using the account\'s email', async () => {
        vi.mocked(submitCourseRequest).mockResolvedValueOnce({ id: 'r-1', status: 'pending' } as never);
        const res = await post({ ...valid, contactEmail: 'someone-else@x.test' });
        expect(res.status).toBe(201);
        expect(submitCourseRequest).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'u-1', contactEmail: 'ana@club.test',
        }));
    });

    it('says plainly when a request is already waiting', async () => {
        vi.mocked(submitCourseRequest).mockRejectedValueOnce(new CourseStaffError('request_pending', 'You already have a request waiting.'));
        const res = await post(valid);
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe('request_pending');
    });
});
