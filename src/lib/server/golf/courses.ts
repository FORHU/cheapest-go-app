import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { CourseProfileInput, GolfCourse, GolfCourseInput, GolfCourseStatus } from '@/lib/schemas/golf';
import { CourseHasBookingsError, CourseNotBookableError, SlugTakenError, TimezoneLockedError } from './errors';

/**
 * Every query about Golf Courses (CONTEXT.md, "Golf Course").
 *
 * "Published only" is decided here, in the public readers, and nowhere else — a page that
 * forgot the filter would put a half-written draft on the storefront.
 */

export const ADMIN_PAGE_SIZE = 20;

type Db = postgres.Sql | postgres.TransactionSql;

function columns(sql: Db) {
    return sql`
        id, slug, name, country, city, address, description, holes, par,
        green_fee_from::float8 AS "greenFeeFrom", currency, image_urls AS "imageUrls",
        amenities, status, timezone, free_cancel_hours AS "freeCancelHours",
        booking_window_days AS "bookingWindowDays", weather_policy AS "weatherPolicy",
        yardage, year_opened AS "yearOpened", designer, grass
    `;
}

/** postgres.js returns a RowList; plain objects cross the server/client boundary cleanly. */
function plain<T extends GolfCourse>(rows: readonly T[]): T[] {
    return rows.map(row => ({ ...row, currency: row.currency.trim() }));
}

function isSlugConflict(err: unknown): boolean {
    const e = err as { code?: string; constraint_name?: string };
    return e?.code === '23505' && e.constraint_name === 'golf_courses_slug_key';
}

/** The course's clock and whether it has schedules; undefined when there is no such course. */
async function clockState(sql: postgres.Sql, id: string) {
    const [row] = await sql<{ timezone: string | null; hasSchedules: boolean }[]>`
        SELECT c.timezone,
               EXISTS (SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS "hasSchedules"
          FROM golf_courses c WHERE c.id = ${id}`;
    return row;
}

export async function listPublishedCourses({ country }: { country?: string } = {}): Promise<GolfCourse[]> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses
         WHERE status = 'published' ${country ? sql`AND country = ${country}` : sql``}
         ORDER BY name`;
    return plain(rows);
}

/** The home-page row: newest first, so a course an admin just published shows up there. */
export async function listNewestPublishedCourses(limit: number): Promise<GolfCourse[]> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses
         WHERE status = 'published'
         ORDER BY created_at DESC
         LIMIT ${limit}`;
    return plain(rows);
}

export async function listPublishedCountries(): Promise<string[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ country: string }[]>`
        SELECT DISTINCT country FROM golf_courses WHERE status = 'published' ORDER BY country`;
    return rows.map(r => r.country);
}

/** Published courses with these ids, by name; unknown and draft ids are simply absent. */
export async function getPublishedCoursesByIds(ids: string[]): Promise<GolfCourse[]> {
    if (ids.length === 0) return [];
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses
         WHERE status = 'published' AND id IN ${sql(ids)}
         ORDER BY name`;
    return plain(rows);
}

export async function getPublishedCourseBySlug(slug: string): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses WHERE slug = ${slug} AND status = 'published'`;
    return plain(rows)[0] ?? null;
}

/** An admin list row: the course, and whether customers can book it. */
export type AdminGolfCourse = GolfCourse & { bookable: boolean };

export interface AdminCoursePage {
    courses: AdminGolfCourse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function listCoursesForAdmin({ q = '', page = 1 }: { q?: string; page?: number }): Promise<AdminCoursePage> {
    const sql = getSqlAdmin();
    const current = Math.max(1, Math.floor(page) || 1);
    const term = q.trim();
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const where = term
        ? sql`WHERE name ILIKE ${like} OR city ILIKE ${like} OR country ILIKE ${like}`
        : sql``;

    const [rows, [{ count }]] = await Promise.all([
        sql<AdminGolfCourse[]>`
            SELECT ${columns(sql)},
                   (timezone IS NOT NULL AND EXISTS (
                       SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = golf_courses.id)) AS bookable
              FROM golf_courses ${where}
             ORDER BY updated_at DESC
             LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(current - 1) * ADMIN_PAGE_SIZE}`,
        sql<{ count: number }[]>`SELECT count(*)::int AS count FROM golf_courses ${where}`,
    ]);

    return {
        courses: plain(rows),
        total: count,
        page: current,
        pageSize: ADMIN_PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(count / ADMIN_PAGE_SIZE)),
    };
}

export async function createCourse(input: GolfCourseInput): Promise<GolfCourse> {
    const sql = getSqlAdmin();
    try {
        const rows = await sql<GolfCourse[]>`
            INSERT INTO golf_courses
                (slug, name, country, city, address, description, holes, par,
                 green_fee_from, currency, image_urls, amenities, timezone, free_cancel_hours,
                 booking_window_days, weather_policy, yardage, year_opened, designer, grass)
            VALUES
                (${input.slug}, ${input.name}, ${input.country}, ${input.city}, ${input.address},
                 ${input.description}, ${input.holes}, ${input.par}, ${input.greenFeeFrom},
                 ${input.currency}, ${input.imageUrls}::text[], ${input.amenities}::text[],
                 ${input.timezone}, ${input.freeCancelHours}, ${input.bookingWindowDays},
                 ${input.weatherPolicy}, ${input.yardage}, ${input.yearOpened}, ${input.designer},
                 ${input.grass})
            RETURNING ${columns(sql)}`;
        return plain(rows)[0];
    } catch (err) {
        if (isSlugConflict(err)) throw new SlugTakenError(input.slug);
        throw err;
    }
}

