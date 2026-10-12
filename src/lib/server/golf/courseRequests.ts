import { getSqlAdmin } from '@/lib/db/postgres';
import { slugify, type GolfCourseInput } from '@/lib/schemas/golf';
import type { CourseRequest, CourseRequestInput, CourseRequestStatus } from '@/lib/schemas/golfStaff';
import { createCourse } from './courses';
import { CourseStaffError, SlugTakenError } from './errors';
import { grantCourseAccess } from './staff';

/**
 * Requests to list or claim a Golf Course (CONTEXT.md, "Course Staff"). A signed-in customer
 * asks; an admin decides. Approving attaches the account to the course, creating it as a draft
 * when it was not listed. One open request per person: a second would only jump the queue.
 */

interface Row {
    id: string; userId: string; status: CourseRequestStatus; contactName: string; contactEmail: string;
    courseName: string; country: string; city: string; existingCourseId: string | null;
    existingCourseName: string | null; message: string; courseId: string | null; decisionNote: string;
    createdAt: Date; decidedAt: Date | null;
}

const toRequest = (r: Row): CourseRequest => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
});

const select = (sql: ReturnType<typeof getSqlAdmin>) => sql`
    SELECT r.id, r.user_id AS "userId", r.status, r.contact_name AS "contactName", r.contact_email AS "contactEmail",
           r.course_name AS "courseName", r.country, r.city, r.existing_course_id AS "existingCourseId",
           e.name AS "existingCourseName", r.message, r.course_id AS "courseId", r.decision_note AS "decisionNote",
           r.created_at AS "createdAt", r.decided_at AS "decidedAt"
      FROM golf_course_requests r
      LEFT JOIN golf_courses e ON e.id = r.existing_course_id`;

export async function submitCourseRequest(
    { userId, contactEmail, input }: { userId: string; contactEmail: string; input: CourseRequestInput },
): Promise<CourseRequest> {
    const sql = getSqlAdmin();
    const [user] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${userId}`;
    if (!user) throw new CourseStaffError('user_not_found', 'There is no account for this person.');
    if (user.role !== 'user' && user.role !== 'course_staff') {
        throw new CourseStaffError('not_eligible', 'This account is already staff. Use a customer account to ask for a course.');
    }
    if (input.existingCourseId) {
        const [found] = await sql`SELECT 1 FROM golf_courses WHERE id = ${input.existingCourseId} AND status = 'published'`;
        if (!found) throw new CourseStaffError('course_not_found', 'That course is not listed.');
    }

    try {
        const [row] = await sql<{ id: string }[]>`
            INSERT INTO golf_course_requests
                (user_id, contact_name, contact_email, course_name, country, city, existing_course_id, message)
            VALUES
                (${userId}, ${input.contactName}, ${contactEmail}, ${input.courseName}, ${input.country},
                 ${input.city}, ${input.existingCourseId}, ${input.message})
            RETURNING id`;
        const [created] = await sql<Row[]>`${select(sql)} WHERE r.id = ${row.id}`;
        return toRequest(created);
    } catch (err) {
        const e = err as { code?: string; constraint_name?: string };
        if (e?.code === '23505' && e.constraint_name === 'uq_golf_course_requests_pending') {
            throw new CourseStaffError('request_pending', 'You already have a request waiting. We will email you when it is decided.');
        }
        throw err;
    }
}

export async function listCourseRequests(status: CourseRequestStatus = 'pending'): Promise<CourseRequest[]> {
    const sql = getSqlAdmin();
    const rows = await sql<Row[]>`${select(sql)} WHERE r.status = ${status} ORDER BY r.created_at LIMIT 100`;
    return rows.map(toRequest);
}

export async function countPendingCourseRequests(): Promise<number> {
    const sql = getSqlAdmin();
    const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM golf_course_requests WHERE status = 'pending'`;
    return row.count;
}

