/**
 * POST /api/fn/sync-flight-deals
 *
 * Searches Duffel for the cheapest one-way fare on each popular route,
 * then upserts the result into flight_deals for the landing page carousel.
 *
 * Called by /api/cron/sync-flight-deals (every 6 hours).
 * Can also be triggered manually:
 *   curl -X POST https://<host>/api/fn/sync-flight-deals \
 *        -H "Authorization: Bearer $FUNCTIONS_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { searchDuffel } from '@/lib/server/flights/providers/duffel';
import type { CabinClass } from '@/types/flights';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    if (!secret) return true; // dev mode — allow without auth
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

// Globally diverse routes shown when flight_search_stats is empty.
// Once real user searches accumulate, the stats table drives the selection.
const DEFAULT_ROUTES: { origin: string; destination: string }[] = [
    { origin: 'MNL', destination: 'SIN' },
    { origin: 'MNL', destination: 'HKG' },
    { origin: 'MNL', destination: 'NRT' },
    { origin: 'ICN', destination: 'NRT' },
    { origin: 'ICN', destination: 'BKK' },
    { origin: 'BKK', destination: 'KUL' },
    { origin: 'SIN', destination: 'BKK' },
    { origin: 'SIN', destination: 'SYD' },
    { origin: 'DXB', destination: 'LHR' },
    { origin: 'JFK', destination: 'LHR' },
];

function departureDateStr(daysOut: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysOut);
    return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const now = new Date().toISOString();
    // 21 days out — sweet spot where deals are available but not too far to attract real interest.
    const depDate = departureDateStr(21);

    // Pull top searched routes; fall back to defaults when stats are thin.
    let statsRoutes: { origin: string; destination: string }[] = [];
    try {
        statsRoutes = await sql`
            SELECT origin, destination
            FROM flight_search_stats
            ORDER BY search_count DESC, last_searched_at DESC
            LIMIT 10
        `;
    } catch {
        // flight_search_stats may not exist yet — proceed with defaults
    }

    const routes = [...statsRoutes];
    for (const def of DEFAULT_ROUTES) {
        if (routes.length >= 10) break;
        const exists = routes.some(
            r => r.origin.toUpperCase() === def.origin && r.destination.toUpperCase() === def.destination
        );
        if (!exists) routes.push(def);
    }

    const upserted: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    console.log(`[sync-flight-deals] Starting — ${routes.length} routes, departure: ${depDate}`);

    for (const route of routes) {
        const label = `${route.origin.toUpperCase()}→${route.destination.toUpperCase()}`;
        try {
            const results = await searchDuffel({
                origin:        route.origin.toUpperCase(),
                destination:   route.destination.toUpperCase(),
                departureDate: depDate,
                adults:   1,
                children: 0,
                infants:  0,
                cabinClass: 'economy' as CabinClass,
            });

            if (!results.length) {
                console.log(`[sync-flight-deals] No results for ${label} — skipping`);
                skipped.push(label);
                continue;
            }

            // Pick the cheapest offer
            const cheapest = (results as any[]).reduce((a, b) => (a.price <= b.price ? a : b));
            const salePrice     = Math.round(cheapest.price * 100) / 100;
            const baselinePrice = Math.round(salePrice * 1.2 * 100) / 100; // 20% "was" markup
            const airlineIata   = cheapest.segments?.[0]?.airline ?? null;
            const discountTag   = `${Math.round(((baselinePrice - salePrice) / baselinePrice) * 100)}% OFF`;

            await sql`
                INSERT INTO flight_deals
                    (origin, destination, price, currency, airline, departure_date,
                     cabin_class, baseline_price, discount_tag, updated_at, last_refreshed_at)
                VALUES (
                    ${route.origin.toUpperCase()},
                    ${route.destination.toUpperCase()},
                    ${salePrice},
                    ${cheapest.currency || 'USD'},
                    ${airlineIata},
                    ${depDate},
                    ${'economy'},
                    ${baselinePrice},
                    ${discountTag},
                    ${now},
                    ${now}
                )
                ON CONFLICT (origin, destination, cabin_class) DO UPDATE SET
                    price             = EXCLUDED.price,
                    currency          = EXCLUDED.currency,
                    airline           = EXCLUDED.airline,
                    departure_date    = EXCLUDED.departure_date,
                    baseline_price    = EXCLUDED.baseline_price,
                    discount_tag      = EXCLUDED.discount_tag,
                    updated_at        = EXCLUDED.updated_at,
                    last_refreshed_at = EXCLUDED.last_refreshed_at
            `;

            console.log(`[sync-flight-deals] ✓ ${label} ${cheapest.currency}${salePrice} (${airlineIata ?? 'unknown airline'})`);
            upserted.push(`${label} @${cheapest.currency}${salePrice}`);

        } catch (err: any) {
            console.error(`[sync-flight-deals] ✗ ${label}:`, err.message);
            errors.push(`${label}: ${err.message}`);
        }
    }

    console.log(`[sync-flight-deals] Done — upserted: ${upserted.length}, skipped: ${skipped.length}, errors: ${errors.length}`);

    return NextResponse.json({
        success: true,
        departureDate: depDate,
        upserted: upserted.length,
        skipped:  skipped.length,
        errors:   errors.length,
        deals:    upserted,
        ...(errors.length ? { error_details: errors } : {}),
    });
}
