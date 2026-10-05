/**
 * Cron: /api/cron/golf-sweep
 * Schedule: every 5 minutes
 *
 * Ends unpaid tee-time holds (or turns them into requests when the payment went through after
 * all), and declines requests the team did not decide by their deadline. CONTEXT.md, "Golf Booking".
 */

import { NextRequest, NextResponse } from 'next/server';
import { sweepGolfBookings } from '@/lib/server/golf/bookings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await sweepGolfBookings();
    return NextResponse.json({ success: true, ...result });
}
