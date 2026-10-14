import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { isCourseAuthError, requireCourseStaff } from '@/lib/server/golf/courseAccess';
import { MAX_PHOTO_BYTES, storePhoto } from '@/lib/server/golf/photos';
import { PhotoRejectedError } from '@/lib/server/golf/errors';
import { attachmentsConfigured } from '@/lib/server/storage/s3';

export const dynamic = 'force-dynamic';

/**
 * Takes one photo for a course's page and returns the path to put in its image list. The photo is
 * not public until the profile is saved with it (ADR-0050). A course that is not the caller's
 * reads as missing.
 */

const uuid = z.string().uuid();

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;
    // An upload costs a multipart parse and an object in a bucket, so it is limited harder than
    // a save.
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'course-profile-photos' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    // Without a bucket the page keeps URL paste and hides the button; this is the same answer
    // for anyone who calls anyway.
    if (!attachmentsConfigured()) return fail(503, 'Photo uploads are not available.');

    // Refused on the declared length before the body is read; the check that counts is on the
    // bytes in storePhoto, since a Content-Length can lie.
    if (Number(req.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES * 1.1) {
        return fail(413, 'Photos must be 5 MB or smaller.');
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return fail(400, 'Invalid upload');
    }

    const courseId = uuid.safeParse(form.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    if (!actor.courseIds.includes(courseId.data)) return fail(404, 'Course not found');

    const file = form.get('file');
    if (!(file instanceof File)) return fail(400, 'A file is required.');

    try {
        const photo = await storePhoto({
            courseId: courseId.data, userId: actor.id, bytes: Buffer.from(await file.arrayBuffer()),
        });
        return NextResponse.json({ success: true, data: photo }, { status: 201 });
    } catch (err) {
        if (err instanceof PhotoRejectedError) return fail(err.httpStatus, err.message);
        console.error('[course/profile/photos] upload failed:', err);
        return fail(500, 'Could not upload that photo.');
    }
}
