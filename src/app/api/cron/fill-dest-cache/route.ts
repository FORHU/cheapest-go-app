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

    console.log(`[fill-dest-cache] Processing ${rows.length} uncached cities (min_hotels=${minHotels}) in background`);

    // Respond immediately — Cloudflare times out at 100s but resolving 100 cities
    // at 1s apart takes ~100s minimum. EC2 keeps the process alive after response.
    async function runFill() {
        let resolved = 0;
        let failed   = 0;
        for (const row of rows) {
            const cityName = row.city;
            try {
                const code = await Promise.race([
                    backgroundResolveDestCode(cityName),
                    new Promise<undefined>(r => setTimeout(() => r(undefined), 30_000)),
                ]);
                if (code) {
                    resolved++;
                    console.log(`[fill-dest-cache] ✓ ${cityName} → ${code}`);
                } else {
                    failed++;
                    console.log(`[fill-dest-cache] ✗ ${cityName} — no code found, marking as unresolvable`);
                    // Insert sentinel so this city is skipped on future runs.
                    // Many failures are non-English city names (e.g. German: "wien", "prag")
                    // that TGX destinationSearcher will never match.
                    await sql`
                        INSERT INTO tgx_destination_cache (city_key, destination_code)
                        VALUES (${cityName}, 'NONE')
                        ON CONFLICT (city_key) DO NOTHING
                    `.catch(() => {});
                }
            } catch (e: any) {
                failed++;
                console.warn(`[fill-dest-cache] ✗ ${cityName} error: ${e.message?.slice(0, 80)}`);
            }
            await new Promise(r => setTimeout(r, 1_000));
        }
        const elapsed = Date.now() - t0;
        console.log(`[fill-dest-cache] Done: ${resolved} resolved, ${failed} marked unresolvable in ${elapsed}ms`);
    }

    runFill().catch(e => console.error('[fill-dest-cache] Background run failed:', e.message));

    return NextResponse.json({
        ok: true,
        message: `Fill started for ${rows.length} cities`,
        queued: rows.length,
    });
}
