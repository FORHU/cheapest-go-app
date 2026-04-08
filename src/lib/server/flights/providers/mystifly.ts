import { FlightResult, FlightSearchParams } from "@/types/flights";
import { env } from "@/utils/env";
import { logApiCall } from "@/lib/server/api-logger";
import {
    searchMystiflyDirect,
    searchMystiflyV2Direct,
    normalizeMystiflyV1Results,
    normalizeMystiflyV2Results,
    CABIN_MAP,
    TRIP_TYPE_MAP,
} from "@/lib/server/flights/mystifly-client";

/**
 * Mystifly provider adapter — direct Node.js calls (no Edge Function hop).
 */
export async function searchMystifly(params: FlightSearchParams): Promise<FlightResult[]> {
    if (!env.MYSTIFLY_USERNAME || !env.MYSTIFLY_PASSWORD || !env.MYSTIFLY_ACCOUNT_NUMBER) {
        console.warn("[Mystifly] Missing credentials — skipping");
        return [];
    }

    console.log("[Mystifly] Searching direct:", params.origin, "->", params.destination);

    const endpoint = `${env.MYSTIFLY_BASE_URL}/api/v1/Search/Flight`;
    const startMs = Date.now();
    const logParams = {
        origin: params.origin, destination: params.destination,
        departureDate: params.departureDate, returnDate: params.returnDate,
        adults: params.adults, cabinClass: params.cabinClass,
    };

    try {
        const tripType = params.returnDate ? 'round-trip' : 'one-way';
        const segments = [
            { origin: params.origin.toUpperCase(), destination: params.destination.toUpperCase(), departureDate: params.departureDate },
        ];
        if (params.returnDate) {
            segments.push({ origin: params.destination.toUpperCase(), destination: params.origin.toUpperCase(), departureDate: params.returnDate });
        }

        const cabinCode = CABIN_MAP[params.cabinClass ?? 'economy'] ?? 'Y';
        const airTripType = TRIP_TYPE_MAP[tripType] ?? 'OneWay';

        const passengerTypes: { Code: string; Quantity: number }[] = [];
        if (params.adults > 0) passengerTypes.push({ Code: 'ADT', Quantity: params.adults });
        if (params.children && params.children > 0) passengerTypes.push({ Code: 'CHD', Quantity: params.children });
        if (params.infants && params.infants > 0) passengerTypes.push({ Code: 'INF', Quantity: params.infants });

        const body = {
            OriginDestinationInformations: segments.map(s => ({
                DepartureDateTime: `${s.departureDate}T00:00:00`,
                OriginLocationCode: s.origin,
                DestinationLocationCode: s.destination,
            })),
            PassengerTypeQuantities: passengerTypes,
            NearByAirports: true,
            CurrencyCode: 'USD',
            TravelPreferences: {
                AirTripType: airTripType,
                CabinPreference: cabinCode,
                MaxStopsQuantity: 'All',
                PreferenceLevel: 'Preferred',
                Preferences: {
                    CabinClassPreference: { CabinType: cabinCode, PreferenceLevel: 'Preferred' },
                },
                CurrencyCode: 'USD',
            },
            RequestOptions: 'Fifty',
        };

        const raw = await searchMystiflyDirect(body);

        // Log ALL keys so we can find where SearchIdentifier lives
        console.log(`[Mystifly] Top-level keys: ${Object.keys(raw).join(', ')}`);
        if (raw.Data) console.log(`[Mystifly] raw.Data keys: ${Object.keys(raw.Data).join(', ')}`);

        // Graceful empty result
        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            const isEmpty = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no flights') || msg.toLowerCase().includes('no result');
            if (isEmpty) {
                logApiCall({ provider: 'mystifly', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: 0 }, searchId: params.searchId });
                return [];
            }
            throw new Error(`Mystifly search failed: ${msg}`);
        }

        const results = normalizeMystiflyV1Results(raw, 50) as FlightResult[];

        // raw.Data.TraceId IS the SearchIdentifier — confirmed from API response structure.
        // Format: FareSourceCode|ConversationId||SearchIdentifier  (empty sessionId slot — edge fn creates its own)
        const searchIdentifier: string = raw.Data?.TraceId ?? '';
        const conversationId: string = raw.Data?.ConversationId ?? '';
        console.log(`[Mystifly] SearchIdentifier (TraceId): ${searchIdentifier.slice(0, 36) || '(empty)'}`);
        if (searchIdentifier) {
            results.forEach((r: any) => {
                if (r.traceId) r.traceId = `${r.traceId}|${conversationId}||${searchIdentifier}`;
            });
        }

        if (results[0]) console.log(`[Mystifly] sample traceId: ${(results[0] as any).traceId?.slice(0, 50)}`);
        console.log(`[Mystifly] ${results.length} results`);
        logApiCall({ provider: 'mystifly', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: results.length }, searchId: params.searchId });
        return results;
    } catch (err: any) {
        logApiCall({ provider: 'mystifly', endpoint, requestParams: logParams, durationMs: Date.now() - startMs, errorMessage: err.message, searchId: params.searchId });
        console.error("[Mystifly] Search failed:", err.message);
        return [];
    }
}

/**
 * Mystifly V2 provider adapter — Branded Fares, direct Node.js calls.
 */
