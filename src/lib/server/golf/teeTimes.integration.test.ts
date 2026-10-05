import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { createCourse, setCourseStatus, deleteCourses } from './courses';
import {
    courseHasSchedules, createSchedule, deleteSchedule, generateTeeTimes,
    getBookableTeeTime, listAvailableTeeTimes, listSchedules,
} from './teeTimes';
import { CourseNotSchedulableError } from './errors';

/**
 * Tee times against a real database: generation, the 24-hour lead and "published only" are
 * all SQL. Skips when no database is reachable. Uses dates in 2030 so nothing real collides.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_tee_times LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const created: string[] = [];
/** 08:00 on Sunday 6 January 2030 in Manila. */
const NOW = new Date('2030-01-06T00:00:00Z');

function course(over: Partial<GolfCourseInput> = {}): GolfCourseInput {
    return {
        name: `Tee Time Test ${run}`, country: 'Philippines', city: 'Manila',
        slug: `tee-time-test-${run}-${created.length}`, address: null, description: '', holes: 18,
        par: null, greenFeeFrom: null, currency: 'PHP', imageUrls: [], amenities: [],
        timezone: 'Asia/Manila', freeCancelHours: 48, ...over,
    };
}

const daily: TeeTimeScheduleInput = {
    name: 'Daily early', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:30',
    intervalMinutes: 10, spots: 4, pricePerPlayer: 2500,
};

async function make(over: Partial<GolfCourseInput> = {}) {
    const c = await createCourse(course(over));
    created.push(c.id);
    return c;
}

afterAll(async () => {
    if (created.length) await deleteCourses(created);
});

describe.skipIf(!reachable)('tee times against a real database', () => {
    it('refuses a schedule until the course has a time zone', async () => {
        const c = await make({ timezone: null });
        await expect(createSchedule(c.id, daily, NOW)).rejects.toBeInstanceOf(CourseNotSchedulableError);
    });

    it('generates the horizon once, skipping tee times already past', async () => {
        const c = await make();
        const result = await createSchedule(c.id, daily, NOW);
        // Four a day for 60 days, less today's four: 07:00–07:30 in Manila is before 08:00.
        expect(result?.generated).toBe(236);
        expect(await generateTeeTimes({ courseId: c.id, now: NOW })).toBe(0);
        expect(await listSchedules(c.id)).toEqual([expect.objectContaining({ name: 'Daily early', firstTee: '07:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })]);
        expect(await courseHasSchedules(c.id)).toBe(true);
    });

    it('sells only published courses, and nothing inside the 24-hour lead', async () => {
        const c = await make();
        await createSchedule(c.id, daily, NOW);
        expect(await listAvailableTeeTimes(c.slug, '2030-01-08', NOW)).toBeNull();

        await setCourseStatus(c.id, 'published');
        // 7 January 07:00–07:30 in Manila is 6 January 23:00–23:30 UTC: under 24 hours away.
        expect((await listAvailableTeeTimes(c.slug, '2030-01-07', NOW))?.teeTimes).toEqual([]);

        const day = await listAvailableTeeTimes(c.slug, '2030-01-08', NOW);
        expect(day?.teeTimes.map(t => t.localTime)).toEqual(['07:00', '07:10', '07:20', '07:30']);
        expect(day?.teeTimes[0]).toMatchObject({ spots: 4, spotsLeft: 4, pricePerPlayer: 2500, currency: 'PHP' });

        const bookable = await getBookableTeeTime(day!.teeTimes[0].id, NOW);
        expect(bookable?.course).toMatchObject({ slug: c.slug, timezone: 'Asia/Manila', freeCancelHours: 48 });
        expect(await getBookableTeeTime('not-a-uuid', NOW)).toBeNull();
    });

    it('takes a deleted schedule\'s unbooked tee times with it', async () => {
        const c = await make();
        const result = await createSchedule(c.id, daily, NOW);
        expect(await deleteSchedule(result!.schedule.id, NOW)).toBe(true);
        await setCourseStatus(c.id, 'published');
        expect((await listAvailableTeeTimes(c.slug, '2030-01-08', NOW))?.teeTimes).toEqual([]);
        expect(await listSchedules(c.id)).toEqual([]);
        expect(await courseHasSchedules(c.id)).toBe(false);
    });
});
