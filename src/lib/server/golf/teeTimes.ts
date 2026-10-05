import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { TeeTime, TeeTimeSchedule, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { expandSchedule } from '@/lib/golf/schedule';
import { addDays, localDate, localTime, zonedTimeToUtc } from '@/lib/golf/time';
import { HORIZON_DAYS, MIN_LEAD_HOURS, isBookableStart } from '@/lib/golf/rules';
import { CourseNotSchedulableError } from './errors';

/**
 * Tee-time schedules and the tee times they generate (CONTEXT.md, "Tee Time"). A tee time is a
 * row with a capacity; selling it is the conditional decrement in bookings.ts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3_600_000;

interface TeeTimeRow {
    id: string;
    startsAt: Date;
    spots: number;
    spotsLeft: number;
    pricePerPlayer: number;
    currency: string;
}

function toTeeTime(row: TeeTimeRow, tz: string): TeeTime {
    return {
        id: row.id,
        startsAt: row.startsAt.toISOString(),
        localTime: localTime(row.startsAt, tz),
        spots: row.spots,
        spotsLeft: row.spotsLeft,
        pricePerPlayer: row.pricePerPlayer,
        currency: row.currency.trim(),
    };
}

function scheduleColumns(sql: postgres.Sql) {
    return sql`
        s.id, s.course_id AS "courseId", s.name, s.days_of_week AS "daysOfWeek",
        to_char(s.first_tee, 'HH24:MI') AS "firstTee", to_char(s.last_tee, 'HH24:MI') AS "lastTee",
        s.interval_minutes AS "intervalMinutes", s.spots, s.price_per_player::float8 AS "pricePerPlayer"`;
}

/** postgres.js returns a RowList; plain objects cross the server/client boundary cleanly. */
const plainSchedule = (s: TeeTimeSchedule): TeeTimeSchedule => ({ ...s, daysOfWeek: [...s.daysOfWeek] });

export async function listSchedules(courseId: string): Promise<TeeTimeSchedule[]> {
    const sql = getSqlAdmin();
    const rows = await sql<TeeTimeSchedule[]>`
        SELECT ${scheduleColumns(sql)} FROM golf_tee_time_schedules s
         WHERE s.course_id = ${courseId}
         ORDER BY s.first_tee, s.name`;
    return rows.map(plainSchedule);
}

export async function courseHasSchedules(courseId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const [row] = await sql<{ has: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM golf_tee_time_schedules WHERE course_id = ${courseId}) AS has`;
    return row.has;
}

/**
 * Adds a schedule and generates its tee times. null when the course does not exist; throws
 * CourseNotSchedulableError while the course has no time zone.
 */
export async function createSchedule(
    courseId: string,
    input: TeeTimeScheduleInput,
    now = new Date(),
): Promise<{ schedule: TeeTimeSchedule; generated: number } | null> {
    const sql = getSqlAdmin();
    const [course] = await sql<{ timezone: string | null }[]>`SELECT timezone FROM golf_courses WHERE id = ${courseId}`;
    if (!course) return null;
    if (!course.timezone) throw new CourseNotSchedulableError();

    const [{ id }] = await sql<{ id: string }[]>`
        INSERT INTO golf_tee_time_schedules
            (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
        VALUES
            (${courseId}, ${input.name}, ${input.daysOfWeek}::smallint[], ${input.firstTee}::time,
             ${input.lastTee}::time, ${input.intervalMinutes}, ${input.spots}, ${input.pricePerPlayer})
        RETURNING id`;
    const generated = await generateTeeTimes({ courseId, now });
    const [schedule] = await sql<TeeTimeSchedule[]>`
        SELECT ${scheduleColumns(sql)} FROM golf_tee_time_schedules s WHERE s.id = ${id}`;
    return { schedule: plainSchedule(schedule), generated };
}

/**
 * Deletes a schedule. Its future tee times nobody has booked go with it; any a booking points at
 * stay, closed, so that booking keeps its tee time. false when there was no such schedule.
 */
export async function deleteSchedule(id: string, now = new Date()): Promise<boolean> {
    const sql = getSqlAdmin();
    return sql.begin(async tx => {
        await tx`
            DELETE FROM golf_tee_times t
             WHERE t.schedule_id = ${id} AND t.starts_at > ${now}
               AND NOT EXISTS (SELECT 1 FROM golf_bookings b WHERE b.tee_time_id = t.id)`;
        await tx`UPDATE golf_tee_times SET status = 'closed' WHERE schedule_id = ${id} AND starts_at > ${now}`;
        const rows = await tx`DELETE FROM golf_tee_time_schedules WHERE id = ${id} RETURNING id`;
        return rows.length > 0;
    });
}

/**
 * Creates the tee times every schedule promises for the next HORIZON_DAYS course-local days.
 * Idempotent: a tee time that already exists at the same course and start is left alone, so a
 * re-run never resets spots already sold. Returns how many were created.
 */
export async function generateTeeTimes({ courseId, now = new Date() }: { courseId?: string; now?: Date } = {}): Promise<number> {
    const sql = getSqlAdmin();
    const schedules = await sql<(TeeTimeSchedule & { timezone: string; currency: string })[]>`
        SELECT ${scheduleColumns(sql)}, c.timezone, c.currency
          FROM golf_tee_time_schedules s
          JOIN golf_courses c ON c.id = s.course_id
         WHERE c.timezone IS NOT NULL ${courseId ? sql`AND s.course_id = ${courseId}` : sql``}`;

    let created = 0;
    for (const s of schedules) {
        const starts = expandSchedule(s, s.timezone, localDate(now, s.timezone), HORIZON_DAYS)
            .filter(start => start.getTime() > now.getTime());
        const rows = starts.map(start => ({
            course_id: s.courseId,
            schedule_id: s.id,
            starts_at: start,
            spots: s.spots,
            spots_left: s.spots,
            price_per_player: s.pricePerPlayer,
            currency: s.currency.trim(),
        }));
        for (let i = 0; i < rows.length; i += 1000) {
            const result = await sql`
                INSERT INTO golf_tee_times ${sql(rows.slice(i, i + 1000))}
                ON CONFLICT (course_id, starts_at) DO NOTHING`;
            created += result.count;
        }
    }
    return created;
}

export interface CourseAvailability {
    timezone: string;
    teeTimes: TeeTime[];
}

/**
 * Open tee times with a spot left on one course-local `date`, from MIN_LEAD_HOURS ahead. null
 * when the course is unknown, a draft, or has no time zone.
 */
export async function listAvailableTeeTimes(slug: string, date: string, now = new Date()): Promise<CourseAvailability | null> {
    const sql = getSqlAdmin();
    const [course] = await sql<{ id: string; timezone: string | null }[]>`
        SELECT id, timezone FROM golf_courses WHERE slug = ${slug} AND status = 'published'`;
    if (!course?.timezone) return null;
    const tz = course.timezone;

    const dayStart = zonedTimeToUtc(date, '00:00', tz);
    const dayEnd = zonedTimeToUtc(addDays(date, 1), '00:00', tz);
    const earliest = new Date(Math.max(dayStart.getTime(), now.getTime() + MIN_LEAD_HOURS * HOUR));

    const rows = await sql<TeeTimeRow[]>`
        SELECT id, starts_at AS "startsAt", spots, spots_left AS "spotsLeft",
               price_per_player::float8 AS "pricePerPlayer", currency
          FROM golf_tee_times
         WHERE course_id = ${course.id} AND status = 'open' AND spots_left > 0
           AND starts_at >= ${earliest} AND starts_at < ${dayEnd}
         ORDER BY starts_at`;
    return { timezone: tz, teeTimes: rows.map(r => toTeeTime(r, tz)) };
}

export interface BookableTeeTime {
    teeTime: TeeTime;
    course: {
        id: string;
        slug: string;
        name: string;
        city: string;
        country: string;
        timezone: string;
        freeCancelHours: number;
        coverUrl: string | null;
    };
}

type BookableRow = TeeTimeRow & {
    courseId: string; slug: string; name: string; city: string; country: string;
    timezone: string; freeCancelHours: number; coverUrl: string | null;
};

/** A tee time a customer may book at `now`, with its course; null for anything else. */
export async function getBookableTeeTime(id: string, now = new Date()): Promise<BookableTeeTime | null> {
    if (!UUID.test(id)) return null;
    const sql = getSqlAdmin();
    const [row] = await sql<BookableRow[]>`
        SELECT t.id, t.starts_at AS "startsAt", t.spots, t.spots_left AS "spotsLeft",
               t.price_per_player::float8 AS "pricePerPlayer", t.currency,
               c.id AS "courseId", c.slug, c.name, c.city, c.country, c.timezone,
               c.free_cancel_hours AS "freeCancelHours", c.image_urls[1] AS "coverUrl"
          FROM golf_tee_times t
          JOIN golf_courses c ON c.id = t.course_id
         WHERE t.id = ${id} AND t.status = 'open' AND c.status = 'published' AND c.timezone IS NOT NULL`;
    if (!row || !isBookableStart(row.startsAt, now)) return null;
    return {
        teeTime: toTeeTime(row, row.timezone),
        course: {
            id: row.courseId, slug: row.slug, name: row.name, city: row.city, country: row.country,
            timezone: row.timezone, freeCancelHours: row.freeCancelHours, coverUrl: row.coverUrl,
        },
    };
}