/** The person's most recent request, for the request page to say where it stands. */
export async function latestRequestOf(userId: string): Promise<CourseRequest | null> {
    const sql = getSqlAdmin();
    const [row] = await sql<Row[]>`${select(sql)} WHERE r.user_id = ${userId} ORDER BY r.created_at DESC LIMIT 1`;
    return row ? toRequest(row) : null;
}

/** A draft course from a request, with a slug that is free (suffixed when the plain one is not). */
async function createDraftFrom(request: CourseRequest) {
    // A name with no Latin letters has no slug of its own; the request id keeps it unique.
    const base = slugify(request.courseName, request.city) || `course-${request.id.slice(0, 8)}`;
    for (let attempt = 0; attempt < 6; attempt++) {
        const input: GolfCourseInput = {
            name: request.courseName, country: request.country, city: request.city,
            slug: attempt === 0 ? base : `${base.slice(0, 110)}-${attempt + 1}`,
            address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD',
            imageUrls: [], amenities: [], timezone: null, freeCancelHours: 48, bookingWindowDays: 60,
            weatherPolicy: '', yardage: null, yearOpened: null, designer: null, grass: null,
        };
        try {
            return await createCourse(input);
        } catch (err) {
            if (!(err instanceof SlugTakenError)) throw err;
        }
    }
    throw new CourseStaffError('request_decided', 'Could not find a free address for this course. Add it by hand and attach the person.');
}

export async function approveCourseRequest(
    { id, decidedBy, courseId, note = '', now = new Date() }:
    { id: string; decidedBy: string; courseId?: string | null; note?: string; now?: Date },
): Promise<{ request: CourseRequest; courseId: string; createdCourse: boolean }> {
    const sql = getSqlAdmin();
    const [found] = await sql<Row[]>`${select(sql)} WHERE r.id = ${id}`;
    if (!found) throw new CourseStaffError('request_not_found', 'That request no longer exists.');
    const request = toRequest(found);
    if (request.status !== 'pending') throw new CourseStaffError('request_decided', 'This request has already been decided.');

    // The account must be able to hold course access before anything is created for it.
    const [user] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${request.userId}`;
    if (!user) throw new CourseStaffError('user_not_found', 'The person who asked no longer has an account.');
    if (user.role !== 'user' && user.role !== 'course_staff') {
        throw new CourseStaffError('not_eligible', 'This account is already staff, so it cannot be given a course.');
    }

    let target = courseId ?? request.existingCourseId;
    let createdCourse = false;
    if (!target) {
        target = (await createDraftFrom(request)).id;
        createdCourse = true;
    }

    await grantCourseAccess({ userId: request.userId, courseId: target, grantedBy: decidedBy });
    const rows = await sql`
        UPDATE golf_course_requests
           SET status = 'approved', course_id = ${target}, decided_by = ${decidedBy}, decided_at = ${now},
               decision_note = ${note}
         WHERE id = ${id} AND status = 'pending' RETURNING id`;
    if (rows.length === 0) throw new CourseStaffError('request_decided', 'This request has already been decided.');

    const [after] = await sql<Row[]>`${select(sql)} WHERE r.id = ${id}`;
    return { request: toRequest(after), courseId: target, createdCourse };
}

export async function rejectCourseRequest(
    { id, decidedBy, note = '', now = new Date() }: { id: string; decidedBy: string; note?: string; now?: Date },
): Promise<CourseRequest> {
    const sql = getSqlAdmin();
    const rows = await sql`
        UPDATE golf_course_requests
           SET status = 'rejected', decided_by = ${decidedBy}, decided_at = ${now}, decision_note = ${note}
         WHERE id = ${id} AND status = 'pending' RETURNING id`;
    if (rows.length === 0) {
        const [exists] = await sql`SELECT 1 FROM golf_course_requests WHERE id = ${id}`;
        throw new CourseStaffError(exists ? 'request_decided' : 'request_not_found',
            exists ? 'This request has already been decided.' : 'That request no longer exists.');
    }
    const [after] = await sql<Row[]>`${select(sql)} WHERE r.id = ${id}`;
    return toRequest(after);
}
