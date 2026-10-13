import type { FinaliseOutcome, PriceChange, SessionFailure } from './authorised-outcome';

/**
 * The body a "this booking failed" answer carries.
 *
 * A session with a recorded failure is told what happened, in codes whose copy already says the
 * card was not charged. A session without one failed the legacy way (the order was bought, the
 * card then refused or the booking could not be completed, and the payment was refunded), so it
 * keeps the legacy answer.
 */
export function failedBookingBody(failure: SessionFailure | null | undefined): {
    errorCode: string;
    error?: string;
    priceChange?: PriceChange;
} {
    if (!failure?.errorCode) {
        return {
            errorCode: 'booking_failed_refunded',
            error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
        };
    }
    return { errorCode: failure.errorCode, ...(failure.priceChange ? { priceChange: failure.priceChange } : {}) };
}

/**
 * What /confirm answers for a finalise outcome, or null when the booking exists and the caller
 * should carry on (ticketing, email).
 */
export function finaliseOutcomeResponse(outcome: FinaliseOutcome): { status: number; body: Record<string, unknown> } | null {
    switch (outcome.kind) {
        case 'booked':
            return null;
        case 'refused':
            return {
                status: 409,
                body: { success: false, errorCode: outcome.errorCode, ...(outcome.priceChange ? { priceChange: outcome.priceChange } : {}) },
            };
        case 'in_progress':
            return {
                status: 202,
                body: {
                    success: false,
                    errorCode: 'booking_pending',
                    error: 'Your payment is authorised and the booking is still completing. Check your trips page in a few minutes — do not pay again.',
                },
            };
        case 'not_authorised':
            return {
                status: 402,
                body: { success: false, error: `Payment not authorised (${outcome.reason}).` },
            };
    }
}
