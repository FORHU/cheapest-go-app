import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { BlockInput, CourseBlock, Impact } from '@/lib/schemas/golfTeeSheet';
import { noImpact } from '@/lib/schemas/golfTeeSheet';
import { inTransaction } from './dryRun';
import { CourseStaffError } from './errors';

/**
 * Blocks (CONTEXT.md, "Block"): dates, weekdays and a window of tee times a course has closed.
 *
 * A block closes the future tee times it matches, on the course's own clock, so that nothing new
 * is sold on them. It never cancels or changes a booking: a tee time that already has one is
 * closed to further sales and its bookings are returned, for the course to deal with. Cancelling
 * and refunding them is a separate, later step the course opts into (`cancelBookingsByCourse`,
 * ADR-0052): money cannot be moved inside a transaction a preview rolls back.
 * Removing a block reopens exactly the tee times it closed, and leaves closed any that another
 * block still covers.
 */

type Tx = postgres.TransactionSql;
type Fragment = postgres.Sql | postgres.TransactionSql;

/** Whether tee time `t` (on course `c`) falls inside block `b`. */
const matches = (sql: Fragment) => sql`
    (t.starts_at AT TIME ZONE c.timezone)::date BETWEEN b.starts_on AND b.ends_on
    AND (b.weekdays IS NULL OR EXTRACT(DOW FROM (t.starts_at AT TIME ZONE c.timezone))::int = ANY(b.weekdays))
    AND (b.from_time IS NULL OR (t.starts_at AT TIME ZONE c.timezone)::time BETWEEN b.from_time AND b.to_time)`;


/**
 * Closes the open future tee times that a block covers. Without `blockId`, every block of the
 * course (used after tee times are generated). Returns how many it closed.
 */
export async function applyBlocks(
    tx: Tx | postgres.Sql,
    { courseId, blockId, now }: { courseId?: string; blockId?: string; now: Date },
): Promise<number> {
    const rows = await tx`
        UPDATE golf_tee_times t SET status = 'closed', closed_by_block_id = b.id
          FROM golf_courses c, golf_course_blocks b
         WHERE c.id = t.course_id AND b.course_id = t.course_id AND c.timezone IS NOT NULL
           AND t.status = 'open' AND t.starts_at > ${now}
           ${courseId ? tx`AND t.course_id = ${courseId}` : tx``}
           ${blockId ? tx`AND b.id = ${blockId}` : tx``}
           AND ${matches(tx)}
        RETURNING t.id`;
    return rows.length;
}

interface BlockRow {
    id: string;
    courseId: string;
    startsOn: string;
    endsOn: string;
    weekdays: number[] | null;
    fromTime: string | null;
    toTime: string | null;
    note: string;
    createdAt: Date;
    closedTeeTimes: number;
}

const toBlock = (r: BlockRow): CourseBlock => ({
    ...r,
    weekdays: r.weekdays ? [...r.weekdays] : null,
    createdAt: r.createdAt.toISOString(),
});

const blockColumns = (sql: Fragment) => sql`
    b.id, b.course_id AS "courseId", to_char(b.starts_on, 'YYYY-MM-DD') AS "startsOn",
    to_char(b.ends_on, 'YYYY-MM-DD') AS "endsOn", b.weekdays,
    to_char(b.from_time, 'HH24:MI') AS "fromTime", to_char(b.to_time, 'HH24:MI') AS "toTime",
    b.note, b.created_at AS "createdAt"`;

export async function listBlocks(courseId: string, now = new Date()): Promise<CourseBlock[]> {
    const sql = getSqlAdmin();
    const rows = await sql<BlockRow[]>`
        SELECT ${blockColumns(sql)},
               (SELECT count(*)::int FROM golf_tee_times t
                 WHERE t.closed_by_block_id = b.id AND t.starts_at > ${now}) AS "closedTeeTimes"
          FROM golf_course_blocks b
         WHERE b.course_id = ${courseId} AND b.ends_on >= (${now}::timestamptz)::date - 30
         ORDER BY b.starts_on, b.created_at`;
    return rows.map(toBlock);
}

/**
 * Adds a block and closes what it covers. `dryRun` returns the same impact and writes nothing.
 * A course with no time zone cannot be matched on its own clock, so it is refused.
 */
export async function addBlock(
    { courseId, input, userId, now = new Date(), dryRun = false }:
    { courseId: string; input: BlockInput; userId?: string | null; now?: Date; dryRun?: boolean },
): Promise<{ block: CourseBlock; impact: Impact }> {
    return inTransaction(dryRun, async tx => {
        const [course] = await tx<{ timezone: string | null }[]>`SELECT timezone FROM golf_courses WHERE id = ${courseId} FOR UPDATE`;
        if (!course) throw new CourseStaffError('course_not_found', 'That course no longer exists.');
        if (!course.timezone) throw new CourseStaffError('not_eligible', 'Ask the team to set the course time zone first.');

        const [{ id }] = await tx<{ id: string }[]>`
            INSERT INTO golf_course_blocks (course_id, starts_on, ends_on, weekdays, from_time, to_time, note, created_by)
            VALUES (${courseId}, ${input.startsOn}::date, ${input.endsOn}::date, ${input.weekdays}::smallint[],
                    ${input.fromTime}::time, ${input.toTime}::time, ${input.note}, ${userId ?? null})
            RETURNING id`;

        // Which live bookings sit inside the range, before the tee times are closed around them.
        const affected = await tx<{ reference: string }[]>`
            SELECT DISTINCT gb.reference
              FROM golf_tee_times t
              JOIN golf_courses c ON c.id = t.course_id
              JOIN golf_course_blocks b ON b.id = ${id}
              JOIN golf_bookings gb ON gb.tee_time_id = t.id AND gb.status IN ('held', 'requested', 'confirmed')
             WHERE t.course_id = ${courseId} AND t.starts_at > ${now} AND ${matches(tx)}
             ORDER BY gb.reference`;

        const closed = await applyBlocks(tx, { courseId, blockId: id, now });
        const [row] = await tx<BlockRow[]>`
            SELECT ${blockColumns(tx)}, ${closed}::int AS "closedTeeTimes"
              FROM golf_course_blocks b WHERE b.id = ${id}`;

        return {
            block: toBlock(row),
            impact: { ...noImpact(), closed, affectedBookings: affected.map(a => a.reference) },
        };
    });
}

/** Removes a block and reopens what only it was holding closed. null when it is not this course's. */
export async function removeBlock(
    { courseId, blockId, now = new Date(), dryRun = false }:
    { courseId: string; blockId: string; now?: Date; dryRun?: boolean },
): Promise<{ impact: Impact } | null> {
    return inTransaction(dryRun, async tx => {
        const [block] = await tx`SELECT 1 FROM golf_course_blocks WHERE id = ${blockId} AND course_id = ${courseId} FOR UPDATE`;
        if (!block) return null;

        // Anything another block still covers stays closed, now under that block.
        await tx`
            UPDATE golf_tee_times t SET closed_by_block_id = b.id
              FROM golf_courses c, golf_course_blocks b
             WHERE t.closed_by_block_id = ${blockId} AND c.id = t.course_id
               AND b.course_id = t.course_id AND b.id <> ${blockId} AND ${matches(tx)}`;
        const reopened = await tx`
            UPDATE golf_tee_times SET status = 'open', closed_by_block_id = NULL
             WHERE closed_by_block_id = ${blockId} AND starts_at > ${now}
            RETURNING id`;
        await tx`DELETE FROM golf_course_blocks WHERE id = ${blockId}`;
        return { impact: { ...noImpact(), reopened: reopened.length } };
    });
}
