import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { GolfCourse, GolfCourseInput, GolfCourseStatus } from '@/lib/schemas/golf';
import { SlugTakenError } from './errors';

/**
 * Every query about Golf Courses (CONTEXT.md, "Golf Course").
 *
 * "Published only" is decided here, in the public readers, and nowhere else — a page that
 * forgot the filter would put a half-written draft on the storefront.
 */

export const ADMIN_PAGE_SIZE = 20;

function columns(sql: postgres.Sql) {
    return sql`
        id, slug, name, country, city, address, description, holes, par,
        green_fee_from::float8 AS "greenFeeFrom", currency, image_urls AS "imageUrls",
        amenities, status
    `;
}

/** postgres.js returns a RowList; plain objects cross the server/client boundary cleanly. */
function plain(rows: readonly GolfCourse[]): GolfCourse[] {
    return rows.map(row => ({ ...row, currency: row.currency.trim() }));
}

function isSlugConflict(err: unknown): boolean {
    const e = err as { code?: string; constraint_name?: string };
    return e?.code === '23505' && e.constraint_name === 'golf_courses_slug_key';
}

export async function listPublishedCourses({ country }: { country?: string } = {}): Promise<GolfCourse[]> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses
         WHERE status = 'published' ${country ? sql`AND country = ${country}` : sql``}
         ORDER BY name`;
    return plain(rows);
}

export async function listPublishedCountries(): Promise<string[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ country: string }[]>`
        SELECT DISTINCT country FROM golf_courses WHERE status = 'published' ORDER BY country`;
    return rows.map(r => r.country);
}

export async function getPublishedCourseBySlug(slug: string): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses WHERE slug = ${slug} AND status = 'published'`;
    return plain(rows)[0] ?? null;
}

export interface AdminCoursePage {
    courses: GolfCourse[];
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
        sql<GolfCourse[]>`
            SELECT ${columns(sql)} FROM golf_courses ${where}
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
                 green_fee_from, currency, image_urls, amenities)
            VALUES
                (${input.slug}, ${input.name}, ${input.country}, ${input.city}, ${input.address},
                 ${input.description}, ${input.holes}, ${input.par}, ${input.greenFeeFrom},
                 ${input.currency}, ${input.imageUrls}::text[], ${input.amenities}::text[])
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
    try {
        const rows = await sql<GolfCourse[]>`
            UPDATE golf_courses SET
                slug = ${input.slug}, name = ${input.name}, country = ${input.country},
                city = ${input.city}, address = ${input.address}, description = ${input.description},
                holes = ${input.holes}, par = ${input.par}, green_fee_from = ${input.greenFeeFrom},
                currency = ${input.currency}, image_urls = ${input.imageUrls}::text[],
                amenities = ${input.amenities}::text[], updated_at = now()
             WHERE id = ${id}
            RETURNING ${columns(sql)}`;
        return plain(rows)[0] ?? null;
    } catch (err) {
        if (isSlugConflict(err)) throw new SlugTakenError(input.slug);
        throw err;
    }
}

/** false when no course has this id. */
export async function setCourseStatus(id: string, status: GolfCourseStatus): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql`
        UPDATE golf_courses SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
}

/** How many were deleted. */
export async function deleteCourses(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const sql = getSqlAdmin();
    const rows = await sql`DELETE FROM golf_courses WHERE id IN ${sql(ids)} RETURNING id`;
    return rows.length;
}
