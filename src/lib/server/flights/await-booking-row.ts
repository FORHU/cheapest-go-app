/**
 * Wait for the flight_booking row another path is in the middle of writing.
 *
 * `/api/internal/create-booking` locks its session with a conditional UPDATE.
 * Whoever loses that race is answered with `{ success: false, alreadyBooked: true }`
 * — which reads like a failure but means "someone else is doing it right now".
 *
 * Two callers race by design: the Stripe webhook, and the `/confirm` fallback
 * the client fires 3s after payment. Treating the loser's answer as a real
 * failure produced two mirror-image bugs:
 *
 *   - the webhook refunded a card whose ticket was being issued as it read;
 *   - `/confirm` told a traveller their card was not charged while it was.
 *
 * Both are fixed by waiting out the winner's insert before deciding. The window
 * is a handful of database round trips, so a short bounded poll closes it.
 */

export interface AwaitedBooking {
    id: string;
    pnr: string | null;
    status: string | null;
    payment_intent_id?: string | null;
}

export interface AwaitBookingOptions {
    /** Total polls, including the first. */
    attempts?: number;
    /** Delay between polls. */
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Poll `flight_bookings` for this session until a row appears or attempts run out.
 *
 * Returns null when nothing was written — only then is the failure real.
 */
export async function awaitBookingRow(
    db: any,
    sessionId: string,
    opts: AwaitBookingOptions = {},
): Promise<AwaitedBooking | null> {
    const attempts = opts.attempts ?? 6;
    const delayMs = opts.delayMs ?? 750;
    const sleep = opts.sleep ?? defaultSleep;

    for (let i = 0; i < attempts; i++) {
        try {
            const { data } = await db
                .from('flight_bookings')
                .select('id, pnr, status, payment_intent_id')
                .eq('session_id', sessionId)
                .maybeSingle();

            // A row with a PNR is done. A row still without one is a failure the
            // other path recorded deliberately (markFailed) — return it either
            // way and let the caller read `status`.
            if (data?.id) return data as AwaitedBooking;
        } catch (err: any) {
            console.warn(`[await-booking-row] lookup failed (attempt ${i + 1}):`, err?.message ?? err);
        }

        if (i < attempts - 1) await sleep(delayMs);
    }

    return null;
}
