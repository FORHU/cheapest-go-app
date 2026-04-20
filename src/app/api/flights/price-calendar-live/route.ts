import { NextRequest, NextResponse } from 'next/server';
import { searchFlights } from '@/lib/server/flights/search-flights';
import { rateLimit } from '@/lib/server/rate-limit';
import type { CabinClass } from '@/types/flights';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/flights/price-calendar-live
 *
 * Fetches live cheapest prices for a list of specific dates (max 7).
 * Calls searchFlights in parallel — results are cached automatically by
 * the search layer, so subsequent price-calendar GET calls will have data.
 *
 * Body: { origin, destination, adults, cabin, dates: string[] }
 */
export async function POST(req: NextRequest) {
    const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'price-cal-live' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let body: unknown;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { origin, destination, adults = 1, cabin = 'economy', dates } = body as Record<string, unknown>;

    if (typeof origin !== 'string' || !/^[A-Z]{3}$/.test(origin)) {
        return NextResponse.json({ error: 'Invalid origin' }, { status: 400 });
    }
    if (typeof destination !== 'string' || !/^[A-Z]{3}$/.test(destination)) {
        return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
    }
    if (!Array.isArray(dates) || dates.length === 0 || dates.length > 7) {
        return NextResponse.json({ error: 'dates must be an array of 1–7 YYYY-MM-DD strings' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const validDates = (dates as string[]).filter(
        d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today
    );

    if (!validDates.length) {
        return NextResponse.json({ success: true, data: {} });
    }

    // Search all dates in parallel with individual error isolation
    const results = await Promise.allSettled(
        validDates.map(async (date) => {
            const offers = await searchFlights({
                origin: origin as string,
                destination: destination as string,
                departureDate: date,
                adults: typeof adults === 'number' ? adults : parseInt(String(adults)) || 1,
                children: 0,
                infants: 0,
                cabinClass: (cabin as CabinClass) || 'economy',
            });

            if (!offers?.length) return { date, price: null };

            const cheapest = offers.reduce((min, o: any) =>
                (o.price?.total ?? Infinity) < (min?.price?.total ?? Infinity) ? o : min
            );

            return {
                date,
                price: cheapest?.price?.total ?? null,
                currency: cheapest?.price?.currency ?? 'USD',
            };
        })
    );

    const data: Record<string, { price: number; currency: string }> = {};
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value.price !== null) {
            data[r.value.date] = { price: r.value.price, currency: r.value.currency ?? 'USD' };
        }
    }

    return NextResponse.json({ success: true, data });
}
