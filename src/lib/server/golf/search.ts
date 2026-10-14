import { getSqlAdmin } from '@/lib/db/postgres';
import type { GolfCourse } from '@/lib/schemas/golf';
import { MIN_LEAD_HOURS } from '@/lib/golf/rules';
import { localTime } from '@/lib/golf/time';
import { chargeCurrencyFor } from '@/lib/golf/currency';
import { isChargeCurrency, type ChargeCurrency } from '@/lib/constants/currencies';
import { CHIPS_PER_COURSE, nearestDates, type GolfSearchParams } from '@/lib/golf/search';
import { getPublishedCoursesByIds } from './courses';
import { quoteGolf } from './quote';

/**
 * Search over published courses (CONTEXT.md, "All-in price"). Every price here comes from
 * quoteGolf, the function checkout uses, so a result's price is what the card will be authorised
 * for. Matching is one query; it never touches a booking.
 */

const HOUR = 3_600_000;

export interface AllIn {
    /** For the whole party. */
    total: number;
    perPlayer: number;
    currency: string;
}

export interface SearchTeeTime extends AllIn {
    id: string;
    startsAt: string;
    /** "07:38" on the course's clock. */
    localTime: string;
    spotsLeft: number;
}

export interface CourseSearchResult {
    course: GolfCourse;
    /** False when a date was chosen and the course has nothing on it (see `nearest`). */
    matches: boolean;
    /** The cheapest tee time that matches, quoted all-in. */
    from: (AllIn & { teeTimeId: string; startsAt: string; localTime: string }) | null;
    /** The earliest matches on the chosen date; empty when no date was chosen. */
    teeTimes: SearchTeeTime[];
    /** Nearest earlier/later dates with a match, when the chosen date has none. */
    nearest: (AllIn & { date: string })[];
}

interface Row {
    id: string;
    courseId: string;
    startsAt: Date;
    spotsLeft: number;
    price: number;
    currency: string;
    timezone: string;
    localDate: string;
}

/**
 * One party's all-in price, in the currency the viewer will be charged in: their own choice when
 * they have one, otherwise the course's (or USD when customers are not charged in it).
 */
async function allIn(price: number, players: number, courseCurrency: string, viewer: ChargeCurrency | null): Promise<AllIn> {
    const course = courseCurrency.trim();
    const quote = await quoteGolf({
        greenFeeTotal: Math.round(price * players * 100) / 100,
        currency: course,
        chargeCurrency: chargeCurrencyFor(viewer, course),
    });
    return { total: quote.total, perPlayer: Math.round((quote.total / players) * 100) / 100, currency: quote.currency };
}

/**
 * Courses with at least one tee time matching `params` somewhere in their own booking window.
 * With a date, courses with tee times on it come first (earliest tee time first within a
 * course), then those that only have other days, each with its nearest dates.
 */
export async function searchCourses(
    params: GolfSearchParams & {
        courseId?: string;
        /** The viewer's currency (ADR-0051); anything that is not a Charge Currency is ignored. */
        currency?: string | null;
    },
    now = new Date(),
): Promise<CourseSearchResult[]> {
    const viewer = params.currency && isChargeCurrency(params.currency)
        ? (params.currency.toUpperCase() as ChargeCurrency)
        : null;
    const sql = getSqlAdmin();
    const earliest = new Date(now.getTime() + MIN_LEAD_HOURS * HOUR);

    // Course-local calendar date and time of day come from the course's own zone, in SQL, so a
    // tee time near midnight is matched on the day the golfer will play it.
    const rows = await sql<Row[]>`
        SELECT t.id, t.course_id AS "courseId", t.starts_at AS "startsAt", t.spots_left AS "spotsLeft",
               t.price_per_player::float8 AS price, t.currency, c.timezone,
               to_char(t.starts_at AT TIME ZONE c.timezone, 'YYYY-MM-DD') AS "localDate"
          FROM golf_tee_times t
          JOIN golf_courses c ON c.id = t.course_id
         WHERE c.status = 'published' AND c.timezone IS NOT NULL
           AND t.status = 'open' AND t.spots_left >= ${params.players}
           AND t.starts_at >= ${earliest}
           AND t.starts_at <= ${now}::timestamptz + make_interval(days => c.booking_window_days + 1)
           ${params.country ? sql`AND c.country = ${params.country}` : sql``}
           ${params.courseId ? sql`AND c.id = ${params.courseId}` : sql``}
           ${params.from ? sql`AND (t.starts_at AT TIME ZONE c.timezone)::time >= ${params.from}::time` : sql``}
           ${params.to ? sql`AND (t.starts_at AT TIME ZONE c.timezone)::time <= ${params.to}::time` : sql``}
         ORDER BY t.starts_at`;
    if (rows.length === 0) return [];

    const byCourse = new Map<string, Row[]>();
    for (const row of rows) byCourse.set(row.courseId, [...(byCourse.get(row.courseId) ?? []), row]);

    const courses = await getPublishedCoursesByIds([...byCourse.keys()]);
    const results: CourseSearchResult[] = [];

    for (const course of courses) {
        const all = byCourse.get(course.id) ?? [];
        const tz = course.timezone!;
        const onDate = params.date ? all.filter(r => r.localDate === params.date) : all;
        const pool = onDate.length > 0 ? onDate : null;

        if (pool) {
            const cheapest = pool.reduce((a, b) => (b.price < a.price ? b : a));
            const chips = params.date ? pool.slice(0, CHIPS_PER_COURSE) : [];
            results.push({
                course,
                matches: true,
                from: {
                    teeTimeId: cheapest.id,
                    startsAt: cheapest.startsAt.toISOString(),
                    localTime: localTime(cheapest.startsAt, tz),
                    ...(await allIn(cheapest.price, params.players, cheapest.currency, viewer)),
                },
                teeTimes: await Promise.all(chips.map(async r => ({
                    id: r.id,
                    startsAt: r.startsAt.toISOString(),
                    localTime: localTime(r.startsAt, tz),
                    spotsLeft: r.spotsLeft,
                    ...(await allIn(r.price, params.players, r.currency, viewer)),
                }))),
                nearest: [],
            });
            continue;
        }

        // A date was chosen and this course has nothing on it: offer the nearest days that do.
        const dates = nearestDates(params.date!, all.map(r => r.localDate));
        const nearest = await Promise.all(dates.map(async date => {
            const day = all.filter(r => r.localDate === date);
            const cheapest = day.reduce((a, b) => (b.price < a.price ? b : a));
            return { date, ...(await allIn(cheapest.price, params.players, cheapest.currency, viewer)) };
        }));
        results.push({ course, matches: false, from: null, teeTimes: [], nearest });
    }

    // Matches first, in the name order the course query returned; stable otherwise.
    return [...results.filter(r => r.matches), ...results.filter(r => !r.matches)];
}
