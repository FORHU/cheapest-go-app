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

// Cold-start fallback used only when hotel_search_stats is empty.
const DEFAULT_CITIES = [
    { cityKey: 'bangkok',      countryCode: 'TH' },
    { cityKey: 'tokyo',        countryCode: 'JP' },
    { cityKey: 'singapore',    countryCode: 'SG' },
    { cityKey: 'kuala lumpur', countryCode: 'MY' },
    { cityKey: 'bali',         countryCode: 'ID' },
    { cityKey: 'dubai',        countryCode: 'AE' },
    { cityKey: 'london',       countryCode: 'GB' },
    { cityKey: 'paris',        countryCode: 'FR' },
    { cityKey: 'new york',     countryCode: 'US' },
    { cityKey: 'seoul',        countryCode: 'KR' },
];

async function syncCity(
    cityKey: string,
    countryCode: string,
    checkin: string,
    checkout: string,
    sql: ReturnType<typeof getSqlAdmin>,
): Promise<{ city: string; hotel?: string; price?: number; currency?: string; skipped?: boolean; reason?: string; error?: string }> {
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
        return { city: cityKey, skipped: true, reason: 'no_results' };
    }

    const priced = hotels.filter((h: any) => h.price > 0);
    if (priced.length === 0) {
        return { city: cityKey, skipped: true, reason: 'no_priced_results' };
    }

    // Cheapest 3-star+ hotel; fall back to cheapest overall if none qualify
    const qualified = priced.filter((h: any) => (h.starRating ?? 0) >= 3);
    const pool = qualified.length > 0 ? qualified : priced;
    const best = pool.reduce((a: any, b: any) => (a.price < b.price ? a : b));

    const hotelCode  = best.hotelId ?? best.id ?? '';
    const imageUrl   = Array.isArray(best.images) ? (best.images[0] ?? '') : (best.image ?? '');
    const refundable = best.refundableTag === 'REFUNDABLE' || best.refundableTag === 'RFN';
    const stars      = best.starRating ? Math.round(best.starRating) : null;
    const rating     = best.reviewRating ?? best.rating ?? null;

    const location = [best.city ?? cityKey, best.country ?? countryCode].filter(Boolean).join(', ');

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
            image_url         = EXCLUDED.image_url,
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

    console.log(`[sync-hotel-deals] Upserted "${best.name}" in ${cityKey} @ ${best.price} ${best.currency}`);
    return { city: cityKey, hotel: best.name, price: best.price, currency: best.currency };
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
            LIMIT 10
        `;

        const finalCities: { cityKey: string; countryCode: string }[] = [
            ...statsRows.map((r: any) => ({ cityKey: r.city_key, countryCode: r.country_code })),
        ];
        for (const def of DEFAULT_CITIES) {
            if (finalCities.length >= 10) break;
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

        return NextResponse.json({ success: true, synced: results });
    } catch (err: any) {
        console.error('[sync-hotel-deals] Fatal error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
