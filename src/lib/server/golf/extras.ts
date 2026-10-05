import { getSqlAdmin } from '@/lib/db/postgres';
import { GOLF_EXTRAS, type ExtraOffer } from '@/lib/golf/extras';

/**
 * The extras a course offers (CONTEXT.md, "Golf Booking"), at its price per item. Not offered
 * means no row.
 */

export async function listCourseExtras(courseId: string): Promise<ExtraOffer[]> {
    const sql = getSqlAdmin();
    const rows = await sql<ExtraOffer[]>`
        SELECT code, price::float8 AS price FROM golf_course_extras
         WHERE course_id = ${courseId}
         ORDER BY array_position(${[...GOLF_EXTRAS]}::text[], code)`;
    return rows.map(row => ({ code: row.code, price: row.price }));
}

/** Replaces the extras a course offers; null when there is no such course. */
export async function setCourseExtras(courseId: string, offers: ExtraOffer[]): Promise<ExtraOffer[] | null> {
    const sql = getSqlAdmin();
    const [course] = await sql`SELECT 1 FROM golf_courses WHERE id = ${courseId}`;
    if (!course) return null;
    await sql.begin(async tx => {
        await tx`DELETE FROM golf_course_extras WHERE course_id = ${courseId}`;
        if (offers.length > 0) {
            await tx`INSERT INTO golf_course_extras ${tx(offers.map(o => ({ course_id: courseId, code: o.code, price: o.price })))}`;
        }
    });
    return listCourseExtras(courseId);
}
