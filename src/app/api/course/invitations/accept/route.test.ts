import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'u-1', email: 'ana@club.test', role: 'user' } as unknown }));

vi.mock('@/lib/server/auth', () => ({
    getAuthenticatedUser: vi.fn(async () => ({ user: session.user, error: null })),
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/invitations', () => ({ acceptInvitation: vi.fn() }));

import { POST } from './route';
import { acceptInvitation } from '@/lib/server/golf/invitations';
import { CourseStaffError } from '@/lib/server/golf/errors';

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/course/invitations/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);
const token = 'a-long-enough-token-value-1234567890';

beforeEach(() => {
    vi.clearAllMocks();
    session.user = { id: 'u-1', email: 'ana@club.test', role: 'user' };
});

describe('POST /api/course/invitations/accept', () => {
    it('needs a signed-in account', async () => {
        session.user = null;
        expect((await post({ token })).status).toBe(401);
        expect(acceptInvitation).not.toHaveBeenCalled();
    });

    it('needs a token', async () => {
        expect((await post({})).status).toBe(400);
        expect((await post({ token: 'x' })).status).toBe(400);
    });

    it('accepts as the signed-in account', async () => {
        vi.mocked(acceptInvitation).mockResolvedValueOnce({ courseId: 'c-1', courseName: 'Mine GC' });
        const res = await post({ token });
        expect(res.status).toBe(200);
        expect(acceptInvitation).toHaveBeenCalledWith({ token, userId: 'u-1', userEmail: 'ana@club.test' });
        expect((await res.json()).data).toEqual({ courseId: 'c-1', courseName: 'Mine GC' });
    });

    it('tells a different account which address was invited, and a dead link only that it is dead', async () => {
        vi.mocked(acceptInvitation).mockRejectedValueOnce(
            new CourseStaffError('wrong_account', 'This invitation is for ana@club.test.', { invitedEmail: 'ana@club.test' }));
        const wrong = await post({ token });
        expect(wrong.status).toBe(403);
        expect((await wrong.json()).code).toBe('wrong_account');

        vi.mocked(acceptInvitation).mockRejectedValueOnce(new CourseStaffError('invitation_invalid', 'This invitation is no longer valid.'));
        expect((await post({ token })).status).toBe(410);
    });
});
