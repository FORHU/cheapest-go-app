/**
 * Why a pay-first booking failed, kept on the failed `flight_bookings` row.
 *
 * `flight_bookings` has no failure-reason column. `cancellation_log` is an append-only jsonb
 * list of state transitions shaped `{at, oldStatus, newStatus, supplierResponse}`; a failure
 * is one more transition, with the reason in `supplierResponse`. A row with no such entry is a
 * legacy failure, whose copy says the payment was refunded.
 */
export const NOT_COMPLETED_ERROR_CODE = 'booking_not_completed';
export const NOT_COMPLETED_MESSAGE = 'We could not complete your booking. Your card was not charged.';

export function payFirstFailureEntry(reason: string, now: Date = new Date()) {
    return [{
        at: now.toISOString(),
        oldStatus: 'initiated',
        newStatus: 'failed',
        supplierResponse: { reason },
    }];
}

export function failureReasonOf(row: { cancellation_log?: unknown } | null | undefined): string | null {
    const log = row?.cancellation_log;
    if (!Array.isArray(log)) return null;
    for (const entry of log) {
        const reason = (entry as any)?.supplierResponse?.reason;
        if (typeof reason === 'string' && reason) return reason;
    }
    return null;
}

/** The JSON a route answers for a failed booking, by session. Pay-first failures say "not charged". */
export async function failedBookingResponse(db: any, sessionId: string) {
    const { data } = await db
        .from('flight_bookings')
        .select('cancellation_log')
        .eq('session_id', sessionId)
        .maybeSingle();
    const reason = failureReasonOf(data);
    if (reason) {
        return { success: false, errorCode: NOT_COMPLETED_ERROR_CODE, reason, error: NOT_COMPLETED_MESSAGE };
    }
    return {
        success: false,
        errorCode: 'booking_failed_refunded',
        error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
    };
}
