/**
 * GET /api/cron/hotel-reconciliation
 * Schedule: hourly  (0 * * * *)
 *
 * Finds hotel charges that succeeded in Stripe with no Booking row behind them —
 * **Unrecorded Reservations** — and raises one notification per reference, ever.
 *
 * It deliberately does not repair anything. A reconciler that writes based on payment
 * evidence eventually acts on a stale read, and the action at the end of that path is a
 * refund; ADR-0023 already settled that refusing is the safe direction here. Repair is an
 * admin action, from the divergence list this job's data also feeds.
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createNotification } from '@/lib/server/admin/notify';
import {
    findUnrecordedReservations,
    filterAlreadyNotified,
    UNRECORDED_NOTIFICATION_TITLE,
} from '@/lib/server/admin/reconciliation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await findUnrecordedReservations(WINDOW_DAYS);

    // A refusal is not a failure to report quietly — it means the job cannot tell whether
    // anything is wrong, which is worse than finding nothing.
    if (!result.ok) {
        console.error('[hotel-reconciliation] REFUSED:', result.refusedReason);
        return NextResponse.json({ success: false, refused: result.refusedReason }, { status: 409 });
    }

    const fresh = await filterAlreadyNotified(result.unrecorded);

    for (const item of fresh) {
        const amount = (item.amount / 100).toFixed(2);
        createNotification(
            UNRECORDED_NOTIFICATION_TITLE,
            `${item.bookingReference} — ${item.currency.toUpperCase()} ${amount} charged ${item.created.slice(0, 10)} ` +
            `to ${item.holderEmail ?? 'unknown'} (${item.brand ?? 'brand unknown'}) has no booking row. ` +
            `PaymentIntent: ${item.paymentIntentId}. ${item.refunded ? 'Charge was refunded. ' : ''}` +
            `The guest may be holding a reservation the platform cannot see — check the supplier dashboard before acting.`,
            'booking'
        );
        console.warn(`[hotel-reconciliation] unrecorded reservation: ${item.bookingReference} (${item.paymentIntentId})`);
    }

    return NextResponse.json({
        success: true,
        windowDays: result.windowDays,
        scanned: result.scanned,
        unrecorded: result.unrecorded.length,
        newlyNotified: fresh.length,
        references: result.unrecorded.map((u) => u.bookingReference),
    });
}
