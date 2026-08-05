/**
 * GET /api/cron/fill-dest-cache
 *
 * Proactively resolves TGX destination codes for cities in hotel_content that
 * have no entry in tgx_destination_cache. Processes the highest-priority cities
 * first (most hotels = most likely to be searched).
 *
 * The sync-dest-cache cron covers TGX's own destination list, but OTV hotel city
 * names often don't match TGX's English names exactly (e.g. "Suncheon" vs
 * "Suncheon-si"), leaving many real cities with no cached code and a slow first
 * search. This cron fills that gap using destinationSearcher.
 *
 * Run every 1-2 hours until the gap is closed, then daily for maintenance.
 * Auth: Bearer <CRON_SECRET>
 * Optional query params:
 *   limit    – cities to process per run (default 100, max 500)
 *   min_hotels – minimum hotel count to be eligible (default 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { backgroundResolveDestCode } from '@/lib/server/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit     = Math.min(parseInt(url.searchParams.get('limit')      ?? '100', 10), 500);
    const minHotels = parseInt(url.searchParams.get('min_hotels') ?? '5',   10);

    const sql = getSqlAdmin();
    const t0  = Date.now();

    // Cities in hotel_content with enough hotels but no dest code yet, ordered by
    // hotel count so the most-searched destinations are resolved first.
    const rows = await sql<{ city: string; cnt: number }[]>`
        SELECT lower(hc.city) AS city, count(*) AS cnt
        FROM hotel_content hc
        WHERE hc.city IS NOT NULL
          AND hc.city != ''
          AND lower(hc.city) NOT IN (SELECT city_key FROM tgx_destination_cache)
        GROUP BY lower(hc.city)
        HAVING count(*) >= ${minHotels}
        ORDER BY count(*) DESC
        LIMIT ${limit}
    `;

    if (rows.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, resolved: 0, message: 'No uncached cities found — all caught up.' });
    }

    console.log(`[fill-dest-cache] Processing ${rows.length} uncached cities (min_hotels=${minHotels})`);

    let resolved = 0;
    let failed   = 0;

    for (const row of rows) {
        const cityName = row.city;
        try {
            // backgroundResolveDestCode writes to _destCodeCache + DB on success.
            // 30s timeout per city — generous but bounded so the cron doesn't hang.
            const code = await Promise.race([
                backgroundResolveDestCode(cityName),
                new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 30_000)),
            ]);
            if (code) {
                resolved++;
                console.log(`[fill-dest-cache] ✓ ${cityName} → ${code}`);
            } else {
                failed++;
                console.log(`[fill-dest-cache] ✗ ${cityName} — no code found`);
            }
        } catch (e: any) {
            failed++;
            console.warn(`[fill-dest-cache] ✗ ${cityName} error: ${e.message?.slice(0, 80)}`);
        }

        // 1s pause between requests to avoid hammering TGX destinationSearcher.
        await new Promise(resolve => setTimeout(resolve, 1_000));
    }

    const elapsed = Date.now() - t0;
    console.log(`[fill-dest-cache] Done: ${resolved} resolved, ${failed} failed in ${elapsed}ms`);

    return NextResponse.json({
        ok: true,
        processed: rows.length,
        resolved,
        failed,
        elapsedMs: elapsed,
    });
}
