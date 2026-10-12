import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { courseRequestInputSchema } from '@/lib/schemas/golfStaff';
import { submitCourseRequest } from '@/lib/server/golf/courseRequests';
import { CourseStaffError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** A signed-in customer asks to list or claim a course. An admin decides (see admin/golf-course-requests). */
export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;

    const { user } = await getAuthenticatedUser();
    if (!user) return fail(401, 'Please sign in to send a request.');

    const rl = await rateLimit(req, { limit: 5, windowMs: 3_600_000, prefix: 'golf-course-request', userId: user.id });
    if (!rl.success) return fail(429, 'Too many requests. Please try again later.');

    const parsed = courseRequestInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }

    try {
        // The email is the account's, not a form field: approval attaches this account.
        const request = await submitCourseRequest({ userId: user.id, contactEmail: user.email, input: parsed.data });
        return NextResponse.json({ success: true, data: { id: request.id, status: request.status } }, { status: 201 });
    } catch (err) {
        if (err instanceof CourseStaffError) return fail(err.httpStatus, err.message, { code: err.code });
        throw err;
    }
}
