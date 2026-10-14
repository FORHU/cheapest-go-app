import { getSqlAdmin } from '@/lib/db/postgres';
import type { TripGolfBooking, TripGolfStatus } from '@/lib/trips/golfBookings';

/**
 * A customer's golf bookings for their bookings page, newest first. Ownership is decided here, by
 * the user id in the query, never by the page (ADR-0027).
 *
 * An unpaid hold ('held') is a checkout in progress and an 'expired' one is an abandoned
 * checkout; neither is a booking, so neither is listed. The amount is what the customer was
 * charged, in the currency they were charged in (ADR-0051), not the course's own figure.
 */

interface Row {
    id: string;
    reference: string;
    status: TripGolfStatus;
    courseName: string;
    courseSlug: string;
    city: string;
    startsAt: Date;
    timezone: string | null;
    players: number;
    total: number;
    currency: string;
    createdAt: Date;
}

export async function listGolfBookingsForUser(userId: string): Promise<TripGolfBooking[]> {
    const sql = getSqlAdmin();
    const rows = await sql<Row[]>`
        SELECT b.id, b.reference, b.status, c.name AS "courseName", c.slug AS "courseSlug", c.city,
               t.starts_at AS "startsAt", c.timezone, b.players,
               b.charged_total::float8 AS total, b.charge_currency AS currency, b.created_at AS "createdAt"
          FROM golf_bookings b
          JOIN golf_courses c ON c.id = b.course_id
          JOIN golf_tee_times t ON t.id = b.tee_time_id
         WHERE b.user_id = ${userId}
           AND b.status IN ('requested', 'confirmed', 'declined', 'cancelled')
         ORDER BY b.created_at DESC`;

    return rows.map(r => ({
        kind: 'golf' as const,
        id: r.id,
        reference: r.reference,
        status: r.status,
        courseName: r.courseName,
        courseSlug: r.courseSlug,
        city: r.city,
        startsAt: r.startsAt.toISOString(),
        timezone: r.timezone,
        players: r.players,
        total: r.total,
        currency: r.currency.trim(),
        created_at: r.createdAt.toISOString(),
    }));
}
