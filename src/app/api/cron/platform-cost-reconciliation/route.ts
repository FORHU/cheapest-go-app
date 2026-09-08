/**
 * Monthly check that the markup actually covered Platform Cost.
 *
 * The markup is priced from estimates and, until the fee recording shipped, was
 * never compared to anything. A 4% flight markup sat below a 4.017% break-even
 * for months; what surfaced it was a Duffel invoice screenshot arriving by
 * chance, not any part of this system. This job is the part of the system.
 *
 * Runs after Duffel invoices (issued by the 3rd), so the number it reports can be
 * checked against the real bill rather than standing alone. It notifies only when
 * something needs a decision — an under-recovering month, or a Stripe rate that
 * has drifted from what pricing.ts charges against — because a job that reports
 * every month is a job nobody reads.
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createNotification } from '@/lib/server/admin/notify';
import { reconcilePlatformCost } from '@/lib/server/admin/platform-cost';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // `month=YYYY-MM` re-runs a past period; the default is last month, since
    // Duffel bills in arrears and the current month is always partial.
    const month = req.nextUrl.searchParams.get('month') ?? undefined;
    const result = await reconcilePlatformCost(month);

    console.log(
        `[platform-cost] ${result.month}: orders=${result.orders} cancelled=${result.cancelled} ` +
        `c=${result.cancellationRate === null ? 'n/a' : (result.cancellationRate * 100).toFixed(1) + '%'} ` +
        `markup=$${result.markupRetainedUsd} stripe=$${result.stripeFeeRecordedUsd} (est $${result.stripeFeeEstimatedUsd}) ` +
        `duffel≈$${result.duffelExpectedUsd} net=$${result.netUsd}`,
    );
    for (const c of result.caveats) console.log(`[platform-cost] caveat: ${c}`);

    // Under-recovery is the condition the whole pricing model exists to avoid, so
    // it is worth waking someone for. A month with no orders is not under-recovery.
    if (result.orders > 0 && result.netUsd < 0) {
        createNotification(
            'Platform Cost not recovered',
            `${result.month}: markup retained $${result.markupRetainedUsd} against $${result.stripeFeeRecordedUsd || result.stripeFeeEstimatedUsd} Stripe ` +
            `and ~$${result.duffelExpectedUsd} Duffel — short by $${Math.abs(result.netUsd).toFixed(2)}. ` +
            `${result.orders} order(s), ${result.cancelled} cancelled. Check against the Duffel invoice before retuning rates.`,
            'system',
        );
    }

    // A drifted Stripe rate is the failure that hid the original problem: the model
    // charges against a number that stopped being true and nothing says so.
    if (
        result.stripeRateObserved !== null &&
        Math.abs(result.stripeRateObserved - result.stripeRateConfigured) > 0.005
    ) {
        createNotification(
            'Stripe rate has drifted from STRIPE_RATE',
            `${result.month}: charges settled at ${(result.stripeRateObserved * 100).toFixed(2)}% ` +
            `while pricing.ts assumes ${(result.stripeRateConfigured * 100).toFixed(2)}%. ` +
            `Every markup figure is derived from the configured rate, so this understates cost on every booking.`,
            'system',
        );
    }

    return NextResponse.json({ success: true, ...result });
}
