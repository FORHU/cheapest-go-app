import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

const MAX_RETRIES_PER_RUN = 10;
const MISMATCH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AGE_HOURS = 24; // Don't retry sessions older than 24h

/**
 * POST /api/internal/auto-recover
 *
 * Cron endpoint that auto-recovers payment-booking mismatches.
 * Detects sessions where payment succeeded but booking was never created,
 * then automatically retries the booking via the create-booking Edge Function.
 *
 * Auth: Bearer token must match CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY.
 */
export async function POST(req: Request) {
    try {
        // ── Auth check ──────────────────────────────────────────────
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // ── Detect mismatches ───────────────────────────────────────
        const cutoffRecent = new Date(Date.now() - MISMATCH_THRESHOLD_MS).toISOString();
        const cutoffOld = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

        // Sessions with payment_intent_id set, not booked/expired, older than 5 min
        const { data: stuckSessions, error: fetchErr } = await supabase
            .from('booking_sessions')
            .select('id, provider, payment_intent_id, status, created_at, contact')
            .not('payment_intent_id', 'is', null)
            .not('status', 'in', '("booked","expired")')
            .lt('created_at', cutoffRecent)
            .gte('created_at', cutoffOld)
            .order('created_at', { ascending: true })
            .limit(MAX_RETRIES_PER_RUN);

        if (fetchErr) {
            console.error('[auto-recover] Fetch error:', fetchErr);
            return NextResponse.json({ error: 'Failed to query booking_sessions' }, { status: 500 });
        }

        if (!stuckSessions || stuckSessions.length === 0) {
            return NextResponse.json({ success: true, recovered: 0, message: 'No mismatches found' });
        }

        // Filter out sessions that already have a booking in flight_bookings
        const sessionIds = stuckSessions.map(s => s.id);
        const { data: existingBookings } = await supabase
            .from('flight_bookings')
            .select('session_id')
            .in('session_id', sessionIds);

        const bookedSessionIds = new Set((existingBookings || []).map(b => b.session_id));
        const mismatches = stuckSessions.filter(s => !bookedSessionIds.has(s.id));

        if (mismatches.length === 0) {
            return NextResponse.json({ success: true, recovered: 0, message: 'All sessions already have bookings' });
        }

        console.log(`[auto-recover] Found ${mismatches.length} mismatches to auto-recover`);

        let recovered = 0;
        let failed = 0;

        for (const session of mismatches) {
            try {
                const res = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({ sessionId: session.id }),
                });

                const data = await res.json();

                if (data.success) {
                    recovered++;
                    console.log(JSON.stringify({
                        _event: 'admin_audit',
                        action: 'auto_recover_booking',
                        sessionId: session.id,
                        provider: session.provider,
                        result: 'success',
                        pnr: data.pnr,
                        bookingId: data.bookingId,
                        triggeredBy: 'cron',
                        timestamp: new Date().toISOString(),
                    }));
                } else {
                    failed++;
                    console.error(JSON.stringify({
                        _event: 'admin_audit',
                        action: 'auto_recover_booking',
                        sessionId: session.id,
                        provider: session.provider,
                        result: 'failed',
                        error: data.error,
                        triggeredBy: 'cron',
                        timestamp: new Date().toISOString(),
                    }));
                }
            } catch (err) {
                failed++;
                console.error(`[auto-recover] Error recovering session ${session.id}:`, err);
            }
        }

        // Fire a notification if any recoveries happened
        if (recovered > 0 || failed > 0) {
            await supabase.from('notifications').insert({
                title: 'Auto-Recovery Complete',
                description: `Recovered: ${recovered}, Failed: ${failed} (of ${mismatches.length} mismatches)`,
                type: 'system',
                read: false,
            });
        }

        return NextResponse.json({
            success: true,
            recovered,
            failed,
            total: mismatches.length,
        });
    } catch (err: any) {
        console.error('[auto-recover] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
