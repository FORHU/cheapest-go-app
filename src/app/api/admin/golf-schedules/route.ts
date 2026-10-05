import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { teeTimeScheduleInputSchema } from '@/lib/schemas/golf';
import { createSchedule, deleteSchedule, listSchedules } from '@/lib/server/golf/teeTimes';
import { CourseNotSchedulableError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/** Admin management of a course's tee-time schedules. Same shape as api/admin/golf-courses. */

const idSchema = z.string().uuid();

function fail(status: number, error: string, fieldErrors?: Record<string, string[] | undefined>) {
    return NextResponse.json({ success: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-schedules' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const courseId = idSchema.safeParse(new URL(req.url).searchParams.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    return NextResponse.json({ success: true, data: await listSchedules(courseId.data) });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-golf-schedules-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const who = { adminId: auth.user.id, adminEmail: auth.user.email };

    if (body.action === 'create') {
        const courseId = idSchema.safeParse(body.courseId);
        if (!courseId.success) return fail(400, 'courseId is required');
        const parsed = teeTimeScheduleInputSchema.safeParse(body.schedule);
        if (!parsed.success) return fail(400, 'Some fields need attention', z.flattenError(parsed.error).fieldErrors);
        try {
            const result = await createSchedule(courseId.data, parsed.data);
            if (!result) return fail(404, 'Course not found');
            logAdminAction({
                action: 'create_golf_schedule', ...who, targetId: result.schedule.id,
                details: { courseId: courseId.data, generated: result.generated },
            });
            return NextResponse.json({ success: true, data: result.schedule, generated: result.generated }, { status: 201 });
        } catch (err) {
            if (err instanceof CourseNotSchedulableError) return fail(409, err.message);
            throw err;
        }
    }

    if (body.action === 'delete') {
        const id = idSchema.safeParse(body.id);
        if (!id.success) return fail(400, 'id is required');
        if (!(await deleteSchedule(id.data))) return fail(404, 'Schedule not found');
        logAdminAction({ action: 'delete_golf_schedule', ...who, targetId: id.data });
        return NextResponse.json({ success: true });
    }

    return fail(400, `Unknown action: ${String(body.action)}`);
}
