import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { golfExtrasInputSchema } from '@/lib/schemas/golf';
import { listCourseExtras, setCourseExtras } from '@/lib/server/golf/extras';

export const dynamic = 'force-dynamic';

/** The extras a course offers. Same shape as api/admin/golf-schedules. */

const idSchema = z.string().uuid();

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-extras' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const courseId = idSchema.safeParse(new URL(req.url).searchParams.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    return NextResponse.json({ success: true, data: await listCourseExtras(courseId.data) });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-golf-extras-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const courseId = idSchema.safeParse(body.courseId);
    if (!courseId.success) return fail(400, 'courseId is required');
    const parsed = golfExtrasInputSchema.safeParse(body.extras);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid extras');

    const saved = await setCourseExtras(courseId.data, parsed.data);
    if (!saved) return fail(404, 'Course not found');
    logAdminAction({
        action: 'set_golf_course_extras', adminId: auth.user.id, adminEmail: auth.user.email,
        targetId: courseId.data, details: { extras: saved },
    });
    return NextResponse.json({ success: true, data: saved });
}
