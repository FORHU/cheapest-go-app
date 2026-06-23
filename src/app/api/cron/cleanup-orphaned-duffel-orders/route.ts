/**
 * GET /api/cron/cleanup-orphaned-duffel-orders
 * Schedule: every 10 minutes  (*\/10 * * * *)
 *
 * Cancels Duffel orders for booking_sessions where the user reached the
 * payment screen but never paid (abandoned checkout). Without this, each
 * abandoned booking drains the Duffel balance for ~30 minutes until the
 * Stripe PI expires naturally.
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { isOrphanedSession, filterOrphanedSessions, type OrphanCandidate } from '@/lib/server/flights/orphan-cleanup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_LIMIT = 20;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const duffelToken = env.DUFFEL_TOKEN;
    if (!duffelToken) {
        return NextResponse.json({ error: 'DUFFEL_TOKEN not configured' }, { status: 500 });
    }

    const db = createAdminClient();
    const now = new Date();

    // Sessions older than 35 min, in a pending-payment status, with a Duffel pre-order
    const cutoff = new Date(now.getTime() - 35 * 60 * 1000).toISOString();
    const { data: candidates, error: fetchErr } = await db
        .from('booking_sessions')
        .select('id, provider, payment_intent_id, duffel_pre_order_id, status, created_at')
        .eq('provider', 'duffel')
        .not('duffel_pre_order_id', 'is', null)
        .not('payment_intent_id', 'is', null)
        .in('status', ['payment_initiated', 'initiated'])
        .lt('created_at', cutoff)
        .limit(BATCH_LIMIT);

    if (fetchErr) {
        console.error('[cleanup-orphaned-duffel-orders] DB query failed:', fetchErr.message);
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!candidates || candidates.length === 0) {
        return NextResponse.json({ ok: true, cancelled: 0, message: 'No orphaned sessions found' });
    }

    // Exclude sessions that already have a flight_bookings row
    const sessionIds = candidates.map((s: any) => s.id);
    const { data: existingBookings } = await db
        .from('flight_bookings')
        .select('session_id')
        .in('session_id', sessionIds);

    const bookedIds = new Set((existingBookings ?? []).map((b: any) => b.session_id));
    const unbooked = filterOrphanedSessions(candidates as OrphanCandidate[], bookedIds);

    let cancelled = 0;
    let skipped = 0;
    const errors: string[] = [];

    const DUFFEL_HEADERS = {
        'Authorization': `Bearer ${duffelToken}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
    };

    for (const session of unbooked) {
        // Verify the PI was not paid — if it somehow succeeded, skip (webhook will handle it)
        let piStatus = 'unknown';
        try {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent_id!);
            piStatus = pi.status;
        } catch (err: any) {
            console.warn(`[cleanup-orphaned-duffel-orders] Could not retrieve PI ${session.payment_intent_id}:`, err.message);
        }

        if (!isOrphanedSession(session, piStatus, now)) {
            skipped++;
            continue;
        }

        // Two-step Duffel cancellation: create quote → confirm
        try {
            const quoteRes = await fetch('https://api.duffel.com/air/order_cancellations', {
                method: 'POST',
                headers: DUFFEL_HEADERS,
                body: JSON.stringify({ data: { order_id: session.duffel_pre_order_id } }),
                signal: AbortSignal.timeout(8000),
            });

            if (!quoteRes.ok) {
                const body = await quoteRes.text().catch(() => '');
                throw new Error(`Duffel quote failed (${quoteRes.status}): ${body}`);
            }

            const quoteData = await quoteRes.json();
            const cancellationId: string = quoteData?.data?.id;
            if (!cancellationId) throw new Error('No cancellationId in Duffel response');

            const confirmRes = await fetch(
                `https://api.duffel.com/air/order_cancellations/${cancellationId}/actions/confirm`,
                { method: 'POST', headers: DUFFEL_HEADERS, signal: AbortSignal.timeout(8000) },
            );

            if (!confirmRes.ok) {
                const body = await confirmRes.text().catch(() => '');
                throw new Error(`Duffel confirm failed (${confirmRes.status}): ${body}`);
            }

            // Mark the session expired so auto-recover also skips it
            await db
                .from('booking_sessions')
                .update({ status: 'expired' })
                .eq('id', session.id);

            cancelled++;
            console.log(`[cleanup-orphaned-duffel-orders] Cancelled orphaned order ${session.duffel_pre_order_id} (session ${session.id})`);
        } catch (err: any) {
            errors.push(`session ${session.id}: ${err.message}`);
            console.error('[cleanup-orphaned-duffel-orders] Failed to cancel order:', err.message);
        }
    }

    return NextResponse.json({
        ok: true,
        cancelled,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
    });
}
