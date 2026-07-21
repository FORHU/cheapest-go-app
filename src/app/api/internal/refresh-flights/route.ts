import { NextResponse } from "next/server";
import { searchFlights, saveSearch } from "@/lib/server/flights/search-flights";
import { FlightSearchParams } from "@/types/flights";
import { env } from "@/utils/env";

/**
 * Internal API to refresh flights for a specific route.
 * Used by background cron jobs to keep popular route data fresh.
 */
export async function POST(req: Request) {
    try {
        // 1. Security Check
        const authHeader = req.headers.get("authorization");
        const internalSecret = process.env.INTERNAL_SECRET;
        if (!internalSecret) {
            console.error('[internal/refresh-flights] INTERNAL_SECRET is not configured');
            return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
        }
        if (authHeader !== `Bearer ${internalSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { origin, destination, departureDate, cabinClass } = body;

        if (!origin || !destination || !departureDate) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const params: FlightSearchParams = {
            origin,
            destination,
            departureDate,
            adults: 1,
            children: 0,
            infants: 0,
            cabinClass: cabinClass || 'economy'
        };

        console.log(`[Cron] Refreshing route: ${origin} -> ${destination}`);

        // 2. Save search (to get a searchId for caching)
        const savedSearch = await saveSearch(params);
        
        // 3. Perform search (this automatically updates the cache)
        await searchFlights({ ...params, searchId: savedSearch.id });

        return NextResponse.json({ success: true, searchId: savedSearch.id });
    } catch (error: any) {
        console.error("[Cron] Refresh failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
