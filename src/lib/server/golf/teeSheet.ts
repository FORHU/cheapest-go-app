import { getSqlAdmin } from '@/lib/db/postgres';
import type { ExtraOffer } from '@/lib/golf/extras';
import { localDate } from '@/lib/golf/time';
import type { TeeTimeSchedule } from '@/lib/schemas/golf';
import type { CourseBlock, CourseChange, SheetTeeTime } from '@/lib/schemas/golfTeeSheet';
import { listBlocks } from './blocks';
import { listChanges } from './changes';
import { listCourseExtras } from './extras';
import { listSchedules } from './teeTimes';

/**
 * Everything the tee-sheet page shows about one course: its schedules, blocks, extras, recent
 * changes and the sheet for one day. Read-only; the changes themselves are in teeTimes.ts,
 * blocks.ts and extras.ts.
 */

export interface TeeSheetOverview {
    course: {
        id: string;
        name: string;
        status: 'draft' | 'published';
        timezone: string | null;
        currency: string;
        bookingWindowDays: number;
    };
    schedules: TeeTimeSchedule[];
    blocks: CourseBlock[];
    extras: ExtraOffer[];
    changes: CourseChange[];
    day: { date: string; teeTimes: SheetTeeTime[] };
}

export async function daySheet(courseId: string, date: string): Promise<SheetTeeTime[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{
        id: string; localTime: string; pricePerPlayer: number; currency: string; spots: number;
        spotsLeft: number; status: 'open' | 'closed'; booked: number; byBlock: boolean;
    }[]>`
        SELECT t.id, to_char(t.starts_at AT TIME ZONE c.timezone, 'HH24:MI') AS "localTime",
               t.price_per_player::float8 AS "pricePerPlayer", t.currency, t.spots,
               t.spots_left AS "spotsLeft", t.status,
               COALESCE((SELECT sum(b.players)::int FROM golf_bookings b
                          WHERE b.tee_time_id = t.id AND b.status IN ('held', 'requested', 'confirmed')), 0) AS booked,
               t.closed_by_block_id IS NOT NULL AS "byBlock"
          FROM golf_tee_times t
          JOIN golf_courses c ON c.id = t.course_id
         WHERE t.course_id = ${courseId} AND c.timezone IS NOT NULL
           AND (t.starts_at AT TIME ZONE c.timezone)::date = ${date}::date
         ORDER BY t.starts_at`;
    return rows.map(r => ({
        id: r.id,
        localTime: r.localTime,
        pricePerPlayer: r.pricePerPlayer,
        currency: r.currency.trim(),
        spots: r.spots,
        spotsLeft: r.spotsLeft,
        status: r.status,
        booked: r.booked,
        closedBy: r.status === 'closed' ? (r.byBlock ? 'block' : 'schedule') : null,
    }));
}

/** null when there is no such course. `date` defaults to today on the course's clock. */
export async function getTeeSheet(courseId: string, date?: string, now = new Date()): Promise<TeeSheetOverview | null> {
    const sql = getSqlAdmin();
    const [course] = await sql<{
        id: string; name: string; status: 'draft' | 'published'; timezone: string | null;
        currency: string; bookingWindowDays: number;
    }[]>`
        SELECT id, name, status, timezone, currency, booking_window_days AS "bookingWindowDays"
          FROM golf_courses WHERE id = ${courseId}`;
    if (!course) return null;

    const shown = date ?? (course.timezone ? localDate(now, course.timezone) : now.toISOString().slice(0, 10));
    const [schedules, blocks, extras, changes, teeTimes] = await Promise.all([
        listSchedules(courseId),
        listBlocks(courseId, now),
        listCourseExtras(courseId),
        listChanges(courseId),
        daySheet(courseId, shown),
    ]);
    return {
        course: { ...course, currency: course.currency.trim() },
        schedules, blocks, extras, changes,
        day: { date: shown, teeTimes },
    };
}
