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
    // Grouped by city AND country, and cached under the scoped key `city:cc`.
    //
    // This used to group on `lower(hc.city)` alone and resolve with no country, so every
    // Paris in the world collapsed into one row and TGX picked whichever it liked. It
    // picked Paris, Texas — while this very table held 3,933 French Paris hotels against
    // 38 American ones — and "Paris, France" returned nothing until 2026-09-09. The
    // country was always here; it was simply dropped on the way to the resolver.
    //
    // Grouped into cities first, then checked against the cache with NOT EXISTS on its
    // primary key. It used to be `... NOT IN (SELECT city_key FROM tgx_destination_cache)`
    // applied to every hotel row, and once the cache outgrew work_mem Postgres could no
    // longer hash that list: it scanned all 230k keys once per hotel, 1.1M times over —
    // planned cost 2.27 billion. It never finished. Each hourly run left one more copy
    // running while Cloudflare cut the request at ~2 minutes, and on 2026-09-14 four of
    // them (the oldest 9h in) were holding the lock an app-start ALTER TABLE was queued
    // for, which put every read of tgx_destination_cache behind it. This shape plans as a
    // hash anti-join and ran in 2.8s against the same data.
    //
    // Capped all the same: a query that might outlive the request must never be allowed
    // to, because nothing is waiting for its answer.
    const rows = await sql.begin(async tx => {
        await tx`SET LOCAL statement_timeout = '60s'`;
        return tx<{ city: string; country: string; cnt: number }[]>`
            WITH cities AS (
                SELECT lower(hc.city) AS city, lower(hc.country) AS cc, count(*) AS cnt
                  FROM hotel_content hc
                 WHERE hc.city IS NOT NULL
                   AND hc.city <> ''
                   AND hc.country IS NOT NULL
                   AND hc.country <> ''
                 GROUP BY lower(hc.city), lower(hc.country)
                HAVING count(*) >= ${minHotels}
            )
            SELECT c.city, upper(c.cc) AS country, c.cnt
              FROM cities c
             WHERE NOT EXISTS (
                    SELECT 1 FROM tgx_destination_cache d
                     WHERE d.city_key = c.city || ':' || c.cc
             )
             ORDER BY c.cnt DESC
             LIMIT ${limit}
        `;
    });

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
            const country = row.country;
            const scopedKey = `${cityName}:${country.toLowerCase()}`;
            try {
                // The country is passed through, so the resolver keys on `city:cc` and
                // asks TGX for the right place. Without it every ambiguous name resolves
                // once, globally, to whichever country TGX happened to return.
                const code = await Promise.race([
                    backgroundResolveDestCode(cityName, country),
                    new Promise<undefined>(r => setTimeout(() => r(undefined), 30_000)),
                ]);
                if (code) {
                    resolved++;
                    console.log(`[fill-dest-cache] ✓ ${cityName} (${country}) → ${code}`);
                } else {
                    failed++;
                    console.log(`[fill-dest-cache] ✗ ${cityName} (${country}) — no code found, marking as unresolvable`);
                    // Sentinel under the scoped key, so a failure for one country does not
                    // mark the name unresolvable everywhere.
                    await sql`
                        INSERT INTO tgx_destination_cache (city_key, destination_code)
                        VALUES (${scopedKey}, 'NONE')
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
