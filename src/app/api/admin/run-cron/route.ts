import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';

const ALLOWED_CRONS = new Set([
    'cache-cleanup',
    'check-price-alerts',
    'cleanup-sessions',
    'etg-reviews-sync',
    'otv-credit-check',
    'poll-pending-tickets',
    'refresh-popular-flights',
    'sync-flight-deals',
    'refresh-hotel-content',
    'fill-dest-cache',
    'sync-dest-cache',
    'cleanup-orphaned-duffel-orders',
    'geocode-hotels',
]);

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'admin-run-cron' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const { cron } = await req.json();
        if (!cron || !ALLOWED_CRONS.has(cron)) {
            return NextResponse.json({ success: false, error: 'Unknown cron job' }, { status: 400 });
        }

        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            return NextResponse.json({ success: false, error: 'CRON_SECRET not configured on this environment' }, { status: 500 });
        }

        const baseUrl = new URL(req.url).origin;
        const start = Date.now();
        const cronRes = await fetch(`${baseUrl}/api/cron/${cron}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${cronSecret}` },
            signal: AbortSignal.timeout(290_000),
        });

        const body = await cronRes.json().catch(() => ({}));

        return NextResponse.json({
            success: cronRes.ok,
            status: cronRes.status,
            durationMs: Date.now() - start,
            result: body,
        });
    } catch (e: any) {
        console.error('[admin/run-cron] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
