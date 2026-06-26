import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Pre-warm TTL: 8 hours — survives the full business day from a 1am cron run.
const WARM_TTL_MINUTES = 8 * 60;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    if (!secret) return true; // dev mode
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Next N days starting tomorrow — covers weekday and weekend travel. */
function upcomingCheckIns(count: number): string[] {
    const dates: string[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1); // start tomorrow
    for (let i = 0; i < count; i++) {
        dates.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

/** Run searches in parallel batches of `batchSize`. */
async function runInBatches<T>(
    items: T[],
    batchSize: number,
    fn: (item: T) => Promise<void>,
) {
    for (let i = 0; i < items.length; i += batchSize) {
        await Promise.allSettled(items.slice(i, i + batchSize).map(fn));
    }
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const results: { city: string; checkin: string; status: string; hotels?: number }[] = [];

    try {
        // ── Top 20 most-searched cities in the last 30 days ──────────────────
        const topCities = await sql`
            SELECT city_key, country_code
            FROM hotel_search_stats
            WHERE last_searched_at > now() - interval '30 days'
            ORDER BY search_count DESC, last_searched_at DESC
            LIMIT 20
        `;

        if (topCities.length === 0) {
            console.log('[warm-hotel-cache] No search demand recorded yet — nothing to warm');
            return NextResponse.json({ success: true, warmed: 0, message: 'No demand data yet' });
        }

        console.log(`[warm-hotel-cache] Warming ${topCities.length} cities for next 7 days`);

        const checkIns = upcomingCheckIns(7); // next 7 days

        // Build all (city, checkin, checkout) combinations
        type WarmJob = { cityKey: string; countryCode: string; checkin: string; checkout: string };
        const jobs: WarmJob[] = topCities.flatMap((c: any) =>
            checkIns.map(checkin => {
                const checkoutDate = new Date(checkin);
                checkoutDate.setDate(checkoutDate.getDate() + 1);
                return {
                    cityKey:     c.city_key,
                    countryCode: c.country_code,
                    checkin,
                    checkout: checkoutDate.toISOString().slice(0, 10),
                };
            })
        );

        console.log(`[warm-hotel-cache] ${jobs.length} total searches to warm`);

        // ── Skip already-cached and non-expired entries ───────────────────────
        const cacheKeys = jobs.map(j =>
            `city:${j.cityKey}|${j.checkin}|${j.checkout}|2|0|KR`
        );
        const existing = await sql`
            SELECT cache_key FROM hotel_search_cache
            WHERE cache_key = ANY(${cacheKeys}) AND expires_at > now() + interval '30 minutes'
        `;
        const cachedSet = new Set(existing.map((r: any) => r.cache_key));
        const toWarm = jobs.filter(j =>
            !cachedSet.has(`city:${j.cityKey}|${j.checkin}|${j.checkout}|2|0|KR`)
        );

        // Cap per-run to stay within maxDuration=300s (16 jobs × ~18s/batch-of-4 ≈ 72s).
        // On cold start with 140 jobs, subsequent 4-hourly runs cover the rest.
        const MAX_PER_RUN = 16;
        const toWarmCapped = toWarm.slice(0, MAX_PER_RUN);
        const deferred = toWarm.length - toWarmCapped.length;

        console.log(`[warm-hotel-cache] ${cachedSet.size} cached, ${toWarm.length} need warming (this run: ${toWarmCapped.length}${deferred > 0 ? `, deferred: ${deferred}` : ''})`);

        if (toWarmCapped.length === 0) {
            return NextResponse.json({ success: true, warmed: 0, skipped: cachedSet.size, message: 'All already cached' });
        }

        // ── Warm in parallel batches of 4 (TGX rate-limit safe) ──────────────
        await runInBatches(toWarmCapped, 4, async (job) => {
            const label = `${job.cityKey} ${job.checkin}`;
            try {
                const result = await runTgxSearch({
                    cityName:         job.cityKey,
                    countryCode:      job.countryCode,
                    checkin:          job.checkin,
                    checkout:         job.checkout,
                    adults:           2,
                    guest_nationality: 'KR',
                    // Pass longer TTL via env override — runTgxSearch reads HOTEL_CACHE_TTL_MINUTES
                    // which defaults to 5 min. We'll directly write with 8h TTL after the call.
                }) as any;

                const hotelCount = Array.isArray(result?.data) ? result.data.length : 0;

                if (hotelCount > 0) {
                    // Overwrite with 8-hour TTL (runTgxSearch wrote 5-min TTL internally)
                    const cacheKey = `city:${job.cityKey}|${job.checkin}|${job.checkout}|2|0|KR`;
                    await sql`
                        UPDATE hotel_search_cache
                        SET expires_at = now() + interval '${sql.unsafe(String(WARM_TTL_MINUTES))} minutes'
                        WHERE cache_key = ${cacheKey}
                    `;
                    console.log(`[warm-hotel-cache] ✓ ${label}: ${hotelCount} hotels (8h TTL)`);
                    results.push({ city: job.cityKey, checkin: job.checkin, status: 'ok', hotels: hotelCount });
                } else {
                    console.log(`[warm-hotel-cache] ○ ${label}: 0 hotels (no availability or city not in OTV)`);
                    results.push({ city: job.cityKey, checkin: job.checkin, status: 'empty' });
                }
            } catch (e: any) {
                console.error(`[warm-hotel-cache] ✗ ${label}: ${e.message}`);
                results.push({ city: job.cityKey, checkin: job.checkin, status: 'error' });
            }
        });

        const warmed  = results.filter(r => r.status === 'ok').length;
        const empty   = results.filter(r => r.status === 'empty').length;
        const errors  = results.filter(r => r.status === 'error').length;

        console.log(`[warm-hotel-cache] Done — warmed: ${warmed}, empty: ${empty}, errors: ${errors}, skipped: ${cachedSet.size}`);

        return NextResponse.json({
            success: true,
            warmed,
            empty,
            errors,
            skipped:  cachedSet.size,
            deferred,
            results,
        });

    } catch (err: any) {
        console.error('[warm-hotel-cache] Fatal error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
