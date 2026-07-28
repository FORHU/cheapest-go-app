import { NextRequest, NextResponse } from 'next/server';
import { searchTravelgateX } from '@/lib/server/travelgatex';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig, getTgxSettings } from '@/lib/server/stays/travelgatex/client';
import { resolveTgxDestinationCode } from '@/lib/server/search';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint: tests TGX destination resolution + search for a given city.
 * Usage: GET /api/debug/tgx?city=Tokyo&checkin=2026-07-01&checkout=2026-07-05
 *
 * Hotel name lookup (to find OTV test hotel code):
 * GET /api/debug/tgx?hotelName=test_hotel_do_not_book
 *
 * Protected by CRON_SECRET header to prevent public access.
 */
export async function GET(req: NextRequest) {
    if (process.env.NODE_ENV !== 'development') {
        const cronSecret = process.env.CRON_SECRET;
        const secret = req.headers.get('x-cron-secret');
        if (!cronSecret || secret !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { searchParams } = new URL(req.url);

    // Cache flush: DELETE FROM hotel_search_cache (optionally filtered by city prefix)
    // Usage: GET /api/debug/tgx?flushCache=1  or  ?flushCache=singapore
    const flushCache = searchParams.get('flushCache');
    if (flushCache !== null) {
        const sql = getSqlAdmin();
        const city = flushCache && flushCache !== '1' ? flushCache.toLowerCase() : null;
        const result = city
            ? await sql`DELETE FROM hotel_search_cache WHERE cache_key LIKE ${'city:' + city + '%'}`
            : await sql`DELETE FROM hotel_search_cache`;
        return NextResponse.json({ ok: true, deleted: Number(result.count ?? 0), filter: city ?? 'all' });
    }

    // Show/clear tgx_failed_dest_codes
    // Usage: GET /api/debug/tgx?failedCodes=list  or  ?failedCodes=clear
    const failedCodes = searchParams.get('failedCodes');
    if (failedCodes !== null) {
        const sql = getSqlAdmin();
        if (failedCodes === 'clear') {
            const result = await sql`DELETE FROM tgx_failed_dest_codes`;
            return NextResponse.json({ ok: true, cleared: Number(result.count ?? 0) });
        }
        const rows = await sql<{ dest_code: string; city_key: string }[]>`SELECT dest_code, city_key FROM tgx_failed_dest_codes ORDER BY city_key`;
        return NextResponse.json({ count: rows.length, codes: rows });
    }

    // Reset wrong-country coordinates for a city so the next OTV backfill can fix them.
    // Zeroes out lat/lng for hotels whose coordinates fall outside the city's country bbox.
    // Usage: GET /api/debug/tgx?resetCoords=Singapore
    const resetCoords = searchParams.get('resetCoords');
    if (resetCoords) {
        const sql = getSqlAdmin();
        const BBOX: Record<string, [number, number, number, number]> = {
            singapore: [1.1, 1.6, 103.6, 104.1],
            phuket:    [7.0, 9.0, 97.5, 100.0],
            bangkok:   [13.4, 14.0, 100.2, 100.9],
            seoul:     [37.3, 37.8, 126.7, 127.3],
            tokyo:     [35.5, 35.9, 139.4, 139.9],
            bali:      [-9.0, -8.0, 114.5, 115.8],
        };
        const key = resetCoords.toLowerCase().trim();
        const bbox = BBOX[key];
        if (!bbox) {
            return NextResponse.json({ error: `Unknown city "${resetCoords}". Known: ${Object.keys(BBOX).join(', ')}` }, { status: 400 });
        }
        const [minLat, maxLat, minLng, maxLng] = bbox;
        const result = await sql`
            UPDATE hotel_content
            SET lat = 0, lng = 0
            WHERE city ILIKE ${'%' + key + '%'}
              AND lat != 0
              AND NOT (lat BETWEEN ${minLat} AND ${maxLat} AND lng BETWEEN ${minLng} AND ${maxLng})
        `;
        return NextResponse.json({ ok: true, reset: Number(result.count ?? 0), city: key });
    }

    // Purge wrong-source hotels: delete content_source='tgx' rows with numeric IDs for a city.
    // These are wrong-country hotels backfilled from old bad TGX dest-code results.
    // Usage: GET /api/debug/tgx?purgeWrong=Phuket
    const purgeWrong = searchParams.get('purgeWrong');
    if (purgeWrong) {
        const sql = getSqlAdmin();
        const key = purgeWrong.toLowerCase();
        const result = await sql`
            DELETE FROM hotel_content
            WHERE city ILIKE ${'%' + key + '%'}
              AND content_source = 'tgx'
              AND hotel_id ~ '^[0-9]+$'
        `;
        return NextResponse.json({ ok: true, deleted: Number(result.count ?? 0), city: key });
    }

    // DB stats for a city: count hotel_content rows, breakdown by source/country
    // Usage: GET /api/debug/tgx?dbStats=Phuket
    const dbStatsCity = searchParams.get('dbStats');
    if (dbStatsCity) {
        const sql = getSqlAdmin();
        const key = dbStatsCity.toLowerCase();
        const rows = await sql<{ hotel_id: string; name: string; lat: number; lng: number; country: string; content_source: string }[]>`
            SELECT hotel_id, name, lat, lng, country, content_source
            FROM hotel_content
            WHERE city ILIKE ${'%' + key + '%'}
            LIMIT 500
        `;
        const bySource: Record<string, number> = {};
        const byCountry: Record<string, number> = {};
        let numericIds = 0;
        for (const r of rows) {
            bySource[r.content_source ?? 'null'] = (bySource[r.content_source ?? 'null'] || 0) + 1;
            byCountry[r.country ?? 'null'] = (byCountry[r.country ?? 'null'] || 0) + 1;
            if (/^\d+$/.test(r.hotel_id)) numericIds++;
        }
        const sample = rows.slice(0, 5).map(r => ({ hotel_id: r.hotel_id, name: r.name, lat: r.lat, lng: r.lng, country: r.country, source: r.content_source }));
        return NextResponse.json({ city: dbStatsCity, total: rows.length, numericIds, bySource, byCountry, sample });
    }

    // Hotel name lookup — search ETG multicomplete to get the numeric OTV hotel ID
    const hotelName = searchParams.get('hotelName');
    if (hotelName) {
        const keyId  = process.env.ETG_KEY_ID;
        const apiKey = process.env.ETG_API_KEY;
        const token  = Buffer.from(`${keyId}:${apiKey}`).toString('base64');

        const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/multicomplete/', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: hotelName, language: 'en', limit: 10 }),
        });
        const json = await res.json();
        return NextResponse.json({ hotelName, status: res.status, raw: json });
    }

    const city = searchParams.get('city') || 'Tokyo';
    const checkin = searchParams.get('checkin') || '2026-07-01';
    const checkout = searchParams.get('checkout') || '2026-07-05';
    const adults = Number(searchParams.get('adults') || '2');

    // ?testHotel=hotelCode — search TGX with a single hotel code, show ALL options (any payment type)
    const testHotelCode = searchParams.get('testHotel');
    if (testHotelCode) {
        try {
            const cfg = getTgxConfig();
            const criteria = { checkIn: checkin, checkOut: checkout, occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }], nationality: 'KR', currency: 'USD', hotels: [testHotelCode] };
            const result = await tgxGraphQL('query Search($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode paymentType status price{gross net currency}}errors{code description}}}}', { criteria, settings: getTgxSettings(cfg, 18000, true) });
            const options = result?.data?.hotelX?.search?.options ?? [];
            const errors = result?.data?.hotelX?.search?.errors ?? [];
            const byPayment: Record<string, number> = {};
            for (const o of options) { byPayment[o.paymentType] = (byPayment[o.paymentType] || 0) + 1; }
            return NextResponse.json({ hotelCode: testHotelCode, totalOptions: options.length, byPaymentType: byPayment, sample: options.slice(0, 3), errors });
        } catch (e: any) {
            return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    // ?rawDest=1 — run raw TGX dest-code search and show payment type breakdown
    if (searchParams.get('rawDest')) {
        try {
            const cfg = getTgxConfig();
            const destCode = await resolveTgxDestinationCode(city, undefined).catch(() => null);
            if (!destCode) return NextResponse.json({ error: 'Could not resolve dest code', city });
            const criteria = { checkIn: checkin, checkOut: checkout, occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }], nationality: 'KR', currency: 'USD', destinations: [destCode] };
            const result = await tgxGraphQL('query Search($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode paymentType status price{gross net currency}}errors{code description}}}}', { criteria, settings: getTgxSettings(cfg, 18000, true) });
            const options = result?.data?.hotelX?.search?.options ?? [];
            const errors = result?.data?.hotelX?.search?.errors ?? [];
            const byPayment: Record<string, number> = {};
            for (const o of options) { byPayment[o.paymentType] = (byPayment[o.paymentType] || 0) + 1; }
            return NextResponse.json({ city, destCode, totalOptions: options.length, byPaymentType: byPayment, errors: errors.slice(0, 3) });
        } catch (e: any) {
            return NextResponse.json({ error: String(e?.message ?? e), city, stack: e?.stack?.split('\n').slice(0, 5) }, { status: 500 });
        }
    }

    const payload = { checkin, checkout, adults, children: 0, rooms: 1, currency: 'USD', cityName: city, countryCode: '' };

    let rawResult: any = null;
    let error: string | null = null;

    try {
        rawResult = await searchTravelgateX(payload);
    } catch (e: any) {
        error = e.message;
    }

    return NextResponse.json({
        query: { city, checkin, checkout, adults },
        hotelCount: rawResult?.data?.length ?? 0,
        firstHotel: rawResult?.data?.[0] ?? null,
        error,
    });
}
