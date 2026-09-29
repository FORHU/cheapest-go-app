/**
 * GET /api/cron/resume-support-translations
 *
 * Finishes Support Chat translations that a stopped process left pending.
 *
 * A customer's widget holds an Agent's reply until its translation has settled — translated,
 * or marked untranslated in the Agent's own words. A deploy that restarts the app mid-
 * translation leaves that row pending with nothing coming to settle it, and the reply would
 * never reach the customer. This settles them. Every minute, because a customer is waiting.
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { resumeStalledTranslations } from '@/lib/server/support/messages';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const t0 = Date.now();
    const resumed = await resumeStalledTranslations();
    const elapsedMs = Date.now() - t0;

    // Quiet when there is nothing to do, which is almost every minute.
    if (resumed > 0) {
        console.log(`[resume-support-translations] settled ${resumed} stalled translation(s) in ${elapsedMs}ms`);
    }

    return NextResponse.json({ ok: true, resumed, elapsedMs });
}
