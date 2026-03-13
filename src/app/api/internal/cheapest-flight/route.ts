import { NextResponse } from "next/server";
import { searchFlights, saveSearch } from "@/lib/server/flights/search-flights";
import type { FlightSearchParams, FlightOffer } from "@/types/flights";
import { env } from "@/utils/env";

/**
 * Internal API: GET /api/internal/cheapest-flight
 *
 * Used by the refresh-deal-prices Edge Function to get live pricing
 * for a specific route. Returns the cheapest offer found by the
 * server-side search (Duffel + Mystifly).
 *
 * Query params: origin, destination, departureDate, returnDate?
 * Header: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */
export async function GET(req: Request): Promise<Response> {
    try {
        // Security — same pattern as /api/internal/refresh-flights
        const auth = req.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const origin = url.searchParams.get("origin") ?? "";
        const destination = url.searchParams.get("destination") ?? "";
        const departureDate = url.searchParams.get("departureDate") ?? "";
        const returnDate = url.searchParams.get("returnDate") ?? undefined;

        if (!origin || !destination || !departureDate) {
            return NextResponse.json({ error: "origin, destination, departureDate required" }, { status: 400 });
        }

        const params: FlightSearchParams = {
            origin,
            destination,
            departureDate,
            returnDate,
            adults: 1,
            children: 0,
            infants: 0,
            cabinClass: "economy",
        };

        // Save + search (uses Duffel & Mystifly via server-side libs)
        const savedSearch = await saveSearch(params);
        const offers = await searchFlights({ ...params, searchId: savedSearch.id });

        if (!offers || offers.length === 0) {
            return NextResponse.json({ success: false, error: "No offers found" }, { status: 200 });
        }

        // Return cheapest by total price
        const cheapest: FlightOffer = offers.reduce(
            (min, offer) => (offer.price.total < min.price.total ? offer : min),
            offers[0]
        );

        return NextResponse.json({
            success: true,
            price: cheapest.price.total,
            airline: cheapest.validatingAirline ?? cheapest.segments?.[0]?.airline?.name ?? null,
            currency: cheapest.price.currency,
        });
    } catch (err: any) {
        console.error("[cheapest-flight]", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
