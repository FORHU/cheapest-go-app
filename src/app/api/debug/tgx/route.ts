import { NextRequest, NextResponse } from 'next/server';
import { searchTravelgateX } from '@/lib/server/travelgatex';
import { getSqlAdmin } from '@/lib/db/postgres';

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
