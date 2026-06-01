/**
 * Cron: /api/cron/poll-pending-tickets
 * Schedule: every 5 minutes  (*/5 * * * *)
 *
 * Replaces the pg_cron job that invoked the Supabase Edge Function.
 * Now delegates to the internal /api/fn/poll-pending-tickets route which
 * proxies to the Deno function during migration, or will be rewritten in Node.
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes max for long-running poll

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/fn/poll-pending-tickets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({}),
        });

        const data = await res.json().catch(() => ({}));
        return NextResponse.json({ ok: true, ...data });
    } catch (err: any) {
        console.error('[cron/poll-pending-tickets]', err.message);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