/** null when no course has this id. */
export async function updateCourse(id: string, input: GolfCourseInput): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const state = await clockState(sql, id);
    if (!state) return null;
    // Tee times were generated on this clock (and a published course must keep one).
    if (state.hasSchedules && state.timezone !== input.timezone) throw new TimezoneLockedError();
    try {
        const rows = await sql<GolfCourse[]>`
            UPDATE golf_courses SET
                slug = ${input.slug}, name = ${input.name}, country = ${input.country},
                city = ${input.city}, address = ${input.address}, description = ${input.description},
                holes = ${input.holes}, par = ${input.par}, green_fee_from = ${input.greenFeeFrom},
                currency = ${input.currency}, image_urls = ${input.imageUrls}::text[],
                amenities = ${input.amenities}::text[], timezone = ${input.timezone},
                free_cancel_hours = ${input.freeCancelHours},
                booking_window_days = ${input.bookingWindowDays}, weather_policy = ${input.weatherPolicy},
                yardage = ${input.yardage}, year_opened = ${input.yearOpened},
                designer = ${input.designer}, grass = ${input.grass}, updated_at = now()
             WHERE id = ${id}
            RETURNING ${columns(sql)}`;
        return plain(rows)[0] ?? null;
    } catch (err) {
        if (isSlugConflict(err)) throw new SlugTakenError(input.slug);
        throw err;
    }
}

/**
 * false when no course has this id. Publishing is refused unless the course can be booked — a
 * time zone and at least one schedule — so a published course always offers tee times.
 */
export async function setCourseStatus(id: string, status: GolfCourseStatus): Promise<boolean> {
    const sql = getSqlAdmin();
    if (status === 'draft') {
        const rows = await sql`UPDATE golf_courses SET status = 'draft', updated_at = now() WHERE id = ${id} RETURNING id`;
        return rows.length > 0;
    }
    const rows = await sql`
        UPDATE golf_courses c SET status = 'published', updated_at = now()
         WHERE c.id = ${id} AND c.timezone IS NOT NULL
           AND EXISTS (SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = c.id)
        RETURNING c.id`;
    if (rows.length > 0) return true;
    if (await clockState(sql, id)) throw new CourseNotBookableError();
    return false;
}

/** A course in any status; null when there is none. For the portal and the admin, never a storefront. */
export async function getCourseById(id: string): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`SELECT ${columns(sql)} FROM golf_courses WHERE id = ${id}`;
    return plain(rows)[0] ?? null;
}

/** The course row, locked for the rest of the transaction; null when there is none. */
export async function lockCourse(tx: Db, id: string): Promise<GolfCourse | null> {
    const rows = await tx<GolfCourse[]>`SELECT ${columns(tx)} FROM golf_courses WHERE id = ${id} FOR UPDATE`;
    return plain(rows)[0] ?? null;
}

/**
 * Writes the fields a course describes itself with and nothing else: not its name, place, slug,
 * currency, time zone or status (ADR-0050). Takes the profile schema's output, so the columns it
 * can reach are fixed by what that schema allows.
 */
export async function writeProfile(tx: Db, id: string, input: CourseProfileInput): Promise<GolfCourse | null> {
    const rows = await tx<GolfCourse[]>`
        UPDATE golf_courses SET
            description = ${input.description}, address = ${input.address},
            amenities = ${input.amenities}::text[], image_urls = ${input.imageUrls}::text[],
            par = ${input.par}, yardage = ${input.yardage}, year_opened = ${input.yearOpened},
            designer = ${input.designer}, grass = ${input.grass}, weather_policy = ${input.weatherPolicy},
            booking_window_days = ${input.bookingWindowDays}, free_cancel_hours = ${input.freeCancelHours},
            updated_at = now()
         WHERE id = ${id}
        RETURNING ${columns(tx)}`;
    return plain(rows)[0] ?? null;
}

/** Sets the clock a course's tee times are on; null when no course has this id. */
export async function setCourseTimezone(id: string, timezone: string): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const state = await clockState(sql, id);
    if (!state) return null;
    if (state.hasSchedules && state.timezone !== timezone) throw new TimezoneLockedError();
    const rows = await sql<GolfCourse[]>`
        UPDATE golf_courses SET timezone = ${timezone}, updated_at = now() WHERE id = ${id}
        RETURNING ${columns(sql)}`;
    return plain(rows)[0] ?? null;
}

/** How many were deleted. */
export async function deleteCourses(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const sql = getSqlAdmin();
    try {
        const rows = await sql`DELETE FROM golf_courses WHERE id IN ${sql(ids)} RETURNING id`;
        return rows.length;
    } catch (err) {
        // golf_bookings restricts deletes: a booking must keep its course.
        if ((err as { code?: string })?.code === '23503') throw new CourseHasBookingsError();
        throw err;
    }
}
