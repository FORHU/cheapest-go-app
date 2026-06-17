import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/warm-hotel-cache
 * Schedule: 0 1 * * *  (1am daily)
 *
 * Demand-driven hotel search cache pre-warmer.
 * Reads the top 20 most-searched cities from hotel_search_stats and
 * pre-warms the cache for the next 2 Friday check-ins with an 8-hour TTL.
 * Cities are discovered automatically from real user searches — no hardcoded list.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/fn/warm-hotel-cache`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET}`,
            },
            body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        console.log('[cron/warm-hotel-cache] Result:', JSON.stringify(data));
        return NextResponse.json({ ok: true, ...data });
    } catch (err: any) {
        console.error('[cron/warm-hotel-cache] Error:', err.message);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
