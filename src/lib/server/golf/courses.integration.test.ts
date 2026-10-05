import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import {
    createCourse, updateCourse, setCourseStatus, setCourseTimezone, deleteCourses,
    getPublishedCourseBySlug, listPublishedCourses, listNewestPublishedCourses, listPublishedCountries, listCoursesForAdmin,
} from './courses';
import { CourseNotBookableError, SlugTakenError, TimezoneLockedError } from './errors';

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
        imageUrls: [], amenities: ['cart'], timezone: null, freeCancelHours: 48, ...over,
    };
}

/** A schedule row only: publishing needs one, these tests need no tee times. */
async function addSchedule(courseId: string) {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`
        INSERT INTO golf_tee_time_schedules
            (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
        VALUES (${courseId}, 'Test', '{1}', '07:00', '07:00', 10, 4, 100)`;
}

async function make(over: Partial<GolfCourseInput> = {}, publish = false) {
    const course = await createCourse(input(publish ? { timezone: 'Asia/Manila', ...over } : over));
    created.push(course.id);
    if (publish) {
        // Published means bookable (CONTEXT.md, "Golf Course").
        await addSchedule(course.id);
        await setCourseStatus(course.id, 'published');
    }
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

    it('lists the newest published courses first, drafts excluded, up to the limit', async () => {
        const older = await make({}, true);
        const newer = await make({}, true);
        await make(); // a draft, newer still
        expect((await listNewestPublishedCourses(2)).map(c => c.id)).toEqual([newer.id, older.id]);
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

    it('publishes only a course that can be booked', async () => {
        const course = await make();
        await expect(setCourseStatus(course.id, 'published')).rejects.toBeInstanceOf(CourseNotBookableError);
        await setCourseTimezone(course.id, 'Asia/Manila');
        await expect(setCourseStatus(course.id, 'published')).rejects.toBeInstanceOf(CourseNotBookableError);
        await addSchedule(course.id);
        expect(await setCourseStatus(course.id, 'published')).toBe(true);
        expect(await setCourseStatus(crypto.randomUUID(), 'published')).toBe(false);
    });

    it('locks the time zone while the course has schedules', async () => {
        const course = await make({ timezone: 'Asia/Manila' });
        await addSchedule(course.id);
        await expect(setCourseTimezone(course.id, 'Asia/Tokyo')).rejects.toBeInstanceOf(TimezoneLockedError);
        await expect(updateCourse(course.id, input({ slug: course.slug, timezone: null }))).rejects.toBeInstanceOf(TimezoneLockedError);
        const renamed = await updateCourse(course.id, input({ slug: course.slug, timezone: 'Asia/Manila', name: 'Same clock' }));
        expect(renamed?.name).toBe('Same clock');
        expect(await setCourseTimezone(crypto.randomUUID(), 'Asia/Tokyo')).toBeNull();
    });

    it('tells the admin which courses can be booked', async () => {
        const ready = await make({ name: `Bookable ${run}` }, true);
        const notYet = await make({ name: `Bookable ${run} later` });
        const result = await listCoursesForAdmin({ q: `Bookable ${run}`, page: 1 });
        expect(Object.fromEntries(result.courses.map(c => [c.id, c.bookable]))).toEqual({ [ready.id]: true, [notYet.id]: false });
    });
});
