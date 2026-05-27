import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/server/admin/notify';
import { getAdminSettings } from '@/lib/server/admin/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Load operational thresholds from admin_settings, fall back to env vars.
    const cfg = await getAdminSettings();
    const CREDIT_LIMIT = parseFloat(cfg.otv_credit_limit ?? process.env.OTV_CREDIT_LIMIT ?? '0');
    const UTILIZATION_ALERT_PCT = parseFloat(cfg.otv_credit_utilization_alert_pct ?? process.env.OTV_CREDIT_UTILIZATION_ALERT_PCT ?? '0.8');
    const DEADLINE_WINDOW_HOURS = parseInt(cfg.otv_deadline_alert_hours ?? process.env.OTV_DEADLINE_ALERT_HOURS ?? '48');

    const results: Record<string, any> = {};

    // ── 1. Credit utilization ────────────────────────────────────────────────
    // Sum supplier_cost for all confirmed OTV bookings not yet checked out.
    // Non-refundable: credit consumed at booking.
    // Refundable: credit secured at free_cancel_deadline — tracked here as a
    // conservative estimate (worst case: all refundable bookings use credit).
    if (CREDIT_LIMIT > 0) {
        const { data: creditRows, error: creditErr } = await supabase
            .from('bookings')
            .select('supplier_cost, total_price')
            .eq('provider', 'travelgatex')
            .in('status', ['confirmed', 'pending'])
            .gt('check_out', new Date().toISOString());

        if (creditErr) {
            console.error('[otv-credit-check] Credit query error:', creditErr.message);
        } else {
            const outstanding = (creditRows ?? []).reduce(
                (sum, r) => sum + (parseFloat(r.supplier_cost ?? r.total_price) || 0), 0
            );
            const utilization = outstanding / CREDIT_LIMIT;

            results.credit = {
                outstanding: outstanding.toFixed(2),
                limit: CREDIT_LIMIT,
                utilizationPct: (utilization * 100).toFixed(1) + '%',
                bookingCount: (creditRows ?? []).length,
            };

            console.log('[otv-credit-check] Credit utilization:', results.credit);

            if (utilization >= UTILIZATION_ALERT_PCT) {
                createNotification(
                    'OTV credit limit warning',
                    `Outstanding OTV credit: ${outstanding.toFixed(2)} of ${CREDIT_LIMIT} limit (${results.credit.utilizationPct} used). New non-refundable bookings may be rejected by RateHawk.`,
                    'alert'
                );
            }
        }
    } else {
        console.warn('[otv-credit-check] OTV_CREDIT_LIMIT not set — skipping utilization check');
        results.credit = { skipped: true, reason: 'OTV_CREDIT_LIMIT env var not set' };
    }

    // ── 2. Refundable deadline monitor ───────────────────────────────────────
    // Find confirmed refundable OTV bookings whose free_cancel_deadline falls
    // within the alert window. If credit is maxed when the deadline hits,
    // RateHawk auto-cancels the booking silently.
    const windowEnd = new Date(Date.now() + DEADLINE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: deadlineRows, error: deadlineErr } = await supabase
        .from('booking_policy_snapshots')
        .select(`
            free_cancel_deadline,
            bookings!booking_policy_snapshots_booking_id_fkey!inner (
                booking_id,
                property_name,
                holder_email,
                check_in,
                check_out,
                supplier_cost,
                total_price,
                status,
                provider
            )
        `)
        .eq('policy_type', 'free_cancellation')
        .eq('bookings.provider', 'travelgatex')
        .eq('bookings.status', 'confirmed')
        .gte('free_cancel_deadline', now)
        .lte('free_cancel_deadline', windowEnd);

    if (deadlineErr) {
        console.error('[otv-credit-check] Deadline query error:', deadlineErr.message);
    } else {
        const approaching = deadlineRows ?? [];
        results.upcomingDeadlines = approaching.map((r: any) => ({
            bookingId: r.bookings?.booking_id,
            property: r.bookings?.property_name,
            checkIn: r.bookings?.check_in,
            freeCancelDeadline: r.free_cancel_deadline,
            supplierCost: r.bookings?.supplier_cost ?? r.bookings?.total_price,
        }));

        console.log(`[otv-credit-check] ${approaching.length} refundable bookings with deadline in next ${DEADLINE_WINDOW_HOURS}h`);

        if (approaching.length > 0) {
            const list = approaching
                .map((r: any) => `${r.bookings?.property_name} (check-in ${r.bookings?.check_in}, deadline ${r.free_cancel_deadline})`)
                .join('\n');

            createNotification(
                `${approaching.length} OTV refundable booking(s) deadline approaching`,
                `Free cancellation deadline within ${DEADLINE_WINDOW_HOURS}h. If credit limit is maxed, RateHawk will auto-cancel these bookings:\n${list}`,
                'alert'
            );
        }
    }

    return NextResponse.json({ ok: true, checkedAt: now, ...results });
}
