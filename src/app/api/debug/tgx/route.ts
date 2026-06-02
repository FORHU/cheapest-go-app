import { NextRequest, NextResponse } from 'next/server';
import { searchTravelgateX } from '@/lib/server/travelgatex';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint: tests TGX destination resolution + search for a given city.
 * Usage: GET /api/debug/tgx?city=Tokyo&checkin=2026-07-01&checkout=2026-07-05
 * Protected by CRON_SECRET header to prevent public access.
 */
export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const secret = req.headers.get('x-cron-secret');
    if (!cronSecret || secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
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
        debug: rawResult?._debug ?? null,
        error,
        rawKeys: rawResult ? Object.keys(rawResult) : [],
    });
}
