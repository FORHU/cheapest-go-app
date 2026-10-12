import { createHash, randomBytes } from 'node:crypto';
import { getSqlAdmin } from '@/lib/db/postgres';
import { staffEmailSchema, type CourseInvitation, type InvitationState } from '@/lib/schemas/golfStaff';
import { CourseStaffError } from './errors';
import { grantCourseAccess } from './staff';

/**
 * Invitations to act for a Golf Course (CONTEXT.md, "Course Staff").
 *
 * An invitation is a promise to one email address. The emailed link carries a random token; only
 * its SHA-256 hash is stored, so reading this table cannot produce a working link. It is used
 * once, expires, and is accepted only by an account whose email is the one invited: a forwarded
 * link is useless to anyone else.
 */

export const INVITATION_DAYS = 7;
const DAY = 86_400_000;

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type InvitationLookup =
    | { state: 'valid'; invitationId: string; courseId: string; courseName: string; email: string; expiresAt: string }
    | { state: 'expired' | 'used' | 'revoked'; courseName: string; email: string }
    | { state: 'unknown' };

interface Row {
    id: string;
    courseId: string;
    courseName: string;
    email: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
}

/** Creates an invitation and returns the token, which exists nowhere else and is shown once. */
export async function createInvitation(
    { courseId, email, invitedBy, now = new Date() }: { courseId: string; email: string; invitedBy?: string | null; now?: Date },
): Promise<{ id: string; token: string; expiresAt: Date; courseName: string; email: string }> {
    const parsed = staffEmailSchema.safeParse(email);
    if (!parsed.success) throw new CourseStaffError('invalid_email', parsed.error.issues[0]?.message ?? 'Enter a valid email address');
    const address = parsed.data;

    const sql = getSqlAdmin();
    const token = newToken();
    const expiresAt = new Date(now.getTime() + INVITATION_DAYS * DAY);

    return sql.begin(async tx => {
        const [course] = await tx<{ name: string }[]>`SELECT name FROM golf_courses WHERE id = ${courseId}`;
        if (!course) throw new CourseStaffError('course_not_found', 'That course no longer exists.');
        // A newer invitation replaces an older one for the same person and course.
        await tx`
            UPDATE golf_course_invitations SET revoked_at = ${now}
             WHERE course_id = ${courseId} AND email = ${address} AND accepted_at IS NULL AND revoked_at IS NULL`;
        const [row] = await tx<{ id: string }[]>`
            INSERT INTO golf_course_invitations (course_id, email, token_hash, invited_by, expires_at, created_at)
            VALUES (${courseId}, ${address}, ${hashToken(token)}, ${invitedBy ?? null}, ${expiresAt}, ${now})
            RETURNING id`;
        return { id: row.id, token, expiresAt, courseName: course.name, email: address };
    });
}

export async function describeInvitation(token: string, now = new Date()): Promise<InvitationLookup> {
    if (!token || token.length > 200) return { state: 'unknown' };
    const sql = getSqlAdmin();
    const [row] = await sql<Row[]>`
        SELECT i.id, i.course_id AS "courseId", c.name AS "courseName", i.email,
               i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt", i.revoked_at AS "revokedAt"
          FROM golf_course_invitations i JOIN golf_courses c ON c.id = i.course_id
         WHERE i.token_hash = ${hashToken(token)}`;
    if (!row) return { state: 'unknown' };
    if (row.acceptedAt) return { state: 'used', courseName: row.courseName, email: row.email };
    if (row.revokedAt) return { state: 'revoked', courseName: row.courseName, email: row.email };
    if (row.expiresAt.getTime() <= now.getTime()) return { state: 'expired', courseName: row.courseName, email: row.email };
    return {
        state: 'valid', invitationId: row.id, courseId: row.courseId, courseName: row.courseName,
        email: row.email, expiresAt: row.expiresAt.toISOString(),
    };
}

/**
 * Gives the signed-in account the invited course. An unknown, used, revoked or expired token all
 * read the same to the caller; a different account's email is named, so the person knows which
 * address to sign in with.
 */
export async function acceptInvitation(
    { token, userId, userEmail, now = new Date() }: { token: string; userId: string; userEmail: string; now?: Date },
): Promise<{ courseId: string; courseName: string }> {
    const lookup = await describeInvitation(token, now);
    if (lookup.state !== 'valid') {
        throw new CourseStaffError('invitation_invalid', 'This invitation is no longer valid. Ask for a new one.');
    }
    if (lookup.email !== userEmail.trim().toLowerCase()) {
        throw new CourseStaffError(
            'wrong_account',
            `This invitation is for ${lookup.email}. Sign in with that address to accept it.`,
            { invitedEmail: lookup.email },
        );
    }

    // Grant first: if the account cannot hold course access the invitation must stay usable.
    await grantCourseAccess({ userId, courseId: lookup.courseId });
    const sql = getSqlAdmin();
    await sql`
        UPDATE golf_course_invitations SET accepted_at = ${now}, accepted_by = ${userId}
         WHERE id = ${lookup.invitationId} AND accepted_at IS NULL AND revoked_at IS NULL`;
    return { courseId: lookup.courseId, courseName: lookup.courseName };
}

/** True when a pending invitation was withdrawn. */
export async function revokeInvitation(id: string, now = new Date()): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql`
        UPDATE golf_course_invitations SET revoked_at = ${now}
         WHERE id = ${id} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`;
    return rows.length > 0;
}

export async function listInvitations(courseId: string, now = new Date()): Promise<CourseInvitation[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{
        id: string; courseId: string; email: string; expiresAt: Date; createdAt: Date;
        acceptedAt: Date | null; revokedAt: Date | null;
    }[]>`
        SELECT id, course_id AS "courseId", email, expires_at AS "expiresAt", created_at AS "createdAt",
               accepted_at AS "acceptedAt", revoked_at AS "revokedAt"
          FROM golf_course_invitations WHERE course_id = ${courseId}
         ORDER BY created_at DESC LIMIT 50`;
    return rows.map(r => {
        const state: InvitationState = r.acceptedAt ? 'accepted'
            : r.revokedAt ? 'revoked'
                : r.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
        return {
            id: r.id, courseId: r.courseId, email: r.email, state,
            expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString(),
        };
    });
}
