import { NextRequest, NextResponse } from 'next/server';
import { searchTravelgateX } from '@/lib/server/travelgatex';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig, getTgxSettings } from '@/lib/server/stays/travelgatex/client';
import { resolveTgxDestinationCode, setDestCodeCache } from '@/lib/server/search';
import { clearFailedDestCodesCache } from '@/lib/server/stays/travelgatex/search';

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
            clearFailedDestCodesCache(); // also wipe the in-memory set on this server instance
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

    // Return ALL dest codes from TGX autocomplete for a city (not just the best-match)
    // Usage: GET /api/debug/tgx?allDestCodes=Phuket
    const allDestCodesCity = searchParams.get('allDestCodes');
    if (allDestCodesCity) {
        try {
            const cfg = getTgxConfig();
            const result = await tgxGraphQL(
                `query TgxAllCodes($access: ID!, $text: String!, $maxSize: Int) {
                   hotelX {
                     destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                       ... on DestinationData { code type texts { text language } }
                     }
                   }
                 }`,
                { access: cfg.accessCode, text: allDestCodesCity, maxSize: 20 }
            );
            const items: any[] = result?.data?.hotelX?.destinationSearcher ?? [];
            const codes = items.map((i: any) => ({
                code: i.code,
                type: i.type,
                names: (i.texts ?? []).filter((t: any) => t.language === 'en').map((t: any) => t.text),
            }));
            return NextResponse.json({ city: allDestCodesCity, total: items.length, codes });
        } catch (e: any) {
            return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    // Resolve dest code with AND without countryCode to compare
    // Usage: GET /api/debug/tgx?resolveCity=Seoul&cc=KR
    const resolveCity = searchParams.get('resolveCity');
    if (resolveCity) {
        const cc = searchParams.get('cc') || undefined;
        const [withCC, withoutCC] = await Promise.all([
            cc ? resolveTgxDestinationCode(resolveCity, cc).catch(() => null) : Promise.resolve('(skipped)'),
            resolveTgxDestinationCode(resolveCity, undefined).catch(() => null),
        ]);
        return NextResponse.json({ city: resolveCity, cc, withCC, withoutCC });
    }

    // Manually seed a dest code: GET /api/debug/tgx?seedDest=bangkok&code=178236
    const seedDestCity = searchParams.get('seedDest');
    const seedDestCode = searchParams.get('code');
    if (seedDestCity && seedDestCode) {
        const sql = getSqlAdmin();
        const key = seedDestCity.toLowerCase().trim();
        await sql`
            INSERT INTO tgx_destination_cache (city_key, destination_code)
            VALUES (${key}, ${seedDestCode})
            ON CONFLICT (city_key) DO UPDATE SET destination_code = EXCLUDED.destination_code
        `;
        setDestCodeCache(key, seedDestCode);
        return NextResponse.json({ ok: true, seeded: key, code: seedDestCode });
    }

    // Show hotel_search_stats (top searched cities)
    // Usage: GET /api/debug/tgx?searchStats=1  (top 50)
    //        GET /api/debug/tgx?searchStats=paris  (filter by city_key prefix)
    const searchStatsParam = searchParams.get('searchStats');
    if (searchStatsParam !== null) {
        const sql = getSqlAdmin();
        const isFilter = searchStatsParam && searchStatsParam !== '1';
        const rows = await sql<{ city_key: string; country_code: string; search_count: number; last_searched_at: string }[]>`
            SELECT city_key, country_code, search_count, last_searched_at
            FROM hotel_search_stats
            ${isFilter ? sql`WHERE city_key ILIKE ${'%' + searchStatsParam.toLowerCase() + '%'}` : sql``}
            ORDER BY search_count DESC
            LIMIT 50
        `;
        return NextResponse.json({ count: rows.length, rows });
    }

    // Seed hotel_search_stats for a city (bootstrap cities never searched on live)
    // Usage: GET /api/debug/tgx?seedStats=Paris,FR
    const seedStatsParam = searchParams.get('seedStats');
    if (seedStatsParam) {
        const sql = getSqlAdmin();
        const [cityName, countryCode = ''] = seedStatsParam.split(',').map(s => s.trim());
        const key = cityName.toLowerCase();
        await sql`
            INSERT INTO hotel_search_stats (city_key, country_code, search_count, last_searched_at)
            VALUES (${key}, ${countryCode.toUpperCase()}, 1, now())
            ON CONFLICT (city_key) DO UPDATE SET last_searched_at = now()
        `;
        return NextResponse.json({ ok: true, seeded: key, country_code: countryCode.toUpperCase() });
    }

    // Show tgx_destination_cache entries matching a prefix
    // Usage: GET /api/debug/tgx?destCache=seoul
    const destCacheQuery = searchParams.get('destCache');
    if (destCacheQuery !== null) {
        const sql = getSqlAdmin();
        const rows = await sql<{ city_key: string; destination_code: string }[]>`
            SELECT city_key, destination_code FROM tgx_destination_cache
            WHERE city_key ILIKE ${'%' + destCacheQuery.toLowerCase() + '%'}
            ORDER BY city_key LIMIT 20
        `;
        return NextResponse.json({ query: destCacheQuery, count: rows.length, rows });
    }

    // Clear hotel_search_cache entries for a city (e.g. after fixing dest code).
    // Usage: GET /api/debug/tgx?clearSearchCache=Rome
    const clearSearchCacheCity = searchParams.get('clearSearchCache');
    if (clearSearchCacheCity) {
        const sql = getSqlAdmin();
        const pattern = `city:${clearSearchCacheCity.toLowerCase().trim()}%`;
        const result = await sql`DELETE FROM hotel_search_cache WHERE cache_key LIKE ${pattern}`;
        return NextResponse.json({ ok: true, deleted: Number(result.count ?? 0), pattern });
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

    // Export all numeric TGX hotel codes for a city (for seeding hotel-seeds.ts)
    // Usage: GET /api/debug/tgx?exportCodes=Tokyo
    const exportCodesCity = searchParams.get('exportCodes');
    if (exportCodesCity) {
        const sql = getSqlAdmin();
        const key = exportCodesCity.toLowerCase();
        const rows = await sql<{ hotel_id: string; name: string; lat: number; lng: number }[]>`
            SELECT hotel_id, name, lat, lng
            FROM hotel_content
            WHERE city ILIKE ${'%' + key + '%'}
              AND hotel_id ~ '^[0-9]+$'
            ORDER BY hotel_id
            LIMIT 500
        `;
        const codes = rows.map(r => r.hotel_id);
        const sample = rows.slice(0, 5).map(r => ({ id: r.hotel_id, name: r.name, lat: r.lat, lng: r.lng }));
        return NextResponse.json({ city: exportCodesCity, total: codes.length, codes, sample });
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

    // ?countryPortfolio=JP,TH,SG,KR — query OTV portfolio count per country code
    // Usage: GET /api/debug/tgx?countryPortfolio=JP,TH,SG,KR,MY,VN,ID,PH,HK,TW,AE,AU
    const countryPortfolioParam = searchParams.get('countryPortfolio');
    if (countryPortfolioParam) {
        const ccs = countryPortfolioParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const cfg = getTgxConfig();
        const PORTFOLIO_Q = `query OtvPf($criteria: HotelXHotelListInput!) { hotelX { hotels(criteria: $criteria) { edges { node { hotelData { code hotelName location { coordinates { latitude longitude } } } } } token } } }`;
        const results: Record<string, any> = {};
        for (const cc of ccs) {
            try {
                const r = await tgxGraphQL(PORTFOLIO_Q, { criteria: { access: cfg.accessCode, maxSize: 1000, countries: [cc] } });
                const edges: any[] = r?.data?.hotelX?.hotels?.edges ?? [];
                const hasMore = !!r?.data?.hotelX?.hotels?.token;
                const sample = edges.slice(0, 3).map((e: any) => ({
                    code: e?.node?.hotelData?.code,
                    name: e?.node?.hotelData?.hotelName,
                    lat: e?.node?.hotelData?.location?.coordinates?.latitude,
                    lng: e?.node?.hotelData?.location?.coordinates?.longitude,
                }));
                results[cc] = { count: edges.length, hasMore, sample };
            } catch (e: any) {
                results[cc] = { error: String(e?.message ?? e) };
            }
        }
        return NextResponse.json({ results });
    }

    // ?rawPortfolio=1 — run OTV hotel portfolio query for a city and show codes before bbox filter
    // Add &noDestCode=1 to skip dest code and query the global OTV catalog directly
    // Usage: GET /api/debug/tgx?rawPortfolio=1&city=Phuket
    // Usage: GET /api/debug/tgx?rawPortfolio=1&noDestCode=1
    if (searchParams.get('rawPortfolio')) {
        try {
            const skipDest = searchParams.get('noDestCode') === '1';
            const destCode = skipDest ? null : await resolveTgxDestinationCode(city, undefined).catch(() => null);
            const cfg = getTgxConfig();
            const pageSize = Number(searchParams.get('pageSize') || '200');
            const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: pageSize };
            if (destCode) criteria.destinationCodes = [destCode];
            const result = await tgxGraphQL(
                `query OtvPortfolio($criteria: HotelXHotelListInput!) { hotelX { hotels(criteria: $criteria) { edges { node { hotelData { code hotelName location { coordinates { latitude longitude } } } } } } } }`,
                { criteria }
            );
            const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
            const hotels = edges.map((e: any) => ({
                code: e?.node?.hotelData?.code,
                name: e?.node?.hotelData?.hotelName,
                lat: e?.node?.hotelData?.location?.coordinates?.latitude,
                lng: e?.node?.hotelData?.location?.coordinates?.longitude,
            }));
            return NextResponse.json({ city, destCode, total: hotels.length, sample: hotels.slice(0, 10), rawEdges: edges.slice(0, 3) });
        } catch (e: any) {
            return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    // ?testDestCode=CODE — test an arbitrary TGX dest code for availability (no city cache lookup)
    // Usage: GET /api/debug/tgx?testDestCode=178236&checkin=2026-08-10&checkout=2026-08-12
    const testDestCode = searchParams.get('testDestCode');
    if (testDestCode) {
        try {
            const cfg = getTgxConfig();
            const criteria = { checkIn: checkin, checkOut: checkout, occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }], nationality: 'KR', currency: 'USD', destinations: [testDestCode] };
            const result = await tgxGraphQL('query Search($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode paymentType status price{gross net currency}}errors{code description}}}}', { criteria, settings: getTgxSettings(cfg, 18000, true) });
            const options = result?.data?.hotelX?.search?.options ?? [];
            const errors = result?.data?.hotelX?.search?.errors ?? [];
            const byPayment: Record<string, number> = {};
            for (const o of options) { byPayment[o.paymentType] = (byPayment[o.paymentType] || 0) + 1; }
            return NextResponse.json({ testDestCode, totalOptions: options.length, byPaymentType: byPayment, sample: options.slice(0, 3), errors });
        } catch (e: any) {
            return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
        }
    }

    // ?testHotel=hotelCode[&noPlugin=1] — search TGX with a single hotel code, show ALL options
    const testHotelCode = searchParams.get('testHotel');
    if (testHotelCode) {
        try {
            const cfg = getTgxConfig();
            const usePlugin = !searchParams.get('noPlugin');
            const criteria = { checkIn: checkin, checkOut: checkout, occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }], nationality: 'KR', currency: 'USD', hotels: [testHotelCode] };
            const result = await tgxGraphQL('query Search($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode paymentType status price{gross net currency}}errors{code description}}}}', { criteria, settings: getTgxSettings(cfg, 18000, usePlugin) });
            const options = result?.data?.hotelX?.search?.options ?? [];
            const errors = result?.data?.hotelX?.search?.errors ?? [];
            const byPayment: Record<string, number> = {};
            for (const o of options) { byPayment[o.paymentType] = (byPayment[o.paymentType] || 0) + 1; }
            return NextResponse.json({ hotelCode: testHotelCode, usePlugin, totalOptions: options.length, byPaymentType: byPayment, sample: options.slice(0, 3), errors });
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
            const codeFormats: Record<string, number> = {};
            for (const o of options) {
                byPayment[o.paymentType] = (byPayment[o.paymentType] || 0) + 1;
                const fmt = /^\d+$/.test(o.hotelCode) ? 'numeric' : /^[A-Z]{2}\d+$/.test(o.hotelCode) ? 'XX000' : 'other';
                codeFormats[fmt] = (codeFormats[fmt] || 0) + 1;
            }
            const sampleCodes = [...new Set(options.slice(0, 20).map((o: any) => o.hotelCode))];
            return NextResponse.json({ city, destCode, totalOptions: options.length, byPaymentType: byPayment, codeFormats, sampleCodes, errors: errors.slice(0, 3) });
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
