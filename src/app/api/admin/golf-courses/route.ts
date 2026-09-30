import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { golfCourseInputSchema } from '@/lib/schemas/golf';
import {
    listCoursesForAdmin, createCourse, updateCourse, setCourseStatus, deleteCourses,
} from '@/lib/server/golf/courses';
import { SlugTakenError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/** Admin management of Golf Courses. Same shape as api/admin/destinations. */

const idSchema = z.string().uuid();

function fail(status: number, error: string, fieldErrors?: Record<string, string[] | undefined>) {
    return NextResponse.json({ success: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-golf' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const { courses, ...paging } = await listCoursesForAdmin({
        q: searchParams.get('q') ?? '',
        page: parseInt(searchParams.get('page') ?? '1', 10),
    });
    return NextResponse.json({ success: true, data: courses, ...paging });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-golf-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const { action } = body;
    const who = { adminId: auth.user.id, adminEmail: auth.user.email };

    try {
        if (action === 'create' || action === 'update') {
            const parsed = golfCourseInputSchema.safeParse(body.course);
            if (!parsed.success) {
                return fail(400, 'Some fields need attention', z.flattenError(parsed.error).fieldErrors);
            }

            if (action === 'create') {
                const course = await createCourse(parsed.data);
                logAdminAction({ action: 'create_golf_course', ...who, targetId: course.id, details: { slug: course.slug } });
                return NextResponse.json({ success: true, data: course }, { status: 201 });
            }

            const id = idSchema.safeParse(body.id);
            if (!id.success) return fail(400, 'id is required');
            const course = await updateCourse(id.data, parsed.data);
            if (!course) return fail(404, 'Course not found');
            logAdminAction({ action: 'update_golf_course', ...who, targetId: course.id, details: { slug: course.slug } });
            return NextResponse.json({ success: true, data: course });
        }

        if (action === 'publish' || action === 'unpublish') {
            const id = idSchema.safeParse(body.id);
            if (!id.success) return fail(400, 'id is required');
            const found = await setCourseStatus(id.data, action === 'publish' ? 'published' : 'draft');
            if (!found) return fail(404, 'Course not found');
            logAdminAction({ action: `${action}_golf_course`, ...who, targetId: id.data });
            return NextResponse.json({ success: true });
        }

        if (action === 'delete') {
            const ids = z.array(idSchema).min(1).safeParse(body.ids ?? (body.id ? [body.id] : []));
            if (!ids.success) return fail(400, 'id or ids required');
            const deleted = await deleteCourses(ids.data);
            logAdminAction({ action: 'delete_golf_course', ...who, details: { ids: ids.data } });
            return NextResponse.json({ success: true, deleted });
        }
    } catch (err) {
        if (err instanceof SlugTakenError) {
            return fail(409, err.message, { slug: ['Another course already uses this slug'] });
        }
        throw err;
    }

    return fail(400, `Unknown action: ${String(action)}`);
}
