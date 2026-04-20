import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/server/rate-limit';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

// Supabase admin client — reads cache without RLS
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * GET /api/flights/price-calendar
 *
 * Returns the cheapest cached fare per day for a given route and month.
 * Queries flight_results_cache joined to flight_searches — no live API calls.
 * Cache entries created by regular user searches fill this in over time.
 *
 * Query params:
 *   origin       IATA (required)
 *   destination  IATA (required)
 *   year         e.g. 2026 (required)
 *   month        1–12 (required)
 *   adults       default 1
 *   cabin        economy | premium_economy | business | first
 */
export async function GET(req: NextRequest) {
    const rl = rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'price-cal' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { searchParams } = new URL(req.url);
    const origin      = (searchParams.get('origin') ?? '').toUpperCase();
    const destination = (searchParams.get('destination') ?? '').toUpperCase();
    const year        = parseInt(searchParams.get('year') ?? '0');
    const month       = parseInt(searchParams.get('month') ?? '0');
    const adults      = Math.max(1, parseInt(searchParams.get('adults') ?? '1'));
    const cabin       = searchParams.get('cabin') ?? 'economy';

    if (!origin || !destination || !year || !month) {
        return NextResponse.json({ success: false, error: 'origin, destination, year, month required' }, { status: 400 });
    }

    // Build date range for the requested month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const endDate   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    // Query: cheapest price per departure_date for this route/month
    // Cache entries are valid for 6 hours (matches TTL in search-flights.ts)
    const { data, error } = await supabase.rpc('get_cheapest_prices_per_day', {
        p_origin:      origin,
        p_destination: destination,
        p_start_date:  startDate,
        p_end_date:    endDate,
        p_adults:      adults,
        p_cabin:       cabin,
        p_max_age_hrs: 24,
    });

    if (error) {
        // RPC may not exist yet — fall back to direct query
        const { data: fallback, error: fbErr } = await supabase
            .from('flight_searches')
            .select(`
                departure_date,
                flight_results_cache ( price, currency )
            `)
            .eq('origin', origin)
            .eq('destination', destination)
            .eq('adults', adults)
            .eq('cabin_class', cabin)
            .gte('departure_date', startDate)
            .lte('departure_date', endDate)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('departure_date');

        if (fbErr || !fallback) {
            return NextResponse.json({ success: true, data: {} });
        }

        const result: Record<string, { price: number; currency: string }> = {};
        for (const row of fallback as any[]) {
            const results: Array<{ price: number; currency: string }> = row.flight_results_cache ?? [];
            if (!results.length) continue;
            const cheapest = results.reduce((min: any, r: any) =>
                r.price < min.price ? r : min, results[0]);
            result[row.departure_date] = { price: cheapest.price, currency: cheapest.currency };
        }
        return NextResponse.json({ success: true, data: result });
    }

    // Shape RPC result into {date: {price, currency}} map
    const result: Record<string, { price: number; currency: string }> = {};
    for (const row of (data ?? []) as any[]) {
        result[row.departure_date] = { price: parseFloat(row.min_price), currency: row.currency };
    }

    return NextResponse.json({ success: true, data: result });
}
