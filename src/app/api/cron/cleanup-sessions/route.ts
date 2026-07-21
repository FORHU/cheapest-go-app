/**
 * Cron: /api/cron/cleanup-sessions
 * Schedule: daily at 4am  (0 4 * * *)
 *
 * Deletes expired Lucia sessions and password reset tokens.
 * Replaces the Supabase Auth automatic session cleanup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const sql = getSqlAdmin();

        const sessionResult = await sql`
            DELETE FROM sessions WHERE expires_at < NOW()
        `;
        const sessionsDeleted = (sessionResult as any).count ?? 0;

        const tokenResult = await sql`
            DELETE FROM password_reset_tokens WHERE expires_at < NOW()
        `;
        const tokensDeleted = (tokenResult as any).count ?? 0;

        console.log(`[cron/cleanup-sessions] Deleted ${sessionsDeleted} sessions, ${tokensDeleted} reset tokens`);
        return NextResponse.json({ ok: true, sessionsDeleted, tokensDeleted });
    } catch (err: any) {
        console.error('[cron/cleanup-sessions]', err.message);
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
