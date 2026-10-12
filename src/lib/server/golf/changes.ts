import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { CourseChange, CourseChangeKind } from '@/lib/schemas/golfTeeSheet';

/**
 * The history of a course's tee sheet: who changed what, newest first. Written by the routes
 * after a change has been applied, never by the preview; the course and the team both read it.
 */

export async function recordChange(
    { courseId, userId, kind, summary, details = {} }:
    { courseId: string; userId: string | null; kind: CourseChangeKind; summary: string; details?: Record<string, unknown> },
    sql: postgres.Sql | postgres.TransactionSql = getSqlAdmin(),
): Promise<void> {
    await sql`
        INSERT INTO golf_course_changes (course_id, user_id, kind, summary, details)
        VALUES (${courseId}, ${userId}, ${kind}, ${summary.slice(0, 300)}, ${JSON.stringify(details)}::jsonb)`;
}

export async function listChanges(courseId: string, limit = 30): Promise<CourseChange[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ id: string; kind: CourseChangeKind; summary: string; first: string | null; last: string | null; email: string | null; createdAt: Date }[]>`
        SELECT c.id, c.kind, c.summary, u.first_name AS first, u.last_name AS last, u.email, c.created_at AS "createdAt"
          FROM golf_course_changes c
          LEFT JOIN users u ON u.id = c.user_id
         WHERE c.course_id = ${courseId}
         ORDER BY c.created_at DESC
         LIMIT ${limit}`;
    return rows.map(r => ({
        id: r.id,
        kind: r.kind,
        summary: r.summary,
        by: [r.first, r.last].filter(Boolean).join(' ') || r.email,
        createdAt: r.createdAt.toISOString(),
    }));
}
