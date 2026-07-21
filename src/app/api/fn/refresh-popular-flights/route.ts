import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes max

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    if (!secret) {
        console.warn('[refresh-popular-flights] FUNCTIONS_SECRET/INTERNAL_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const results: any[] = [];

    try {
        // Query top 10 most searched routes from real user demand
        const routes = await sql`
            SELECT origin, destination
            FROM flight_search_stats
            ORDER BY search_count DESC, last_searched_at DESC
            LIMIT 10
        `;

        // Cold-start fallback: globally diverse routes used only when stats table is empty.
        // Once real searches accumulate in flight_search_stats this list is never used.
        const defaultRoutes = [
            { origin: 'GMP', destination: 'CJU' }, // Seoul → Jeju (top domestic)
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

        const finalRoutes = [...routes];
        for (const defRoute of defaultRoutes) {
            if (finalRoutes.length >= 10) break;
            const alreadyExists = finalRoutes.some(
                r => r.origin.toUpperCase() === defRoute.origin.toUpperCase() &&
                     r.destination.toUpperCase() === defRoute.destination.toUpperCase()
            );
            if (!alreadyExists) {
                finalRoutes.push(defRoute);
            }
        }

        console.log(`[refresh-popular-flights] Refreshing cache for ${finalRoutes.length} routes.`);

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const internalSecret = process.env.INTERNAL_SECRET;

        // Departure date set to 14 days in the future
        const departureDateObj = new Date();
        departureDateObj.setDate(departureDateObj.getDate() + 14);
        const departureDate = departureDateObj.toISOString().split('T')[0];

        for (const route of finalRoutes) {
            try {
                console.log(`[refresh-popular-flights] Triggering refresh for: ${route.origin} -> ${route.destination} on ${departureDate}`);
                const refreshRes = await fetch(`${baseUrl}/api/internal/refresh-flights`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${internalSecret}`,
                    },
                    body: JSON.stringify({
                        origin: route.origin.toUpperCase(),
                        destination: route.destination.toUpperCase(),
                        departureDate,
                        cabinClass: 'economy',
                    }),
                });

                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    results.push({
                        origin: route.origin,
                        destination: route.destination,
                        success: true,
                        searchId: data?.searchId,
                    });
                } else {
                    const errText = await refreshRes.text().catch(() => '');
                    console.error(`[refresh-popular-flights] Failed to refresh route ${route.origin} -> ${route.destination}: ${refreshRes.status} ${errText}`);
                    results.push({
                        origin: route.origin,
                        destination: route.destination,
                        success: false,
                        error: `HTTP ${refreshRes.status}: ${errText}`,
                    });
                }
            } catch (fetchErr: any) {
                console.error(`[refresh-popular-flights] Fetch error refreshing route ${route.origin} -> ${route.destination}:`, fetchErr.message);
                results.push({
                    origin: route.origin,
                    destination: route.destination,
                    success: false,
                    error: fetchErr.message,
                });
            }
        }

        return NextResponse.json({ success: true, refreshed: results });
    } catch (err: any) {
        console.error('[refresh-popular-flights] Cron task failed:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
