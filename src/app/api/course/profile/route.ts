import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { courseProfileInputSchema } from '@/lib/schemas/golf';
import { isCourseAuthError, requireCourseStaff } from '@/lib/server/golf/courseAccess';
import { getCourseById } from '@/lib/server/golf/courses';
import { listChanges, recordChange } from '@/lib/server/golf/changes';
import { PhotoNotOwnedError } from '@/lib/server/golf/errors';
import { updateProfile } from '@/lib/server/golf/profile';

export const dynamic = 'force-dynamic';

/**
 * A course's own profile: how it is described and what it promises (ADR-0050). A save applies
 * immediately and is recorded in the course's history; `preview: true` runs the same work and
 * writes nothing. A course that is not the caller's reads as missing.
 */

const uuid = z.string().uuid();

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** Field names as the history reads them. */
const FIELD_LABEL: Record<string, string> = {
    description: 'description', address: 'address', amenities: 'amenities', imageUrls: 'photos',
    par: 'par', yardage: 'yardage', yearOpened: 'year opened', designer: 'designer', grass: 'grass',
    weatherPolicy: 'weather rule', bookingWindowDays: 'booking window', freeCancelHours: 'free cancellation',
};

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'course-profile' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    const courseId = uuid.safeParse(new URL(req.url).searchParams.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    if (!actor.courseIds.includes(courseId.data)) return fail(404, 'Course not found');

    const course = await getCourseById(courseId.data);
    if (!course) return fail(404, 'Course not found');
    return NextResponse.json({ success: true, data: { course, changes: await listChanges(courseId.data) } });
}

export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'course-profile-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const courseId = uuid.safeParse(body.courseId);
    if (!courseId.success) return fail(400, 'courseId is required');
    if (!actor.courseIds.includes(courseId.data)) return fail(404, 'Course not found');
    const preview = body.preview === true;

    const parsed = courseProfileInputSchema.safeParse(body.profile);
    if (!parsed.success) {
        return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }

    try {
        const result = await updateProfile({ courseId: courseId.data, input: parsed.data, dryRun: preview });
        if (!result) return fail(404, 'Course not found');

        const fields = Object.keys(result.changes);
        if (!preview && fields.length > 0) {
            const summary = `Changed ${fields.map(f => FIELD_LABEL[f] ?? f).join(', ')}`;
            await recordChange({
                courseId: courseId.data, userId: actor.id, kind: 'profile_updated', summary, details: result.changes,
            });
            logAdminAction({
                action: 'course_profile_updated', adminId: actor.id, adminEmail: actor.email,
                targetId: courseId.data, details: { summary },
            });
        }
        return NextResponse.json({ success: true, data: { preview, ...result } });
    } catch (err) {
        if (err instanceof PhotoNotOwnedError) {
            return fail(400, err.message, { fieldErrors: { imageUrls: [err.message] } });
        }
        throw err;
    }
}
