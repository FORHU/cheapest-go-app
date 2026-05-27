import { NextRequest, NextResponse } from 'next/server';
import { createNotification } from '@/lib/server/admin/notify';
import { getDuffelBalances } from '@/lib/server/flights/duffel-balance';
import { getAdminSettings } from '@/lib/server/admin/settings';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cfg = await getAdminSettings();
    const ALERT_THRESHOLD = parseFloat(cfg.duffel_balance_alert_threshold ?? process.env.DUFFEL_BALANCE_ALERT_THRESHOLD ?? '500');

    const token = env.DUFFEL_TOKEN;
    if (!token) {
        console.error('[duffel-balance-check] DUFFEL_ACCESS_TOKEN not set');
        return NextResponse.json({ error: 'DUFFEL_ACCESS_TOKEN not set' }, { status: 500 });
    }

    try {
        const balances = await getDuffelBalances(token, true); // force-refresh, bypass cache
        console.log('[duffel-balance-check] Balances:', JSON.stringify(balances));

        const low = balances.filter(b => b.available < ALERT_THRESHOLD);

        if (low.length > 0) {
            const summary = low
                .map(b => `${b.currency} ${b.available.toFixed(2)}`)
                .join(', ');

            createNotification(
                'Duffel balance low',
                `Balance below $${ALERT_THRESHOLD} threshold: ${summary}. Top up to avoid flight booking failures.`,
                'alert'
            );

            console.warn(`[duffel-balance-check] LOW BALANCE ALERT: ${summary}`);
        } else {
            console.log('[duffel-balance-check] All balances OK');
        }

        return NextResponse.json({
            ok: true,
            balances,
            alertsFired: low.length,
            threshold: ALERT_THRESHOLD,
        });
    } catch (err: any) {
        console.error('[duffel-balance-check] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
