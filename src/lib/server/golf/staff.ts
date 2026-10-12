import { getSqlAdmin } from '@/lib/db/postgres';
import { CourseStaffError } from './errors';

/**
 * Who acts for which Golf Course (CONTEXT.md, "Course Staff"). `users.role` says a person is
 * course staff (ADR-0003); `golf_course_staff` says for which courses. Every route that lets
 * course staff touch a booking reads the second table, never only the role.
 *
 * Only `user` and `course_staff` accounts can be attached to a course. An admin or a Support
 * Agent keeps their role: attaching one would either demote them or do nothing, and a role the
 * person cannot get back from is not a thing to hand out as a side effect.
 */

export interface StaffCourse {
    id: string;
    slug: string;
    name: string;
    city: string;
    country: string;
    status: 'draft' | 'published';
}

export interface CourseStaffMember {
    userId: string;
    email: string;
    name: string;
    since: string;
}

/** Attaches `userId` to the course, and makes a customer account course staff. Idempotent. */
export async function grantCourseAccess(
    { userId, courseId, grantedBy }: { userId: string; courseId: string; grantedBy?: string | null },
): Promise<{ newlyGranted: boolean }> {
    const sql = getSqlAdmin();
    return sql.begin(async tx => {
        const [user] = await tx<{ role: string }[]>`SELECT role FROM users WHERE id = ${userId} FOR UPDATE`;
        if (!user) throw new CourseStaffError('user_not_found', 'There is no account for this person.');
        if (user.role !== 'user' && user.role !== 'course_staff') {
            throw new CourseStaffError(
                'not_eligible',
                'This account is already staff. Use a separate customer account for course access.',
            );
        }
        const [course] = await tx`SELECT 1 FROM golf_courses WHERE id = ${courseId}`;
        if (!course) throw new CourseStaffError('course_not_found', 'That course no longer exists.');

        const inserted = await tx`
            INSERT INTO golf_course_staff (user_id, course_id, granted_by)
            VALUES (${userId}, ${courseId}, ${grantedBy ?? null})
            ON CONFLICT (user_id, course_id) DO NOTHING
            RETURNING user_id`;
        await tx`UPDATE users SET role = 'course_staff', updated_at = now() WHERE id = ${userId} AND role = 'user'`;
        return { newlyGranted: inserted.length > 0 };
    });
}

/** Detaches one person from one course; their last course returns them to a customer account. */
export async function revokeCourseAccess({ userId, courseId }: { userId: string; courseId: string }): Promise<boolean> {
    const sql = getSqlAdmin();
    return sql.begin(async tx => {
        const removed = await tx`DELETE FROM golf_course_staff WHERE user_id = ${userId} AND course_id = ${courseId} RETURNING user_id`;
        await tx`
            UPDATE users SET role = 'user', updated_at = now()
             WHERE id = ${userId} AND role = 'course_staff'
               AND NOT EXISTS (SELECT 1 FROM golf_course_staff s WHERE s.user_id = users.id)`;
        return removed.length > 0;
    });
}

/** Removes every attachment; used when an admin changes the account to another role. */
export async function releaseCourseAccess(userId: string): Promise<number> {
    const sql = getSqlAdmin();
    const rows = await sql`DELETE FROM golf_course_staff WHERE user_id = ${userId} RETURNING course_id`;
    return rows.length;
}

/** The courses this person acts for, by name. Empty unless their role is course staff. */
export async function listCoursesOf(userId: string): Promise<StaffCourse[]> {
    const sql = getSqlAdmin();
    return sql<StaffCourse[]>`
        SELECT c.id, c.slug, c.name, c.city, c.country, c.status
          FROM golf_course_staff s
          JOIN golf_courses c ON c.id = s.course_id
          JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ${userId} AND u.role = 'course_staff'
         ORDER BY c.name`;
}

/** Whether this account may act for this course right now. */
export async function staffCanManage(userId: string, courseId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT 1 FROM golf_course_staff s JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ${userId} AND s.course_id = ${courseId} AND u.role = 'course_staff'`;
    return rows.length > 0;
}

export async function listStaffOf(courseId: string): Promise<CourseStaffMember[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ userId: string; email: string; first: string | null; last: string | null; since: Date }[]>`
        SELECT s.user_id AS "userId", u.email, u.first_name AS first, u.last_name AS last, s.created_at AS since
          FROM golf_course_staff s JOIN users u ON u.id = s.user_id
         WHERE s.course_id = ${courseId}
         ORDER BY s.created_at`;
    return rows.map(r => ({
        userId: r.userId,
        email: r.email,
        name: [r.first, r.last].filter(Boolean).join(' '),
        since: r.since.toISOString(),
    }));
}
