import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { blockInputSchema } from '@/lib/schemas/golfTeeSheet';
import { createCourse, deleteCourses } from './courses';
import {
    courseHasSchedules, createScheduleCounted, deleteScheduleCounted, generateTeeTimes, updateSchedule,
} from './teeTimes';
import { addBlock, listBlocks, removeBlock } from './blocks';

/**
 * Tee-sheet control against a real database: blocks, in-place schedule edits and their previews.
 * Skips when no database is reachable. Dates are in 2030 so nothing real collides.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT closed_by_block_id FROM golf_tee_times LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const courses: string[] = [];
const users: string[] = [];
/** 08:00 on Sunday 6 January 2030 in Manila. */
const NOW = new Date('2030-01-06T00:00:00Z');

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function course(over: Partial<GolfCourseInput> = {}) {
    const input: GolfCourseInput = {
        name: `Sheet ${run} ${courses.length}`, country: 'Sheetland', city: 'Testville',
        slug: `sheet-${run}-${courses.length}`, address: null, description: '', holes: 18, par: null,
        greenFeeFrom: null, currency: 'USD', imageUrls: [], amenities: [], timezone: 'Asia/Manila',
        freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '', yardage: null, yearOpened: null,
        designer: null, grass: null, ...over,
    };
    const c = await createCourse(input);
    courses.push(c.id);
    return c;
}

const daily: TeeTimeScheduleInput = {
    name: 'Daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:30',
    intervalMinutes: 10, spots: 4, pricePerPlayer: 100,
};

async function withSchedule(over: Partial<GolfCourseInput> = {}, schedule: Partial<TeeTimeScheduleInput> = {}) {
    const c = await course(over);
    const made = await createScheduleCounted({ courseId: c.id, input: { ...daily, ...schedule }, now: NOW });
    return { course: c, schedule: made!.schedule, created: made!.impact.created };
}

/** Tee times of a course on one Manila date, as "HH:MM status". */
async function sheet(courseId: string, date: string) {
    const db = await sql();
    const rows = await db<{ t: string; status: string; price: number }[]>`
        SELECT to_char(starts_at AT TIME ZONE 'Asia/Manila', 'HH24:MI') AS t, status, price_per_player::float8 AS price
          FROM golf_tee_times
         WHERE course_id = ${courseId} AND (starts_at AT TIME ZONE 'Asia/Manila')::date = ${date}::date
         ORDER BY starts_at`;
    return rows;
}

