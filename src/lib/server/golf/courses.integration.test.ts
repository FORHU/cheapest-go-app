import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import {
    createCourse, updateCourse, setCourseStatus, deleteCourses,
    getPublishedCourseBySlug, listPublishedCourses, listPublishedCountries, listCoursesForAdmin,
} from './courses';
import { SlugTakenError } from './errors';

/**
 * Golf Courses against a real database: every rule here — drafts off the storefront, the
 * country filter, slug uniqueness — is expressed in SQL. Skips when no database is reachable.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_courses LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const created: string[] = [];
let made = 0;

function input(over: Partial<GolfCourseInput> = {}): GolfCourseInput {
    return {
        name: 'Test Course', country: `Testland-${run}`, city: 'Testville', slug: `golf-test-${run}-${made++}`,
        address: null, description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD',
        imageUrls: [], amenities: ['cart'], ...over,
    };
}

async function make(over: Partial<GolfCourseInput> = {}, publish = false) {
    const course = await createCourse(input(over));
    created.push(course.id);
    if (publish) await setCourseStatus(course.id, 'published');
    return course;
}

describe.skipIf(!reachable)('golf courses', () => {
    afterAll(async () => { if (created.length) await deleteCourses(created); });

    it('keeps drafts off the storefront', async () => {
        const draft = await make();
        expect(draft.status).toBe('draft');
        expect(await getPublishedCourseBySlug(draft.slug)).toBeNull();
        expect((await listPublishedCourses({ country: draft.country })).map(c => c.id)).not.toContain(draft.id);
    });

    it('shows a published course, filtered by country, with numbers as numbers', async () => {
        const course = await make({}, true);
        const found = await getPublishedCourseBySlug(course.slug);
        expect(found).toMatchObject({ id: course.id, greenFeeFrom: 85, currency: 'USD', amenities: ['cart'] });
        expect((await listPublishedCourses({ country: course.country })).map(c => c.id)).toContain(course.id);
        expect(await listPublishedCountries()).toContain(course.country);
    });

    it('refuses a slug another course has', async () => {
        const first = await make();
        await expect(createCourse(input({ slug: first.slug }))).rejects.toBeInstanceOf(SlugTakenError);
    });

    it('updates, and reports an unknown id as null', async () => {
        const course = await make();
        const updated = await updateCourse(course.id, input({ slug: course.slug, name: 'Renamed' }));
        expect(updated?.name).toBe('Renamed');
        expect(await updateCourse(crypto.randomUUID(), input())).toBeNull();
    });

    it('finds courses for the admin by name, city or country, drafts included', async () => {
        const course = await make({ name: `Findable ${run}` });
        const result = await listCoursesForAdmin({ q: `Findable ${run}`, page: 1 });
        expect(result.courses.map(c => c.id)).toEqual([course.id]);
        expect(result.total).toBe(1);
    });
});
