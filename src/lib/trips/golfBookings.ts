/**
 * Golf bookings as the bookings page lists them (CONTEXT.md, "Golf Booking"). Client-safe: the
 * type the card renders and the rule that sorts bookings into the page's tabs. The query lives in
 * lib/server/golf/tripBookings.
 */

/** Only the states that are bookings: an unpaid hold or an expired one never reaches the page. */
export type TripGolfStatus = 'requested' | 'confirmed' | 'declined' | 'cancelled';

export interface TripGolfBooking {
    /** Tells a golf booking from a hotel or flight one in a mixed list. */
    kind: 'golf';
    id: string;
    reference: string;
    status: TripGolfStatus;
    courseName: string;
    courseSlug: string;
    /** ISO instant of the tee time. */
    startsAt: string;
    /** The course's clock, which the tee time is read on. */
    timezone: string | null;
    players: number;
    /** What the customer was charged, in `currency` (ADR-0051). */
    total: number;
    currency: string;
    /** When it was booked; the page sorts its mixed list by this, as it does for hotels and flights. */
    created_at: string;
}

export interface GroupedGolfBookings {
    golfBookings: TripGolfBooking[];
    upcomingGolfBookings: TripGolfBooking[];
    pastGolfBookings: TripGolfBooking[];
    cancelledGolfBookings: TripGolfBooking[];
}

/**
 * Upcoming is a request or confirmation whose tee time is still ahead; past is a confirmed tee
 * time that has been played; declined and cancelled go under cancelled, which the page shows with
 * past, as it does for hotels.
 */
export function groupGolfBookings(bookings: TripGolfBooking[], now: Date): GroupedGolfBookings {
    const ahead = (b: TripGolfBooking) => new Date(b.startsAt).getTime() >= now.getTime();
    const cancelled = (b: TripGolfBooking) => b.status === 'declined' || b.status === 'cancelled';
    return {
        golfBookings: bookings,
        upcomingGolfBookings: bookings.filter(b => !cancelled(b) && ahead(b)),
        pastGolfBookings: bookings.filter(b => b.status === 'confirmed' && !ahead(b)),
        cancelledGolfBookings: bookings.filter(cancelled),
    };
}