export async function searchMystiflyV2(params: FlightSearchParams): Promise<FlightResult[]> {
    if (!env.MYSTIFLY_USERNAME || !env.MYSTIFLY_PASSWORD || !env.MYSTIFLY_ACCOUNT_NUMBER) {
        return [];
    }

    console.log("[MystiflyV2] Searching direct:", params.origin, "->", params.destination);

    const endpoint = `${env.MYSTIFLY_BASE_URL}/api/v2/Search/Flight`;
    const startMs = Date.now();
    const logParams = {
        origin: params.origin, destination: params.destination,
        departureDate: params.departureDate, returnDate: params.returnDate,
        adults: params.adults, cabinClass: params.cabinClass,
    };

    try {
        const tripType = params.returnDate ? 'round-trip' : 'one-way';
        const segments = [
            { origin: params.origin.toUpperCase(), destination: params.destination.toUpperCase(), departureDate: params.departureDate },
        ];
        if (params.returnDate) {
            segments.push({ origin: params.destination.toUpperCase(), destination: params.origin.toUpperCase(), departureDate: params.returnDate });
        }

        const cabinCode = CABIN_MAP[params.cabinClass ?? 'economy'] ?? 'Y';
        const airTripType = TRIP_TYPE_MAP[tripType] ?? 'OneWay';
        const nationality = env.MYSTIFLY_NATIONALITY;
        const pricingSourceType = env.MYSTIFLY_PRICING_SOURCE_TYPE;

        const passengerTypes: { Code: string; Quantity: number }[] = [];
        if (params.adults > 0) passengerTypes.push({ Code: 'ADT', Quantity: params.adults });
        if (params.children && params.children > 0) passengerTypes.push({ Code: 'CHD', Quantity: params.children });
        if (params.infants && params.infants > 0) passengerTypes.push({ Code: 'INF', Quantity: params.infants });

        const body = {
            OriginDestinationInformations: segments.map(s => ({
                DepartureDateTime: `${s.departureDate}T00:00:00`,
                OriginLocationCode: s.origin,
                DestinationLocationCode: s.destination,
            })),
            PassengerTypeQuantities: passengerTypes,
            PricingSourceType: pricingSourceType,
            Nationalities: [nationality],
            Nationality: nationality,
            NearByAirports: true,
            CurrencyCode: 'USD',
            TravelPreferences: {
                AirTripType: airTripType,
                CabinPreference: cabinCode,
                MaxStopsQuantity: 'All',
                PreferenceLevel: 'Preferred',
                Preferences: {
                    CabinClassPreference: { CabinType: cabinCode, PreferenceLevel: 'Preferred' },
                },
                VendorPreferenceCodes: null,
                VendorExcludeCodes: null,
            },
            RequestOptions: 'TwoHundred',
        };

        const raw = await searchMystiflyV2Direct(body);

        // Log all top-level keys to find SearchIdentifier location
        console.log(`[MystiflyV2] Top-level response keys: ${Object.keys(raw).join(', ')}`);
        if (raw.Data) console.log(`[MystiflyV2] raw.Data keys: ${Object.keys(raw.Data).join(', ')}`);

        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            const isEmpty = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no flights') || msg.toLowerCase().includes('no result');
            if (isEmpty) {
                logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: 0 }, searchId: params.searchId });
                return [];
            }
            throw new Error(`Mystifly V2 search failed: ${msg}`);
        }

        const results = normalizeMystiflyV2Results(raw, 200) as FlightResult[];

        // SearchIdentifier is required by ALL Mystifly endpoints (revalidate + book) for V2 UUID FareSources.
        // Check every plausible field in the response.
        const searchIdentifier: string =
            raw.SearchIdentifier ??
            raw.Data?.SearchIdentifier ??
            raw.Data?.TraceId ??
            raw.Data?.ConversationId ?? '';
        const v2ConversationId: string = raw.Data?.ConversationId ?? '';
        console.log(`[MystiflyV2] SearchIdentifier: ${searchIdentifier ? searchIdentifier.slice(0, 36) : '(none — V2 results dropped, unbookable without it)'}`);

        // If SearchIdentifier is absent, every booking attempt will fail with "searchIdentifier is empty".
        // Drop V2 results rather than showing fares users cannot complete.
        if (!searchIdentifier) {
            console.warn('[MystiflyV2] No SearchIdentifier in response — returning 0 results');
            logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: 0, reason: 'no_search_identifier' }, searchId: params.searchId });
            return [];
        }

        // Always inject 4-part tunneled traceId: FareSourceCode|ConversationId||SearchIdentifier
        // Matches the V1 format so create-booking extracts all IDs correctly.
        results.forEach((r: any) => {
            if (r.traceId) r.traceId = `${r.traceId}|${v2ConversationId}||${searchIdentifier}`;
        });

        console.log(`[MystiflyV2] ${results.length} results (SearchIdentifier present)`);
        logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, responseStatus: 200, durationMs: Date.now() - startMs, responseSummary: { resultCount: results.length }, searchId: params.searchId });
        return results;
    } catch (err: any) {
        logApiCall({ provider: 'mystifly_v2', endpoint, requestParams: logParams, durationMs: Date.now() - startMs, errorMessage: err.message, searchId: params.searchId });
        console.error("[MystiflyV2] Search failed:", err.message);
        return [];
    }
}
