/**
 * POST /api/fn/sync-flight-deals
 *
 * Searches Duffel for the cheapest one-way economy offer on each popular route
 * and upserts the result into flight_deals. Called by the sync-flight-deals cron
 * every 6 hours, or manually via:
 *
 *   curl -X POST https://<domain>/api/fn/sync-flight-deals \
 *        -H "Authorization: Bearer $FUNCTIONS_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { searchDuffel } from '@/lib/server/flights/providers/duffel';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[sync-flight-deals] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

// Cold-start fallback used only when flight_search_stats is empty.
const DEFAULT_ROUTES = [
    { origin: 'GMP', destination: 'CJU' }, // Seoul → Jeju
    { origin: 'ICN', destination: 'NRT' }, // Seoul → Tokyo
    { origin: 'ICN', destination: 'BKK' }, // Seoul → Bangkok
    { origin: 'MNL', destination: 'SIN' }, // Manila → Singapore
    { origin: 'BKK', destination: 'KUL' }, // Bangkok → Kuala Lumpur
    { origin: 'DXB', destination: 'LHR' }, // Dubai → London
    { origin: 'SIN', destination: 'SYD' }, // Singapore → Sydney
    { origin: 'JFK', destination: 'LHR' }, // New York → London
    { origin: 'CDG', destination: 'BKK' }, // Paris → Bangkok
    { origin: 'MNL', destination: 'HKG' }, // Manila → Hong Kong
];

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const results: any[] = [];

    try {
        const statsRows = await sql`
            SELECT origin, destination
            FROM flight_search_stats
            ORDER BY search_count DESC, last_searched_at DESC
            LIMIT 10
        `;

        const finalRoutes: { origin: string; destination: string }[] = [...statsRows];
        for (const def of DEFAULT_ROUTES) {
            if (finalRoutes.length >= 10) break;
            const exists = finalRoutes.some(
                r => r.origin.toUpperCase() === def.origin && r.destination.toUpperCase() === def.destination
            );
            if (!exists) finalRoutes.push(def);
        }

        console.log(`[sync-flight-deals] Syncing ${finalRoutes.length} routes`);

        const departureDateObj = new Date();
        departureDateObj.setDate(departureDateObj.getDate() + 14);
        const departureDate = departureDateObj.toISOString().split('T')[0];

        for (const route of finalRoutes) {
            const origin = route.origin.toUpperCase();
            const destination = route.destination.toUpperCase();
            const cabinClass = 'economy';

            try {
                const offers = await searchDuffel({
                    origin,
                    destination,
                    departureDate,
                    adults: 1,
                    children: 0,
                    infants: 0,
                    cabinClass,
                });

                if (offers.length === 0) {
                    console.log(`[sync-flight-deals] No offers for ${origin}->${destination}`);
                    results.push({ origin, destination, skipped: true, reason: 'no_offers' });
                    continue;
                }

                const cheapest = offers.reduce((a, b) => (a.price < b.price ? a : b));

                await sql`
                    INSERT INTO public.flight_deals
                        (origin, destination, cabin_class, price, currency, airline,
                         departure_date, baseline_price, updated_at, last_refreshed_at)
                    VALUES (
                        ${origin}, ${destination}, ${cabinClass},
                        ${cheapest.price}, ${cheapest.currency ?? 'USD'}, ${cheapest.airline ?? ''},
                        ${departureDate}::date,
                        ${cheapest.price}, now(), now()
                    )
                    ON CONFLICT (origin, destination, cabin_class) DO UPDATE SET
                        price             = EXCLUDED.price,
                        currency          = EXCLUDED.currency,
                        airline           = EXCLUDED.airline,
                        departure_date    = EXCLUDED.departure_date,
                        updated_at        = now(),
                        last_refreshed_at = now(),
                        discount_tag      = CASE
                            WHEN EXCLUDED.price < flight_deals.baseline_price * 0.9
                            THEN ROUND((1 - EXCLUDED.price / flight_deals.baseline_price) * 100)::text || '% off'
                            ELSE flight_deals.discount_tag
                        END
                `;

                console.log(`[sync-flight-deals] Upserted ${origin}->${destination} @ ${cheapest.price} ${cheapest.currency}`);
                results.push({ origin, destination, price: cheapest.price, currency: cheapest.currency, airline: cheapest.airline });
            } catch (err: any) {
                console.error(`[sync-flight-deals] Error for ${origin}->${destination}:`, err.message);
                results.push({ origin, destination, success: false, error: err.message });
            }
        }

        return NextResponse.json({ success: true, synced: results });
    } catch (err: any) {
        console.error('[sync-flight-deals] Fatal error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
