import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/cache-cleanup
 *
 * Runs daily (see vercel.json). Purges two tables that grow indefinitely:
 *
 * 1. search_results_cache  — deletes rows past their expires_at timestamp
 * 2. hotel_review_items    — deletes rows not refreshed by the nightly ETG sync
 *                            in the last 7 days (means ETG dropped them from the dump)
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const results: Record<string, number | string> = {};

    // 1. Expired search cache rows
    const { error: cacheErr, count: cacheDeleted } = await supabase
        .from('search_results_cache')
        .delete({ count: 'exact' })
        .lt('expires_at', new Date().toISOString());

    if (cacheErr) {
        console.error('[cache-cleanup] search_results_cache error:', cacheErr.message);
        results.cache_error = cacheErr.message;
    } else {
        results.cache_deleted = cacheDeleted ?? 0;
    }

    // 2. Stale hotel review rows (not refreshed by ETG sync in 7 days)
    const staleAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: reviewErr, count: reviewDeleted } = await supabase
        .from('hotel_review_items')
        .delete({ count: 'exact' })
        .lt('synced_at', staleAfter);

    if (reviewErr) {
        console.error('[cache-cleanup] hotel_review_items error:', reviewErr.message);
        results.review_error = reviewErr.message;
    } else {
        results.reviews_deleted = reviewDeleted ?? 0;
    }

    console.log('[cache-cleanup] done:', results);
    return NextResponse.json({ success: true, ...results });
}
