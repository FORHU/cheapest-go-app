import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { approveCourseRequest, listCourseRequests, rejectCourseRequest } from '@/lib/server/golf/courseRequests';
import { sendCourseRequestDecisionEmail } from '@/lib/server/golf/staffEmails';
import { CourseStaffError } from '@/lib/server/golf/errors';
import type { CourseRequestStatus } from '@/lib/schemas/golfStaff';

export const dynamic = 'force-dynamic';

/** Requests to list or claim a course: the queue, and approve or reject. */

const STATUSES: readonly CourseRequestStatus[] = ['pending', 'approved', 'rejected'];
const uuid = z.string().uuid();
const note = z.string().trim().max(500, 'At most 500 characters').optional().default('');

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-requests' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const asked = new URL(req.url).searchParams.get('status') as CourseRequestStatus | null;
    const status = asked && STATUSES.includes(asked) ? asked : 'pending';
    return NextResponse.json({ success: true, data: await listCourseRequests(status) });
}

export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-golf-requests-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    if (body.action !== 'approve' && body.action !== 'reject') return fail(400, `Unknown action: ${String(body.action)}`);
    const id = uuid.safeParse(body.id);
    if (!id.success) return fail(400, 'id is required');
    const text = note.safeParse(body.note);
    if (!text.success) return fail(400, text.error.issues[0]?.message ?? 'Check the note');
    const courseId = body.courseId == null || body.courseId === '' ? null : uuid.safeParse(body.courseId);
    if (courseId && !courseId.success) return fail(400, 'courseId must be a course id');

    try {
        if (body.action === 'approve') {
            const result = await approveCourseRequest({
                id: id.data, decidedBy: auth.user.id, courseId: courseId ? courseId.data : null, note: text.data,
            });
            await sendCourseRequestDecisionEmail({
                requestId: id.data, to: result.request.contactEmail, approved: true,
                courseName: result.request.courseName, note: text.data,
            });
            logAdminAction({
                action: 'approve_course_request', adminId: auth.user.id, adminEmail: auth.user.email, targetId: id.data,
                details: { courseId: result.courseId, createdCourse: result.createdCourse },
            });
            return NextResponse.json({ success: true, data: { request: result.request, courseId: result.courseId, createdCourse: result.createdCourse } });
        }
        const request = await rejectCourseRequest({ id: id.data, decidedBy: auth.user.id, note: text.data });
        await sendCourseRequestDecisionEmail({
            requestId: id.data, to: request.contactEmail, approved: false, courseName: request.courseName, note: text.data,
        });
        logAdminAction({
            action: 'reject_course_request', adminId: auth.user.id, adminEmail: auth.user.email, targetId: id.data, details: {},
        });
        return NextResponse.json({ success: true, data: { request } });
    } catch (err) {
        if (err instanceof CourseStaffError) return fail(err.httpStatus, err.message);
        throw err;
    }
}
