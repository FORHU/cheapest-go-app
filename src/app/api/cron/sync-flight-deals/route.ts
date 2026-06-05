/**
 * Cron: /api/cron/sync-flight-deals
 * Schedule: 0 */6 * * *  (every 6 hours)
 *
 * Thin trigger — authenticates the Vercel Cron call, then delegates all work
 * to /api/fn/sync-flight-deals (which holds the actual logic and can be called
 * manually for testing without hitting the cron auth layer).
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/fn/sync-flight-deals`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET}`,
            },
            body: JSON.stringify({}),
        });

        const data = await res.json().catch(() => ({}));
        console.log('[cron/sync-flight-deals] Result:', JSON.stringify(data));
        return NextResponse.json({ ok: true, ...data });

    } catch (err: any) {
        console.error('[cron/sync-flight-deals] Error:', err.message);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
