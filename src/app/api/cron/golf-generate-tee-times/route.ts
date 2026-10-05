/**
 * Cron: /api/cron/golf-generate-tee-times
 * Schedule: daily
 *
 * Extends every tee-time schedule's tee times to the 60-day horizon. Idempotent: existing tee
 * times, and the spots sold on them, are left alone. CONTEXT.md, "Tee Time".
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTeeTimes } from '@/lib/server/golf/teeTimes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const created = await generateTeeTimes();
    return NextResponse.json({ success: true, created });
}
