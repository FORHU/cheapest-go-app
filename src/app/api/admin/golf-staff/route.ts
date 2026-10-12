import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createInvitation, listInvitations, revokeInvitation } from '@/lib/server/golf/invitations';
import { listStaffOf, revokeCourseAccess } from '@/lib/server/golf/staff';
import { sendCourseInvitationEmail } from '@/lib/server/golf/staffEmails';
import { CourseStaffError } from '@/lib/server/golf/errors';
import { invitationInputSchema } from '@/lib/schemas/golfStaff';

export const dynamic = 'force-dynamic';

/**
 * A course's staff, from the admin: who is attached, who has been invited, and the three things
 * an admin does about it: invite by email, withdraw an invitation, remove a person.
 */

const uuid = z.string().uuid();

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-staff' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const courseId = uuid.safeParse(new URL(req.url).searchParams.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    const [staff, invitations] = await Promise.all([listStaffOf(courseId.data), listInvitations(courseId.data)]);
    return NextResponse.json({ success: true, data: { staff, invitations } });
}

export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-golf-staff-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const audit = (action: string, targetId: string, details: Record<string, unknown>) =>
        logAdminAction({ action, adminId: auth.user.id, adminEmail: auth.user.email, targetId, details });

    try {
        switch (body.action) {
            case 'invite': {
                const parsed = invitationInputSchema.safeParse(body);
                if (!parsed.success) {
                    return fail(400, parsed.error.issues[0]?.message ?? 'Check the email address', {
                        fieldErrors: z.flattenError(parsed.error).fieldErrors,
                    });
                }
                const invitation = await createInvitation({
                    courseId: parsed.data.courseId, email: parsed.data.email, invitedBy: auth.user.id,
                });
                await sendCourseInvitationEmail({
                    invitationId: invitation.id, to: invitation.email, courseName: invitation.courseName,
                    token: invitation.token, expiresAt: invitation.expiresAt,
                });
                audit('invite_course_staff', parsed.data.courseId, { email: invitation.email });
                // The token is deliberately not returned: it exists only in the email.
                return NextResponse.json({ success: true, data: { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt.toISOString() } }, { status: 201 });
            }
            case 'revoke_invitation': {
                const id = uuid.safeParse(body.id);
                if (!id.success) return fail(400, 'id is required');
                if (!(await revokeInvitation(id.data))) return fail(404, 'That invitation is not pending any more');
                audit('revoke_course_invitation', id.data, {});
                return NextResponse.json({ success: true });
            }
            case 'remove': {
                const userId = uuid.safeParse(body.userId);
                const courseId = uuid.safeParse(body.courseId);
                if (!userId.success || !courseId.success) return fail(400, 'userId and courseId are required');
                if (!(await revokeCourseAccess({ userId: userId.data, courseId: courseId.data }))) {
                    return fail(404, 'That person is not attached to this course');
                }
                audit('remove_course_staff', courseId.data, { userId: userId.data });
                return NextResponse.json({ success: true });
            }
            default:
                return fail(400, `Unknown action: ${String(body.action)}`);
        }
    } catch (err) {
        if (err instanceof CourseStaffError) return fail(err.httpStatus, err.message);
        throw err;
    }
}
