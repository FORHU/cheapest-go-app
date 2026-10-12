import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/invitations', () => ({
    createInvitation: vi.fn(),
    listInvitations: vi.fn(async () => []),
    revokeInvitation: vi.fn(),
}));
vi.mock('@/lib/server/golf/staff', () => ({
    listStaffOf: vi.fn(async () => []),
    revokeCourseAccess: vi.fn(),
}));
vi.mock('@/lib/server/golf/changes', () => ({ listChanges: vi.fn(async () => []) }));
vi.mock('@/lib/server/golf/staffEmails', () => ({ sendCourseInvitationEmail: vi.fn(async () => undefined) }));

import { GET, POST } from './route';
import { createInvitation, revokeInvitation } from '@/lib/server/golf/invitations';
import { revokeCourseAccess } from '@/lib/server/golf/staff';
import { sendCourseInvitationEmail } from '@/lib/server/golf/staffEmails';
import { CourseStaffError } from '@/lib/server/golf/errors';

const courseId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);

beforeEach(() => {
    vi.clearAllMocks();
    auth.result = { user: { id: 'admin-1', email: 'a@x.com' } };
});

describe('/api/admin/golf-staff', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await post({ action: 'invite', courseId, email: 'a@b.co' })).status).toBe(403);
        expect((await GET(new Request(`http://localhost/api/admin/golf-staff?courseId=${courseId}`) as never)).status).toBe(403);
        expect(createInvitation).not.toHaveBeenCalled();
    });

    it('lists staff and invitations for a course, and needs its id', async () => {
        const res = await GET(new Request(`http://localhost/api/admin/golf-staff?courseId=${courseId}`) as never);
        expect(await res.json()).toEqual({ success: true, data: { staff: [], invitations: [], changes: [] } });
        expect((await GET(new Request('http://localhost/api/admin/golf-staff') as never)).status).toBe(400);
    });

    it('invites by email, sends the link, and never returns the token', async () => {
        vi.mocked(createInvitation).mockResolvedValueOnce({
            id: 'inv-1', token: 'secret-token-value', expiresAt: new Date('2026-10-19T00:00:00Z'),
            courseName: 'Mine GC', email: 'ana@club.test',
        });
        const res = await post({ action: 'invite', courseId, email: ' Ana@Club.test ' });
        expect(res.status).toBe(201);
        expect(createInvitation).toHaveBeenCalledWith({ courseId, email: 'ana@club.test', invitedBy: 'admin-1' });
        expect(sendCourseInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@club.test', token: 'secret-token-value' }));
        expect(JSON.stringify(await res.json())).not.toContain('secret-token-value');
    });

    it('refuses a bad email before creating anything', async () => {
        expect((await post({ action: 'invite', courseId, email: 'nope' })).status).toBe(400);
        expect(createInvitation).not.toHaveBeenCalled();
    });

    it('withdraws an invitation and removes a person', async () => {
        vi.mocked(revokeInvitation).mockResolvedValueOnce(true);
        expect((await post({ action: 'revoke_invitation', id: courseId })).status).toBe(200);
        vi.mocked(revokeInvitation).mockResolvedValueOnce(false);
        expect((await post({ action: 'revoke_invitation', id: courseId })).status).toBe(404);

        vi.mocked(revokeCourseAccess).mockResolvedValueOnce(true);
        expect((await post({ action: 'remove', userId: courseId, courseId })).status).toBe(200);
        expect(revokeCourseAccess).toHaveBeenCalledWith({ userId: courseId, courseId });
    });

    it('maps a refusal from the staff module to its status', async () => {
        vi.mocked(createInvitation).mockRejectedValueOnce(new CourseStaffError('course_not_found', 'That course no longer exists.'));
        const res = await post({ action: 'invite', courseId, email: 'ana@club.test' });
        expect(res.status).toBe(404);
        expect(sendCourseInvitationEmail).not.toHaveBeenCalled();
    });

    it('rejects an unknown action', async () => {
        expect((await post({ action: 'promote_everyone' })).status).toBe(400);
    });
});