async function bookOn(courseId: string, date: string, time: string, status: string, players = 2) {
    const db = await sql();
    const email = `sheet-${run}-${users.length}@example.com`;
    const [user] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${email}) RETURNING id`;
    users.push(user.id);
    const [tt] = await db<{ id: string }[]>`
        SELECT id FROM golf_tee_times
         WHERE course_id = ${courseId} AND to_char(starts_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI') = ${`${date} ${time}`}`;
    const reference = `CG-T${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    await db`
        INSERT INTO golf_bookings (reference, user_id, course_id, tee_time_id, players, lead_name, contact_email,
            price_per_player, green_fee_total, service_fee, total, currency, hold_expires_at, free_cancel_until, status)
        VALUES (${reference}, ${user.id}, ${courseId}, ${tt.id}, ${players}, 'Test Player', ${email},
            100, ${100 * players}, 5, ${100 * players + 5}, 'USD', ${NOW}, ${NOW}, ${status})`;
    return { reference, teeTimeId: tt.id };
}

const block = (over: Record<string, unknown> = {}) =>
    blockInputSchema.parse({ startsOn: '2030-01-10', endsOn: '2030-01-10', ...over });

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    if (courses.length) await db`DELETE FROM golf_bookings WHERE course_id IN ${db(courses)}`;
    if (courses.length) await deleteCourses(courses);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

describe.skipIf(!reachable)('blocks', () => {
    it('closes a whole day, leaves other days open, and reopens exactly that on removal', async () => {
        const { course: c } = await withSchedule();
        const added = await addBlock({ courseId: c.id, input: block(), now: NOW });
        expect(added.impact.closed).toBe(4);
        expect((await sheet(c.id, '2030-01-10')).map(r => r.status)).toEqual(['closed', 'closed', 'closed', 'closed']);
        expect((await sheet(c.id, '2030-01-11')).map(r => r.status)).toEqual(['open', 'open', 'open', 'open']);
        expect((await listBlocks(c.id, NOW))[0]).toMatchObject({ startsOn: '2030-01-10', closedTeeTimes: 4, fromTime: null });

        const removed = await removeBlock({ courseId: c.id, blockId: added.block.id, now: NOW });
        expect(removed?.impact.reopened).toBe(4);
        expect((await sheet(c.id, '2030-01-10')).map(r => r.status)).toEqual(['open', 'open', 'open', 'open']);
        expect(await listBlocks(c.id, NOW)).toEqual([]);
    });

    it('honours weekdays and a first-to-last tee window on the course clock', async () => {
        const { course: c } = await withSchedule();
        // Every Tuesday in January, 07:10 to 07:20 inclusive. 8, 15, 22 and 29 January 2030 are Tuesdays.
        const added = await addBlock({
            courseId: c.id, now: NOW,
            input: block({ startsOn: '2030-01-07', endsOn: '2030-01-31', weekdays: [2], fromTime: '07:10', toTime: '07:20' }),
        });
        expect(added.impact.closed).toBe(8);
        expect((await sheet(c.id, '2030-01-15')).map(r => `${r.t} ${r.status}`))
            .toEqual(['07:00 open', '07:10 closed', '07:20 closed', '07:30 open']);
        expect((await sheet(c.id, '2030-01-16')).every(r => r.status === 'open')).toBe(true);
    });

    it('stops further sales on a tee time that has a booking, and does not touch the booking', async () => {
        const { course: c } = await withSchedule();
        const booked = await bookOn(c.id, '2030-01-10', '07:10', 'confirmed');
        const added = await addBlock({ courseId: c.id, input: block(), now: NOW });
        expect(added.impact.closed).toBe(4);
        expect(added.impact.affectedBookings).toEqual([booked.reference]);

        const db = await sql();
        const [b] = await db<{ status: string }[]>`SELECT status FROM golf_bookings WHERE reference = ${booked.reference}`;
        expect(b.status).toBe('confirmed');
    });

    it('keeps a tee time closed while another block still covers it', async () => {
        const { course: c } = await withSchedule();
        const day = await addBlock({ courseId: c.id, input: block(), now: NOW });
        const morning = await addBlock({ courseId: c.id, input: block({ fromTime: '07:00', toTime: '07:10' }), now: NOW });
        // The morning block found its tee times already closed by the day block.
        expect(morning.impact.closed).toBe(0);

        // With the day block gone, the morning block still holds its own two tee times.
        await removeBlock({ courseId: c.id, blockId: day.block.id, now: NOW });
        expect((await sheet(c.id, '2030-01-10')).map(r => `${r.t} ${r.status}`))
            .toEqual(['07:00 closed', '07:10 closed', '07:20 open', '07:30 open']);

        await removeBlock({ courseId: c.id, blockId: morning.block.id, now: NOW });
        expect((await sheet(c.id, '2030-01-10')).every(r => r.status === 'open')).toBe(true);
    });

    it('re-points a tee time to the block that still holds it', async () => {
        const { course: c } = await withSchedule();
        const day = await addBlock({ courseId: c.id, input: block(), now: NOW });
        const early = await addBlock({ courseId: c.id, input: block({ fromTime: '07:00', toTime: '07:10' }), now: NOW });
        // Make the early block the closer of its two tee times, then remove the day block.
        await removeBlock({ courseId: c.id, blockId: day.block.id, now: NOW });
        const blocks = await listBlocks(c.id, NOW);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].id).toBe(early.block.id);
    });

    it('applies to tee times generated later', async () => {
        const { course: c } = await withSchedule({ bookingWindowDays: 7 });
        await addBlock({ courseId: c.id, input: block({ startsOn: '2030-01-20', endsOn: '2030-01-20' }), now: NOW });
        expect(await sheet(c.id, '2030-01-20')).toEqual([]);

        await generateTeeTimes({ courseId: c.id, now: new Date('2030-01-14T00:00:00Z') });
        expect((await sheet(c.id, '2030-01-20')).map(r => r.status)).toEqual(['closed', 'closed', 'closed', 'closed']);
    });

    it('previews exactly what it would do and writes nothing', async () => {
        const { course: c } = await withSchedule();
        const preview = await addBlock({ courseId: c.id, input: block(), now: NOW, dryRun: true });
        expect(preview.impact.closed).toBe(4);
        expect((await sheet(c.id, '2030-01-10')).every(r => r.status === 'open')).toBe(true);
        expect(await listBlocks(c.id, NOW)).toEqual([]);
    });

    it('will not touch another course\'s block, and needs a time zone', async () => {
        const { course: a } = await withSchedule();
        const { course: b } = await withSchedule();
        const added = await addBlock({ courseId: a.id, input: block(), now: NOW });
        expect(await removeBlock({ courseId: b.id, blockId: added.block.id, now: NOW })).toBeNull();

        const zoneless = await course({ timezone: null });
        await expect(addBlock({ courseId: zoneless.id, input: block(), now: NOW })).rejects.toMatchObject({ code: 'not_eligible' });
    });
});

describe.skipIf(!reachable)('editing a schedule in place', () => {
    it('reprices tee times nobody has booked and leaves a booked one at the price it was sold at', async () => {
        const { course: c, schedule } = await withSchedule();
        const booked = await bookOn(c.id, '2030-01-10', '07:00', 'confirmed');
        const result = await updateSchedule({
            courseId: c.id, scheduleId: schedule.id, now: NOW, input: { ...daily, pricePerPlayer: 150 },
        });
        expect(result?.impact.leftAlone).toBe(1);
        expect(result?.impact.updated).toBeGreaterThan(200);

        const day = await sheet(c.id, '2030-01-10');
        expect(day.map(r => r.price)).toEqual([100, 150, 150, 150]);
        const db = await sql();
        const [b] = await db<{ price: number }[]>`SELECT price_per_player::float8 AS price FROM golf_bookings WHERE reference = ${booked.reference}`;
        expect(b.price).toBe(100);
    });

    it('deletes tee times the pattern drops when nobody ever booked them, and closes ones with history', async () => {
        const { course: c, schedule } = await withSchedule();
        await bookOn(c.id, '2030-01-10', '07:20', 'expired');
        const result = await updateSchedule({
            courseId: c.id, scheduleId: schedule.id, now: NOW, input: { ...daily, lastTee: '07:10' },
        });
        // 07:20 and 07:30 on every day go; the one with a booking row on 10 January is closed, not deleted.
        expect(result?.impact.closed).toBe(1);
        expect(result?.impact.deleted).toBeGreaterThan(100);
        expect((await sheet(c.id, '2030-01-10')).map(r => `${r.t} ${r.status}`)).toEqual(['07:00 open', '07:10 open', '07:20 closed']);
        expect((await sheet(c.id, '2030-01-11')).map(r => r.t)).toEqual(['07:00', '07:10']);
    });

    it('creates tee times for a pattern that grows, and honours existing blocks', async () => {
        const { course: c, schedule } = await withSchedule();
        await addBlock({ courseId: c.id, input: block({ fromTime: '07:40', toTime: '07:40' }), now: NOW });
        const result = await updateSchedule({
            courseId: c.id, scheduleId: schedule.id, now: NOW, input: { ...daily, lastTee: '07:40' },
        });
        expect(result?.impact.created).toBeGreaterThan(50);
        expect((await sheet(c.id, '2030-01-10')).map(r => `${r.t} ${r.status}`).pop()).toBe('07:40 closed');
        expect((await sheet(c.id, '2030-01-11')).map(r => `${r.t} ${r.status}`).pop()).toBe('07:40 open');
    });

    it('previews the same impact it then applies', async () => {
        const { course: c, schedule } = await withSchedule();
        const input = { ...daily, pricePerPlayer: 175 };
        const preview = await updateSchedule({ courseId: c.id, scheduleId: schedule.id, input, now: NOW, dryRun: true });
        expect((await sheet(c.id, '2030-01-10')).every(r => r.price === 100)).toBe(true);

        const applied = await updateSchedule({ courseId: c.id, scheduleId: schedule.id, input, now: NOW });
        expect(applied?.impact).toEqual(preview?.impact);
        expect((await sheet(c.id, '2030-01-10')).every(r => r.price === 175)).toBe(true);
    });

    it('refuses a schedule that belongs to another course', async () => {
        const { schedule } = await withSchedule();
        const other = await course();
        expect(await updateSchedule({ courseId: other.id, scheduleId: schedule.id, input: daily, now: NOW })).toBeNull();
        expect(await deleteScheduleCounted({ courseId: other.id, scheduleId: schedule.id, now: NOW })).toBeNull();
    });
});

describe.skipIf(!reachable)('adding and deleting schedules with a preview', () => {
    it('previews a new schedule without writing it', async () => {
        const c = await course();
        const preview = await createScheduleCounted({ courseId: c.id, input: daily, now: NOW, dryRun: true });
        // Four a day for 60 days, less today's four (07:00-07:30 is before 08:00 in Manila).
        expect(preview?.impact.created).toBe(236);
        expect(await courseHasSchedules(c.id)).toBe(false);

        const made = await createScheduleCounted({ courseId: c.id, input: daily, now: NOW });
        expect(made?.impact.created).toBe(236);
        expect(await courseHasSchedules(c.id)).toBe(true);
    });

    it('counts a deletion and keeps a booked tee time, closed', async () => {
        const { course: c, schedule } = await withSchedule();
        await withSchedule(); // another course; unrelated
        // A second schedule so the course is deletable even when published rules apply.
        await createScheduleCounted({ courseId: c.id, input: { ...daily, name: 'Late', firstTee: '14:00', lastTee: '14:00' }, now: NOW });
        await bookOn(c.id, '2030-01-10', '07:00', 'confirmed');

        const preview = await deleteScheduleCounted({ courseId: c.id, scheduleId: schedule.id, now: NOW, dryRun: true });
        expect(await courseHasSchedules(c.id)).toBe(true);
        const applied = await deleteScheduleCounted({ courseId: c.id, scheduleId: schedule.id, now: NOW });
        expect(applied?.impact).toEqual(preview?.impact);
        expect(applied?.impact.closed).toBe(1);
        expect((await sheet(c.id, '2030-01-10')).map(r => `${r.t} ${r.status}`)).toEqual(['07:00 closed', '14:00 open']);
    });
});
