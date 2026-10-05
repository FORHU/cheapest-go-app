import type { GolfBookingStatus } from '@/lib/schemas/golf';

/**
 * The timing rules of a Golf Booking (CONTEXT.md, "Golf Booking"). Client-safe and pure, so the
 * checkout, the status page and the server all read the same numbers.
 */

/** An unpaid hold keeps its spots this long. */
export const HOLD_MINUTES = 15;
/** The team needs time to check with the course, so tee times sooner than this are not sold. */
export const MIN_LEAD_HOURS = 24;
/** Tee times are generated, and sold, this many course-local days ahead. */
export const HORIZON_DAYS = 60;
/** A request is confirmed or declined within this long … */
export const DECIDE_WITHIN_HOURS = 48;
/** … and never later than this long before the tee time. */
export const DECIDE_BEFORE_START_HOURS = 2;

const HOUR = 3_600_000;

export function holdExpiresAt(now: Date): Date {
    return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

/** When the team must have confirmed or declined a request; card authorisations last about 7 days. */
export function decideBy(requestedAt: Date, startsAt: Date): Date {
    return new Date(Math.min(
        requestedAt.getTime() + DECIDE_WITHIN_HOURS * HOUR,
        startsAt.getTime() - DECIDE_BEFORE_START_HOURS * HOUR,
    ));
}

export function freeCancelUntil(startsAt: Date, freeCancelHours: number): Date {
    return new Date(startsAt.getTime() - freeCancelHours * HOUR);
}

/** Far enough ahead for the team to check, and inside the horizon (plus a day for zone edges). */
export function isBookableStart(startsAt: Date, now: Date): boolean {
    const lead = startsAt.getTime() - now.getTime();
    return lead >= MIN_LEAD_HOURS * HOUR && lead <= (HORIZON_DAYS + 1) * 24 * HOUR;
}

export type CustomerCancellation =
    | { allowed: false; reason: 'not_cancellable' | 'free_cancellation_ended' }
    | { allowed: true; refund: number; charged: boolean };

/**
 * What a customer's cancellation does at `now`. A request was never charged, so cancelling it
 * releases the authorisation. A confirmed booking is refunded in full, fee included (ADR-0036),
 * until the cutoff recorded on it; after that it is not cancellable online (ADR-0023: refusing
 * is the safe direction) and the customer is pointed to support.
 */
export function cancellationFor(
    booking: { status: GolfBookingStatus; total: number; freeCancelUntil: Date },
    now: Date,
): CustomerCancellation {
    if (booking.status === 'requested') return { allowed: true, refund: 0, charged: false };
    if (booking.status !== 'confirmed') return { allowed: false, reason: 'not_cancellable' };
    if (now.getTime() >= booking.freeCancelUntil.getTime()) return { allowed: false, reason: 'free_cancellation_ended' };
    return { allowed: true, refund: booking.total, charged: true };
}
