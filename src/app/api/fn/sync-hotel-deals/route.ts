/**
 * POST /api/fn/sync-hotel-deals
 *
 * Searches TravelgateX for the best-value hotel in each popular city and
 * upserts the result into hotel_deals. Called by the sync-hotel-deals cron
 * every 6 hours, or manually via:
 *
 *   curl -X POST https://<domain>/api/fn/sync-hotel-deals \
 *        -H "Authorization: Bearer $FUNCTIONS_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[sync-hotel-deals] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

// How many hotels to upsert per city. Previously 1 (cheapest only) — raising this
// so the landing page carousel has a healthy pool of PH hotels to display.
const MAX_HOTELS_PER_CITY = 5;

// Cold-start fallback used only when hotel_search_stats is empty.
// Philippines cities are listed first so they're always included in the top slice.
const DEFAULT_CITIES = [
    // ── Philippines (primary market) ────────────────────────────────────────────
    { cityKey: 'manila',        countryCode: 'PH' },
    { cityKey: 'cebu',          countryCode: 'PH' },
    { cityKey: 'boracay',       countryCode: 'PH' },
    { cityKey: 'palawan',       countryCode: 'PH' },
    { cityKey: 'el nido',       countryCode: 'PH' },
    { cityKey: 'siargao',       countryCode: 'PH' },
    { cityKey: 'davao',         countryCode: 'PH' },
    { cityKey: 'bohol',         countryCode: 'PH' },
    { cityKey: 'tagaytay',      countryCode: 'PH' },
    { cityKey: 'baguio',        countryCode: 'PH' },
    { cityKey: 'iloilo',        countryCode: 'PH' },
    // ── Regional ────────────────────────────────────────────────────────────────
    { cityKey: 'bangkok',       countryCode: 'TH' },
    { cityKey: 'tokyo',         countryCode: 'JP' },
    { cityKey: 'singapore',     countryCode: 'SG' },
    { cityKey: 'kuala lumpur',  countryCode: 'MY' },
    { cityKey: 'bali',          countryCode: 'ID' },
    { cityKey: 'dubai',         countryCode: 'AE' },
    { cityKey: 'seoul',         countryCode: 'KR' },
    { cityKey: 'hong kong',     countryCode: 'HK' },
    { cityKey: 'taipei',        countryCode: 'TW' },
];

async function syncCity(
    cityKey: string,
    countryCode: string,
    checkin: string,
    checkout: string,
    sql: ReturnType<typeof getSqlAdmin>,
): Promise<{ city: string; upserted: number; skipped?: boolean; reason?: string; error?: string }> {
    const result = await runTgxSearch({
        checkin,
        checkout,
        cityName:    cityKey,
        countryCode: countryCode || '',
        adults:      2,
        rooms:       1,
        currency:    'USD',
    }) as any;

    const hotels: any[] = Array.isArray(result?.data) ? result.data : [];

    if (hotels.length === 0) {
        console.log(`[sync-hotel-deals] No results for "${cityKey}"`);
        return { city: cityKey, upserted: 0, skipped: true, reason: 'no_results' };
    }

    const priced = hotels.filter((h: any) => h.price > 0);
    if (priced.length === 0) {
        return { city: cityKey, upserted: 0, skipped: true, reason: 'no_priced_results' };
    }

    // Pick top MAX_HOTELS_PER_CITY: prefer 3-star+, sorted by price ascending.
    const qualified = priced.filter((h: any) => (h.starRating ?? 0) >= 3);
    const pool = qualified.length > 0 ? qualified : priced;
    pool.sort((a: any, b: any) => a.price - b.price);
    const top = pool.slice(0, MAX_HOTELS_PER_CITY);

    let upserted = 0;
    for (const best of top) {
        const hotelCode  = best.hotelId ?? best.id ?? '';
        if (!hotelCode) continue;
        let imageUrl = Array.isArray(best.images) ? (best.images[0] ?? '') : (best.image ?? '');

        // If the search result carries no image, check the content cache directly —
        // a previous run may have populated it even if the current search window didn't.
        if (!imageUrl && hotelCode) {
            const rows = await sql`
                SELECT images[1] AS first_image
                FROM hotel_content
                WHERE hotel_id = ${hotelCode}
                  AND array_length(images, 1) > 0
                LIMIT 1
            `;
            if (rows[0]?.first_image) {
                imageUrl = String(rows[0].first_image).replace('{size}', '640x400');
            }
        }
        const refundable = best.refundableTag === 'REFUNDABLE' || best.refundableTag === 'RFN';
        const stars      = best.starRating ? Math.round(best.starRating) : null;
        const rating     = best.reviewRating ?? best.rating ?? null;
        const location   = [best.city ?? cityKey, best.country ?? countryCode].filter(Boolean).join(', ');

        await sql`
            INSERT INTO public.hotel_deals
                (hotel_code, city_key, name, location, destination, country_code, price, currency,
                 image_url, stars, rating, lat, lng, check_in, check_out,
                 board_code, refundable, baseline_price, updated_at, last_refreshed_at)
            VALUES (
                ${hotelCode}, ${cityKey}, ${best.name ?? ''}, ${location}, ${best.city ?? cityKey},
                ${best.country ?? countryCode ?? ''},
                ${best.price}, ${best.currency ?? 'USD'},
                ${imageUrl}, ${stars}, ${rating},
                ${best.lat ?? null}, ${best.lng ?? null},
                ${checkin}::date, ${checkout}::date,
                ${best.boardCode ?? null}, ${refundable},
                ${best.price}, now(), now()
            )
            ON CONFLICT (hotel_code) DO UPDATE SET
                price             = EXCLUDED.price,
                currency          = EXCLUDED.currency,
                image_url         = CASE WHEN EXCLUDED.image_url != '' THEN EXCLUDED.image_url ELSE hotel_deals.image_url END,
                rating            = EXCLUDED.rating,
                check_in          = EXCLUDED.check_in,
                check_out         = EXCLUDED.check_out,
                board_code        = EXCLUDED.board_code,
                refundable        = EXCLUDED.refundable,
                updated_at        = now(),
                last_refreshed_at = now(),
                discount_tag      = CASE
                    WHEN EXCLUDED.price < hotel_deals.baseline_price * 0.9
                    THEN ROUND((1 - EXCLUDED.price / hotel_deals.baseline_price) * 100)::text || '% off'
                    ELSE hotel_deals.discount_tag
                END
        `;
        upserted++;
    }

    console.log(`[sync-hotel-deals] Upserted ${upserted} hotels in ${cityKey} (cheapest: ${top[0]?.price} ${top[0]?.currency})`);
    return { city: cityKey, upserted };
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();

    try {
        const statsRows = await sql`
            SELECT city_key, country_code
            FROM hotel_search_stats
            ORDER BY search_count DESC, last_searched_at DESC
            LIMIT 20
        `;

        const finalCities: { cityKey: string; countryCode: string }[] = [
            ...statsRows.map((r: any) => ({ cityKey: r.city_key, countryCode: r.country_code })),
        ];
        for (const def of DEFAULT_CITIES) {
            if (finalCities.length >= 20) break;
            if (!finalCities.some(c => c.cityKey === def.cityKey)) finalCities.push(def);
        }

        console.log(`[sync-hotel-deals] Syncing ${finalCities.length} cities`);

        // Next Friday checkin, Saturday checkout (weekend snapshot price)
        const checkinDate = new Date();
        const daysUntilFriday = (5 - checkinDate.getDay() + 7) % 7 || 7;
        checkinDate.setDate(checkinDate.getDate() + daysUntilFriday);
        const checkoutDate = new Date(checkinDate);
        checkoutDate.setDate(checkoutDate.getDate() + 1);
        const checkin  = checkinDate.toISOString().split('T')[0];
        const checkout = checkoutDate.toISOString().split('T')[0];

        // Process 3 cities at a time — OTV throttles beyond ~2-3 concurrent requests
        const CONCURRENCY = 3;
        const results: any[] = [];

        for (let i = 0; i < finalCities.length; i += CONCURRENCY) {
            const batch = finalCities.slice(i, i + CONCURRENCY);
            const settled = await Promise.allSettled(
                batch.map(({ cityKey, countryCode }) =>
                    syncCity(cityKey, countryCode, checkin, checkout, sql)
                )
            );
            for (const item of settled) {
                if (item.status === 'fulfilled') {
                    results.push(item.value);
                } else {
                    console.error('[sync-hotel-deals] City failed:', item.reason?.message);
                    results.push({ error: item.reason?.message });
                }
            }
        }

        const totalUpserted = results.reduce((n: number, r: any) => n + (r.upserted ?? 0), 0);
        return NextResponse.json({ success: true, cities: results.length, totalUpserted, synced: results });
    } catch (err: any) {
        console.error('[sync-hotel-deals] Fatal error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
