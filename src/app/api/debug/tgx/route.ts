import { NextRequest, NextResponse } from 'next/server';
import { searchTravelgateX } from '@/lib/server/travelgatex';

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
