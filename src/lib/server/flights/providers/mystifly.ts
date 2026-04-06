import { FlightResult, FlightSearchParams } from "@/types/flights";
import { env } from "@/utils/env";
import { logApiCall } from "@/lib/server/api-logger";

/**
 * Mystifly provider adapter.
 * Handles communication with the Mystifly API (via Edge Functions) and transforms results.
 */
export async function searchMystifly(params: FlightSearchParams): Promise<FlightResult[]> {
    const supabaseUrl = env.SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
        console.warn("[Mystifly] Missing Supabase credentials for Edge Function call");
        return [];
    }

    console.log("[Mystifly] Searching via Edge Function...", {
        origin: params.origin,
        dest: params.destination,
        date: params.departureDate
    });

    const endpoint = `${supabaseUrl}/functions/v1/mystifly-search`;
    const startMs = Date.now();
    const logParams = { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, cabinClass: params.cabinClass };

    try {
        const segments = [
            { origin: params.origin.toUpperCase(), destination: params.destination.toUpperCase(), departureDate: params.departureDate },
        ];
        if (params.returnDate) {
            segments.push({ origin: params.destination.toUpperCase(), destination: params.origin.toUpperCase(), departureDate: params.returnDate });
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${anonKey}`
            },
            body: JSON.stringify({
                segments,
                tripType: params.returnDate ? 'round-trip' : 'one-way',
                adults: params.adults,
                children: params.children || 0,
                infants: params.infants || 0,
                cabinClass: params.cabinClass || 'economy',
                currency: 'USD',
                maxOffers: 200
            }),
            signal: AbortSignal.timeout(14000)
        });

        if (!res.ok) {
            const error = await res.text();
            console.error(`[Mystifly] Edge Function error (${res.status}):`, error);
            logApiCall({ provider: 'mystifly', endpoint, requestParams: logParams, responseStatus: res.status, durationMs: Date.now() - startMs, errorMessage: error, searchId: params.searchId });
            return [];
        }

        const data = await res.json();
        const flights: any[] = data.flights || [];

        console.log(`[Mystifly] Successfully fetched ${flights.length} flights`);

        const results = flights.map((f: any) => ({
            provider: "mystifly",
            offer_id: f.id || f.offerId,
            price: f.price,
            currency: f.currency,
            airline: f.airlineName || f.airline,
            departure_time: f.departureTime,
            arrival_time: f.arrivalTime,
            duration: f.durationMinutes || 0,
            stops: f.stops || 0,
            remaining_seats: f.seatsRemaining || null,
            traceId: f.traceId,
            segments: (f.segments || []).map((s: any) => ({
                airline: s.airline,
                airlineName: s.airlineName,
                flightNumber: s.flightNumber,
                origin: s.origin,
                destination: s.destination,
                departureTime: s.departureTime,
                arrivalTime: s.arrivalTime,
                duration: s.duration,
                cabinClass: s.cabinClass
            })),
            raw: f
        }));

        logApiCall({ provider: 'mystifly', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: results.length }, searchId: params.searchId });
        return results;
    } catch (err: any) {
        logApiCall({ provider: 'mystifly', endpoint, requestParams: logParams, durationMs: Date.now() - startMs, errorMessage: err.message, searchId: params.searchId });
        console.error("[Mystifly] Search request failed:", err.message);
        return [];
    }
}

/**
 * Mystifly V2 provider adapter (Branded Fares).
 */
export async function searchMystiflyV2(params: FlightSearchParams): Promise<FlightResult[]> {
    const supabaseUrl = env.SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
        return [];
    }

    const endpoint = `${supabaseUrl}/functions/v1/mystifly-v2-search`;
    const startMs = Date.now();
    const logParams = { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, cabinClass: params.cabinClass };

    console.log("[MystiflyV2] Searching via Edge Function...", params.origin);

    try {
        const segments = [
            { origin: params.origin.toUpperCase(), destination: params.destination.toUpperCase(), departureDate: params.departureDate },
        ];
        if (params.returnDate) {
            segments.push({ origin: params.destination.toUpperCase(), destination: params.origin.toUpperCase(), departureDate: params.returnDate });
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${anonKey}`
            },
            body: JSON.stringify({
                segments,
                tripType: params.returnDate ? 'round-trip' : 'one-way',
                adults: params.adults,
                children: params.children || 0,
                infants: params.infants || 0,
                cabinClass: params.cabinClass || 'economy',
                currency: 'USD',
                maxOffers: 200
            }),
            signal: AbortSignal.timeout(14000)
        });

        if (!res.ok) {
            logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, responseStatus: res.status, durationMs: Date.now() - startMs, errorMessage: `HTTP ${res.status}`, searchId: params.searchId });
            return [];
        }

        const data = await res.json();
        const flights: any[] = data.flights || [];

        const results = flights.map((f: any) => ({
            provider: "mystifly_v2",
            offer_id: f.id || f.offerId,
            price: f.price,
            currency: f.currency,
            airline: f.airlineName || f.airline,
            departure_time: f.departureTime,
            arrival_time: f.arrivalTime,
            duration: f.durationMinutes || 0,
            stops: f.stops || 0,
            remaining_seats: f.seatsRemaining || null,
            traceId: f.traceId,
            brandedFare: {
                brandName: f.brandName,
                brandId: f.brandId,
                fareType: f.fareType
            },
            segments: (f.segments || []).map((s: any) => ({
                airline: s.airline,
                airlineName: s.airlineName,
                flightNumber: s.flightNumber,
                origin: s.origin,
                destination: s.destination,
                departureTime: s.departureTime,
                arrivalTime: s.arrivalTime,
                duration: s.duration,
                cabinClass: s.cabinClass
            })),
            raw: f
        }));

        logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: results.length }, searchId: params.searchId });
        return results;
    } catch (err: any) {
        logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, durationMs: Date.now() - startMs, errorMessage: err.message, searchId: params.searchId });
        return [];
    }
}
