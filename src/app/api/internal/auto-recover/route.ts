import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { stripe } from '@/lib/stripe/server';
import { shouldRecoverSession } from '@/lib/server/flights/auto-recover-filter';
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
 * Auth: Bearer token must match CRON_SECRET or FUNCTIONS_SECRET.
 */
export async function POST(req: Request) {
    try {
        // ── Auth check ──────────────────────────────────────────────
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET || process.env.FUNCTIONS_SECRET;
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createAdminClient();

        // ── Detect mismatches ───────────────────────────────────────
        const cutoffRecent = new Date(Date.now() - MISMATCH_THRESHOLD_MS).toISOString();
        const cutoffOld = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

        // Sessions with payment_intent_id set, not booked/expired, older than 5 min
        const { data: stuckSessions, error: fetchErr } = await supabase
            .from('booking_sessions')
            .select('id, provider, payment_intent_id, status, created_at, contact')
            .not('payment_intent_id', 'is', null)
            // Array, not a "(a,b)" string — the builder maps over this to build
            // placeholders, and a string throws inside it, leaving the query with
            // { data: null, error } and this recovery sweep finding nothing at all.
            .not('status', 'in', ['booked', 'expired'])
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
        const sessionIds = stuckSessions.map((s: any) => s.id);
        const { data: existingBookings } = await supabase
            .from('flight_bookings')
            .select('session_id')
            .in('session_id', sessionIds);

        const bookedSessionIds = new Set((existingBookings || []).map((b: any) => b.session_id));
        const mismatches = stuckSessions.filter((s: any) => !bookedSessionIds.has(s.id));

        if (mismatches.length === 0) {
            return NextResponse.json({ success: true, recovered: 0, message: 'All sessions already have bookings' });
        }

        console.log(`[auto-recover] Found ${mismatches.length} mismatches to auto-recover`);

        let recovered = 0;
        let failed = 0;

        for (const session of mismatches) {
            try {
                // For Duffel: the order was pre-created before payment. Only recover
                // if the Stripe PI actually succeeded — a non-succeeded PI means the
                // user abandoned checkout and there is no payment to match the order.
                if (session.payment_intent_id) {
                    const pi = await stripe.paymentIntents.retrieve(session.payment_intent_id);
                    if (!shouldRecoverSession(session, pi.status)) {
                        // PI didn't succeed — user abandoned checkout. Expire the session
                        // so it never appears in the cron again.
                        console.log(`[auto-recover] Expiring abandoned session ${session.id} (provider=${session.provider}, pi.status=${pi.status})`);
                        await supabase.from('booking_sessions').update({ status: 'expired' }).eq('id', session.id);
                        continue;
                    }
                }

                const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
                const res = await fetch(`${siteUrl}/api/internal/create-booking`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
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
                    // Expire sessions that consistently fail recovery so they stop
                    // generating noise on every cron tick. A permanently-failing session
                    // means the offer expired or the provider rejected it — retrying
                    // forever won't help.
                    await supabase.from('booking_sessions').update({ status: 'expired' }).eq('id', session.id);
                }
            } catch (err) {
                failed++;
                console.error(`[auto-recover] Error recovering session ${session.id}:`, err);
            }
        }

        // Only notify if something actually happened (skip pure-abandoned runs)
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
