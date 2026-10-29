import { env } from '@/utils/env';
import { cancelFlightBooking } from '@/lib/server/flights/cancel-flight-booking';
import { classifyOrderForCancellation } from '@/lib/server/flights/duffel-order-cancellation';
import { DUFFEL_RECONCILABLE_STATUSES } from '@/lib/flights/duffel-reconcilable-statuses';

/**
 * Looking at Duffel's order for a booking, to learn that it was cancelled there.
 *
 * Duffel tells us about a dashboard or airline cancellation by webhook, which needs a public URL
 * registered in its dashboard and a secret. Where that is not in place (a developer's machine, a
 * deployment not yet configured, a delivery that never arrived) the booking would stay "ticketed"
 * for a flight that no longer exists. This is the pull side of the same event: the traveller opening
 * My Trips is a good moment to look.
 *
 * It ends where the webhook and the Cancel button end, in cancelFlightBooking, so the card is
 * refunded the same proportional amount and the booking records the supplier as who cancelled. The
 * only decision made here is whether to start that: and only a cancellation Duffel has CONFIRMED
 * counts, because starting it moves a customer's money.
 */

// The statuses a cancellation seen at Duffel may be reconciled from live in a client-safe file: the
// Trips card reads the same list. Re-exported so the server callers keep one import.
export { DUFFEL_RECONCILABLE_STATUSES };

export type SyncOutcome =
    | {
        changed: true;
        status: string;
        cancelledBy: 'supplier';
        refundAmount?: number;
        refundCurrency?: string;
    }
    | {
        changed: false;
        reason: 'not_duffel' | 'not_live' | 'live_at_duffel' | 'unreachable' | 'reconcile_failed';
        status?: string;
        error?: string;
    };

export interface SyncDuffelCancellationInput {
    supabase: any;
    /** The booking row, loaded with CANCEL_BOOKING_COLUMNS. Ownership is the caller's job. */
    booking: any;
    bookingId: string;
}

export async function syncDuffelCancellation(input: SyncDuffelCancellationInput): Promise<SyncOutcome> {
    const { booking } = input;

    if (booking.provider !== 'duffel' || !booking.duffel_order_id) {
        return { changed: false, reason: 'not_duffel' };
    }
    if (!DUFFEL_RECONCILABLE_STATUSES.includes(booking.status)) {
        return { changed: false, reason: 'not_live', status: booking.status };
    }

    const token = env.DUFFEL_TOKEN;
    if (!token) return { changed: false, reason: 'unreachable' };

    // Anything short of a clear answer is "unreachable". In particular a 404: cancelFlightBooking
    // reads "supplier record not found" as the order being gone and refunds in full, which is right
    // when a traveller asks to cancel and is not something to do because a page was opened.
    let order: any;
    try {
        const res = await fetch(`https://api.duffel.com/air/orders/${encodeURIComponent(booking.duffel_order_id)}`, {
            headers: { Authorization: `Bearer ${token}`, 'Duffel-Version': 'v2' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { changed: false, reason: 'unreachable' };
        order = (await res.json())?.data;
    } catch {
        return { changed: false, reason: 'unreachable' };
    }
    if (!order?.id) return { changed: false, reason: 'unreachable' };

    if (classifyOrderForCancellation(order).kind !== 'already_cancelled') {
        return { changed: false, reason: 'live_at_duffel', status: booking.status };
    }

    console.warn(`[sync-duffel] Booking ${booking.id} (${booking.pnr}) is cancelled at Duffel — reconciling`);
    const response = await cancelFlightBooking({
        supabase: input.supabase,
        booking,
        bookingId: input.bookingId,
        trigger: 'duffel_sync',
        eligibleStatuses: DUFFEL_RECONCILABLE_STATUSES,
    });

    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) {
        console.error(`[sync-duffel] Reconciling ${booking.id} failed:`, body?.error ?? response.status);
        return { changed: false, reason: 'reconcile_failed', error: body?.error ?? `HTTP ${response.status}` };
    }

    return {
        changed: true,
        status: body.status,
        cancelledBy: 'supplier',
        refundAmount: typeof body.refundAmount === 'number' ? body.refundAmount : undefined,
        refundCurrency: typeof body.refundCurrency === 'string' ? body.refundCurrency : undefined,
    };
}
