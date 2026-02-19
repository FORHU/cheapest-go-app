/**
 * Flight response normalization.
 *
 * Converts provider-specific response formats into NormalizedFlight.
 * Each provider has wildly different response shapes — this module is the
 * single source of truth for the mapping logic.
 */

import type {
    NormalizedFlight,
    NormalizedSegment,
    CabinClass,
} from './types.ts';
import { formatDuration } from './types.ts';

// ─── Amadeus Normalization ──────────────────────────────────────────

/**
 * Normalize a single Amadeus flight offer (from /v2/shopping/flight-offers).
 *
 * Amadeus returns offers referencing dictionaries for carrier names, aircraft, etc.
 * The dictionaries object must be passed alongside the raw offer.
 */
export function normalizeAmadeusOffer(
    // deno-lint-ignore no-explicit-any
    _rawOffer: any,
    // deno-lint-ignore no-explicit-any
    _dictionaries?: Record<string, any>,
): NormalizedFlight | null {
    // TODO: Implement Amadeus normalization
    // 1. Extract id from rawOffer.id, prefix with "amadeus_"
    // 2. Extract price: rawOffer.price.grandTotal, base, fees
    // 3. Map itineraries → segments:
    //    - Each itinerary has segments[] with departure, arrival, carrierCode, number
    //    - Look up carrier names from dictionaries.carriers
    //    - Look up aircraft from dictionaries.aircraft
    //    - Calculate layover durations between segments
    // 4. Extract travelerPricings for per-adult pricing
    // 5. Determine refundable from fareDetailsBySegment
    // 6. Build NormalizedSegment[] from all legs
    // 7. Set summary fields (airline, origin, destination) from first/last segment
    // 8. Set resultIndex = rawOffer.id (for downstream booking)
    // 9. Return NormalizedFlight or null if invalid

    console.warn('[normalizeFlight] normalizeAmadeusOffer() not yet implemented');
    return null;
}

/**
 * Normalize a batch of Amadeus offers.
 */
export function normalizeAmadeusResponse(
    // deno-lint-ignore no-explicit-any
    data: any[],
    // deno-lint-ignore no-explicit-any
    dictionaries?: Record<string, any>,
): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];
    for (const raw of data) {
        const offer = normalizeAmadeusOffer(raw, dictionaries);
        if (offer) results.push(offer);
    }
    return results;
}

// ─── Mystifly Normalization ─────────────────────────────────────────

/**
 * Normalize a single Mystifly fare itinerary (from Search/Flight v1).
 *
 * Mystifly nests data under FareItinerary.AirItineraryFareInfo and
 * OriginDestinationOptions with deeply nested FlightSegment objects.
 */
export function normalizeMystiflyOffer(
    // deno-lint-ignore no-explicit-any
    _fareItinerary: any,
): NormalizedFlight | null {
    // TODO: Implement Mystifly normalization
    // 1. Unwrap: fareItinerary.FareItinerary ?? fareItinerary
    // 2. Extract AirItineraryFareInfo → FareSourceCode
    // 3. Set id = "mystifly_<timestamp>_<counter>"
    // 4. Set traceId = FareSourceCode (required for revalidate + book)
    // 5. Extract pricing from ItinTotalFare (TotalFare, BaseFare, TotalTax)
    // 6. Extract per-adult price from FareBreakdown where Code === 'ADT'
    // 7. Map OriginDestinationOptions → NormalizedSegment[]:
    //    - Each has OriginDestinationOption[] → FlightSegment
    //    - Extract airline, flight number, airports, times, duration
    //    - Map CabinClassCode to our CabinClass via mapCabinClass()
    // 8. Set summary fields from first/last segment
    // 9. Set duration = formatDuration(totalMinutes)
    // 10. Extract baggage from FareBreakdown[].BaggageAllowance
    // 11. Extract branded fare info if present (BrandName, BrandId, FareType)
    // 12. Return NormalizedFlight or null if invalid

    console.warn('[normalizeFlight] normalizeMystiflyOffer() not yet implemented');
    return null;
}

/**
 * Normalize a batch of Mystifly fare itineraries.
 */
export function normalizeMystiflyResponse(
    // deno-lint-ignore no-explicit-any
    fareItineraries: any[],
): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];
    for (const fi of fareItineraries) {
        const offer = normalizeMystiflyOffer(fi);
        if (offer) results.push(offer);
    }
    return results;
}

// ─── Shared Helpers ─────────────────────────────────────────────────

/** Calculate flight duration in minutes from two ISO datetime strings. */
export function calculateDuration(departure: string, arrival: string): number {
    if (!departure || !arrival) return 0;
    const diff = new Date(arrival).getTime() - new Date(departure).getTime();
    return Math.max(0, Math.round(diff / 60_000));
}

/** Map Mystifly cabin code to our CabinClass enum. */
const MYSTIFLY_CABIN_MAP: Record<string, CabinClass> = {
    Y: 'economy',
    S: 'premium_economy',
    C: 'business',
    F: 'first',
};

export function mapCabinClass(code: string): CabinClass {
    return MYSTIFLY_CABIN_MAP[code] ?? 'economy';
}

/** Well-known airline names by IATA code. */
const AIRLINES: Record<string, string> = {
    // Asia-Pacific
    KE: 'Korean Air', OZ: 'Asiana Airlines', '7C': 'Jeju Air', TW: "T'way Air",
    LJ: 'Jin Air', ZE: 'Eastar Jet', BX: 'Air Busan', RS: 'Air Seoul',
    PR: 'Philippine Airlines', '5J': 'Cebu Pacific', Z2: 'AirAsia Philippines',
    JL: 'Japan Airlines', NH: 'ANA', MM: 'Peach Aviation',
    SQ: 'Singapore Airlines', TR: 'Scoot', MH: 'Malaysia Airlines', AK: 'AirAsia',
    TG: 'Thai Airways', FD: 'Thai AirAsia', VN: 'Vietnam Airlines', VJ: 'VietJet',
    GA: 'Garuda Indonesia', CX: 'Cathay Pacific', HX: 'Hong Kong Airlines',
    CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern',
    CI: 'China Airlines', BR: 'EVA Air',
    // Middle East
    EK: 'Emirates', EY: 'Etihad Airways', QR: 'Qatar Airways',
    SV: 'Saudia', GF: 'Gulf Air', WY: 'Oman Air',
    // Americas
    AA: 'American Airlines', DL: 'Delta Air Lines', UA: 'United Airlines',
    WN: 'Southwest Airlines', B6: 'JetBlue', AS: 'Alaska Airlines',
    AC: 'Air Canada', WS: 'WestJet', LA: 'LATAM Airlines',
    AV: 'Avianca', CM: 'Copa Airlines', AM: 'Aeromexico',
    // Europe
    BA: 'British Airways', LH: 'Lufthansa', AF: 'Air France', KL: 'KLM',
    IB: 'Iberia', LX: 'SWISS', OS: 'Austrian Airlines',
    SK: 'SAS', AY: 'Finnair', TP: 'TAP Portugal', TK: 'Turkish Airlines',
    FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air',
    // Africa
    ET: 'Ethiopian Airlines', SA: 'South African Airways', KQ: 'Kenya Airways',
    // India
    AI: 'Air India', '6E': 'IndiGo',
};

/** Get airline name from IATA code, falling back to the code itself. */
export function getAirlineName(code: string): string {
    return AIRLINES[code] ?? code;
}
