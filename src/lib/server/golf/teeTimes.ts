import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { TeeTime, TeeTimeSchedule, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { expandSchedule } from '@/lib/golf/schedule';
import { addDays, localDate, localTime, zonedTimeToUtc } from '@/lib/golf/time';
import { MIN_LEAD_HOURS, isBookableStart } from '@/lib/golf/rules';
import { CourseNotSchedulableError, LastScheduleError } from './errors';
import { applyBlocks } from './blocks';
import { inTransaction } from './dryRun';
import { noImpact, type Impact } from '@/lib/schemas/golfTeeSheet';

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

function scheduleColumns(sql: postgres.Sql | postgres.TransactionSql) {
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
        const [schedule] = await tx<{ published: boolean; others: number }[]>`
            SELECT c.status = 'published' AS published,
                   (SELECT count(*)::int FROM golf_tee_time_schedules o
                     WHERE o.course_id = s.course_id AND o.id <> s.id) AS others
              FROM golf_tee_time_schedules s
              JOIN golf_courses c ON c.id = s.course_id
             WHERE s.id = ${id}
               FOR UPDATE OF c`;
        if (!schedule) return false;
        // Published means bookable: the last schedule stays until the course is unpublished.
        if (schedule.published && schedule.others === 0) throw new LastScheduleError();
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
 * Creates the tee times every schedule promises for the next `booking_window_days` of its course.
 * Idempotent: a tee time that already exists at the same course and start is left alone, so a
 * re-run never resets spots already sold. Returns how many were created.
 */
export async function generateTeeTimes({ courseId, now = new Date() }: { courseId?: string; now?: Date } = {}): Promise<number> {
    const sql = getSqlAdmin();
    const schedules = await sql<(TeeTimeSchedule & { timezone: string; currency: string; windowDays: number })[]>`
        SELECT ${scheduleColumns(sql)}, c.timezone, c.currency, c.booking_window_days AS "windowDays"
          FROM golf_tee_time_schedules s
          JOIN golf_courses c ON c.id = s.course_id
         WHERE c.timezone IS NOT NULL ${courseId ? sql`AND s.course_id = ${courseId}` : sql``}`;

    let created = 0;
    for (const s of schedules) {
        const starts = expandSchedule(s, s.timezone, localDate(now, s.timezone), s.windowDays)
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
    // Tee times that did not exist yesterday must honour the blocks a course already has.
    await applyBlocks(sql, { courseId, now });
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
    const [course] = await sql<{ id: string; timezone: string | null; windowDays: number }[]>`
        SELECT id, timezone, booking_window_days AS "windowDays" FROM golf_courses WHERE slug = ${slug} AND status = 'published'`;
    if (!course?.timezone) return null;
    const tz = course.timezone;

    const dayStart = zonedTimeToUtc(date, '00:00', tz);
    const dayEnd = zonedTimeToUtc(addDays(date, 1), '00:00', tz);
    const earliest = new Date(Math.max(dayStart.getTime(), now.getTime() + MIN_LEAD_HOURS * HOUR));
    // Past the course's window nothing is bookable, so nothing is listed (same edge as isBookableStart).
    const latest = new Date(Math.min(dayEnd.getTime(), now.getTime() + (course.windowDays + 1) * 24 * HOUR + 1));

    const rows = await sql<TeeTimeRow[]>`
        SELECT id, starts_at AS "startsAt", spots, spots_left AS "spotsLeft",
               price_per_player::float8 AS "pricePerPlayer", currency
          FROM golf_tee_times
         WHERE course_id = ${course.id} AND status = 'open' AND spots_left > 0
           AND starts_at >= ${earliest} AND starts_at < ${latest}
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
        bookingWindowDays: number;
        weatherPolicy: string;
        coverUrl: string | null;
    };
}

type BookableRow = TeeTimeRow & {
    courseId: string; slug: string; name: string; city: string; country: string;
    timezone: string; freeCancelHours: number; bookingWindowDays: number; weatherPolicy: string;
    coverUrl: string | null;
};

/** A tee time a customer may book at `now`, with its course; null for anything else. */
export async function getBookableTeeTime(id: string, now = new Date()): Promise<BookableTeeTime | null> {
    if (!UUID.test(id)) return null;
    const sql = getSqlAdmin();
    const [row] = await sql<BookableRow[]>`
        SELECT t.id, t.starts_at AS "startsAt", t.spots, t.spots_left AS "spotsLeft",
               t.price_per_player::float8 AS "pricePerPlayer", t.currency,
               c.id AS "courseId", c.slug, c.name, c.city, c.country, c.timezone,
               c.free_cancel_hours AS "freeCancelHours", c.booking_window_days AS "bookingWindowDays",
               c.weather_policy AS "weatherPolicy", c.image_urls[1] AS "coverUrl"
          FROM golf_tee_times t
          JOIN golf_courses c ON c.id = t.course_id
         WHERE t.id = ${id} AND t.status = 'open' AND c.status = 'published' AND c.timezone IS NOT NULL`;
    if (!row || !isBookableStart(row.startsAt, now, row.bookingWindowDays)) return null;
    return {
        teeTime: toTeeTime(row, row.timezone),
        course: {
            id: row.courseId, slug: row.slug, name: row.name, city: row.city, country: row.country,
            timezone: row.timezone, freeCancelHours: row.freeCancelHours,
            bookingWindowDays: row.bookingWindowDays, weatherPolicy: row.weatherPolicy, coverUrl: row.coverUrl,
        },
    };
}

// ── Changing a schedule from the portal ──────────────────────────────────────

type CourseClock = { timezone: string; currency: string; windowDays: number };

/**
 * Makes a schedule's future tee times match its pattern, and counts what that did:
 *
 * - a tee time the pattern still produces and no live booking sits on takes the new price and
 *   spots; one with a live booking is left alone, so nothing a customer holds moves under them;
 * - a tee time the pattern no longer produces is deleted when no booking ever pointed at it, and
 *   closed when one did (closed means nothing new is sold; its bookings are not touched);
 * - tee times the pattern now produces that do not exist are created, and blocks are applied.
 */
async function reconcileSchedule(
    tx: postgres.TransactionSql,
    { courseId, scheduleId, input, clock, now }:
    { courseId: string; scheduleId: string; input: TeeTimeScheduleInput; clock: CourseClock; now: Date },
): Promise<Impact> {
    const wanted = new Map<number, Date>();
    for (const start of expandSchedule(input, clock.timezone, localDate(now, clock.timezone), clock.windowDays)) {
        if (start.getTime() > now.getTime()) wanted.set(start.getTime(), start);
    }

    const existing = await tx<{ id: string; startsAt: Date; live: boolean; history: boolean }[]>`
        SELECT t.id, t.starts_at AS "startsAt",
               EXISTS (SELECT 1 FROM golf_bookings b WHERE b.tee_time_id = t.id
                        AND b.status IN ('held', 'requested', 'confirmed')) AS live,
               EXISTS (SELECT 1 FROM golf_bookings b WHERE b.tee_time_id = t.id) AS history
          FROM golf_tee_times t
         WHERE t.schedule_id = ${scheduleId} AND t.starts_at > ${now}`;

    const impact = noImpact();
    const keep: string[] = [];
    const retireDelete: string[] = [];
    const retireClose: string[] = [];
    for (const row of existing) {
        if (wanted.has(row.startsAt.getTime())) {
            wanted.delete(row.startsAt.getTime());
            if (row.live) impact.leftAlone += 1; else keep.push(row.id);
        } else if (row.history) {
            retireClose.push(row.id);
        } else {
            retireDelete.push(row.id);
        }
    }

    if (keep.length > 0) {
        const updated = await tx`
            UPDATE golf_tee_times SET price_per_player = ${input.pricePerPlayer}, spots = ${input.spots}, spots_left = ${input.spots}
             WHERE id IN ${tx(keep)}
               AND (price_per_player <> ${input.pricePerPlayer} OR spots <> ${input.spots})
            RETURNING id`;
        impact.updated = updated.length;
    }
    if (retireDelete.length > 0) {
        const gone = await tx`DELETE FROM golf_tee_times WHERE id IN ${tx(retireDelete)} RETURNING id`;
        impact.deleted = gone.length;
    }
    if (retireClose.length > 0) {
        const closed = await tx`
            UPDATE golf_tee_times SET status = 'closed', closed_by_block_id = NULL
             WHERE id IN ${tx(retireClose)} AND status <> 'closed' RETURNING id`;
        impact.closed += closed.length;
    }

    const rows = [...wanted.values()].map(start => ({
        course_id: courseId, schedule_id: scheduleId, starts_at: start, spots: input.spots,
        spots_left: input.spots, price_per_player: input.pricePerPlayer, currency: clock.currency.trim(),
    }));
    for (let i = 0; i < rows.length; i += 1000) {
        const result = await tx`
            INSERT INTO golf_tee_times ${tx(rows.slice(i, i + 1000))}
            ON CONFLICT (course_id, starts_at) DO NOTHING`;
        impact.created += result.count;
    }
    impact.closed += await applyBlocks(tx, { courseId, now });
    return impact;
}

async function lockClock(tx: postgres.TransactionSql, courseId: string): Promise<CourseClock | null> {
    const [course] = await tx<{ timezone: string | null; currency: string; windowDays: number }[]>`
        SELECT timezone, currency, booking_window_days AS "windowDays" FROM golf_courses WHERE id = ${courseId} FOR UPDATE`;
    if (!course) return null;
    if (!course.timezone) throw new CourseNotSchedulableError();
    return { timezone: course.timezone, currency: course.currency, windowDays: course.windowDays };
}

/** Adds a schedule and creates its tee times, counting them. `dryRun` writes nothing. */
export async function createScheduleCounted(
    { courseId, input, now = new Date(), dryRun = false }:
    { courseId: string; input: TeeTimeScheduleInput; now?: Date; dryRun?: boolean },
): Promise<{ schedule: TeeTimeSchedule; impact: Impact } | null> {
    return inTransaction(dryRun, async tx => {
        const clock = await lockClock(tx, courseId);
        if (!clock) return null;
        const [{ id }] = await tx<{ id: string }[]>`
            INSERT INTO golf_tee_time_schedules
                (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
            VALUES
                (${courseId}, ${input.name}, ${input.daysOfWeek}::smallint[], ${input.firstTee}::time,
                 ${input.lastTee}::time, ${input.intervalMinutes}, ${input.spots}, ${input.pricePerPlayer})
            RETURNING id`;
        const impact = await reconcileSchedule(tx, { courseId, scheduleId: id, input, clock, now });
        const [schedule] = await tx<TeeTimeSchedule[]>`
            SELECT ${scheduleColumns(tx)} FROM golf_tee_time_schedules s WHERE s.id = ${id}`;
        return { schedule: plainSchedule(schedule), impact };
    });
}

/** Changes a schedule and reconciles its future tee times. null when it is not this course's. */
export async function updateSchedule(
    { courseId, scheduleId, input, now = new Date(), dryRun = false }:
    { courseId: string; scheduleId: string; input: TeeTimeScheduleInput; now?: Date; dryRun?: boolean },
): Promise<{ schedule: TeeTimeSchedule; impact: Impact } | null> {
    return inTransaction(dryRun, async tx => {
        const clock = await lockClock(tx, courseId);
        if (!clock) return null;
        const [owned] = await tx`SELECT 1 FROM golf_tee_time_schedules WHERE id = ${scheduleId} AND course_id = ${courseId}`;
        if (!owned) return null;

        await tx`
            UPDATE golf_tee_time_schedules SET
                name = ${input.name}, days_of_week = ${input.daysOfWeek}::smallint[],
                first_tee = ${input.firstTee}::time, last_tee = ${input.lastTee}::time,
                interval_minutes = ${input.intervalMinutes}, spots = ${input.spots},
                price_per_player = ${input.pricePerPlayer}, updated_at = now()
             WHERE id = ${scheduleId}`;
        const impact = await reconcileSchedule(tx, { courseId, scheduleId, input, clock, now });
        const [schedule] = await tx<TeeTimeSchedule[]>`
            SELECT ${scheduleColumns(tx)} FROM golf_tee_time_schedules s WHERE s.id = ${scheduleId}`;
        return { schedule: plainSchedule(schedule), impact };
    });
}

/**
 * What deleting a schedule would do, or does: future tee times nobody ever booked are deleted,
 * the rest are closed (their bookings are untouched). Same rule as deleteSchedule, with counts.
 */
export async function deleteScheduleCounted(
    { courseId, scheduleId, now = new Date(), dryRun = false }:
    { courseId: string; scheduleId: string; now?: Date; dryRun?: boolean },
): Promise<{ impact: Impact } | null> {
    return inTransaction(dryRun, async tx => {
        const [schedule] = await tx<{ published: boolean; others: number }[]>`
            SELECT c.status = 'published' AS published,
                   (SELECT count(*)::int FROM golf_tee_time_schedules o
                     WHERE o.course_id = s.course_id AND o.id <> s.id) AS others
              FROM golf_tee_time_schedules s
              JOIN golf_courses c ON c.id = s.course_id
             WHERE s.id = ${scheduleId} AND c.id = ${courseId}
               FOR UPDATE OF c`;
        if (!schedule) return null;
        if (schedule.published && schedule.others === 0) throw new LastScheduleError();

        const deleted = await tx`
            DELETE FROM golf_tee_times t
             WHERE t.schedule_id = ${scheduleId} AND t.starts_at > ${now}
               AND NOT EXISTS (SELECT 1 FROM golf_bookings b WHERE b.tee_time_id = t.id)
            RETURNING t.id`;
        const closed = await tx`
            UPDATE golf_tee_times SET status = 'closed', closed_by_block_id = NULL
             WHERE schedule_id = ${scheduleId} AND starts_at > ${now} AND status <> 'closed' RETURNING id`;
        await tx`DELETE FROM golf_tee_time_schedules WHERE id = ${scheduleId}`;
        return { impact: { ...noImpact(), deleted: deleted.length, closed: closed.length } };
    });
}
