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
    rawOffer: any,
    // deno-lint-ignore no-explicit-any
    dictionaries?: Record<string, any>,
): NormalizedFlight | null {
    try {
        const carriers = dictionaries?.carriers ?? {};
        const aircraftDict = dictionaries?.aircraft ?? {};

        const itineraries = rawOffer?.itineraries;
        if (!itineraries?.length) return null;

        // First itinerary = outbound
        const outbound = itineraries[0];
        const outSegments = outbound.segments ?? [];
        if (!outSegments.length) return null;

        const firstSeg = outSegments[0];
        const lastSeg = outSegments[outSegments.length - 1];

        // ── Price ──
        const price = parseFloat(rawOffer.price?.grandTotal ?? rawOffer.price?.total ?? '0');
        const baseFare = parseFloat(rawOffer.price?.base ?? '0');
        const currency = rawOffer.price?.currency ?? 'USD';
        const taxes = Math.max(0, price - baseFare);

        // Per-adult price from travelerPricings
        // deno-lint-ignore no-explicit-any
        const adultPricing = rawOffer.travelerPricings?.find((tp: any) => tp.travelerType === 'ADULT');
        const pricePerAdult = adultPricing
            ? parseFloat(adultPricing.price?.total ?? '0')
            : price;

        // ── Cabin & Fare Details ──
        const fareDetails = adultPricing?.fareDetailsBySegment ?? [];
        const primaryCabin = fareDetails[0]?.cabin ?? 'ECONOMY';
        const cabinClass = mapAmadeusCabin(primaryCabin);

        // Refundable — Amadeus signals via pricingOptions.fareType
        const fareTypes: string[] = rawOffer.pricingOptions?.fareType ?? [];
        const refundable = fareTypes.some((ft: string) =>
            ft.toUpperCase().includes('REFUND'),
        );

        // ── Segments — flatten all itineraries ──
        const allSegments: NormalizedSegment[] = [];

        for (const itin of itineraries) {
            for (const seg of itin.segments ?? []) {
                const carrierCode: string = seg.carrierCode ?? '';
                // deno-lint-ignore no-explicit-any
                const fareDetail = fareDetails.find((fd: any) => fd.segmentId === seg.id);

                allSegments.push({
                    airline: carrierCode,
                    airlineName: carriers[carrierCode] ?? getAirlineName(carrierCode),
                    flightNumber: `${carrierCode}${seg.number ?? ''}`,
                    origin: seg.departure?.iataCode ?? '',
                    destination: seg.arrival?.iataCode ?? '',
                    departureTime: seg.departure?.at ?? '',
                    arrivalTime: seg.arrival?.at ?? '',
                    duration: parsePTDuration(seg.duration),
                    terminal: seg.departure?.terminal,
                    arrivalTerminal: seg.arrival?.terminal,
                    aircraft: aircraftDict[seg.aircraft?.code] ?? seg.aircraft?.code,
                    cabinClass: fareDetail ? mapAmadeusCabin(fareDetail.cabin) : cabinClass,
                });
            }
        }

        // ── Outbound summary ──
        const outboundDurationMin = parsePTDuration(outbound.duration);

        // ── Baggage ──
        const checkedBagsInfo = fareDetails[0]?.includedCheckedBags;
        const checkedBags = checkedBagsInfo?.quantity
            ?? (checkedBagsInfo?.weight ? 1 : undefined);
        const weightPerBag = checkedBagsInfo?.weight;

        // ── Brand ──
        const brandName = fareDetails[0]?.brandedFare;

        return {
            id: `amadeus_${rawOffer.id}`,
            provider: 'amadeus',

            airline: firstSeg.carrierCode ?? '',
            airlineName: carriers[firstSeg.carrierCode] ?? getAirlineName(firstSeg.carrierCode ?? ''),
            flightNumber: `${firstSeg.carrierCode ?? ''}${firstSeg.number ?? ''}`,
            origin: firstSeg.departure?.iataCode ?? '',
            destination: lastSeg.arrival?.iataCode ?? '',
            departureTime: firstSeg.departure?.at ?? '',
            arrivalTime: lastSeg.arrival?.at ?? '',
            duration: formatDuration(outboundDurationMin),
            durationMinutes: outboundDurationMin,
            stops: outSegments.length - 1,

            price,
            currency,
            baseFare,
            taxes,
            pricePerAdult,

            segments: allSegments,

            cabinClass,
            refundable,
            seatsRemaining: rawOffer.numberOfBookableSeats,
            validatingAirline: rawOffer.validatingAirlineCodes?.[0],
            lastTicketDate: rawOffer.lastTicketingDate,

            checkedBags,
            weightPerBag,
            brandName,
            fareType: fareTypes[0],
            resultIndex: rawOffer.id,
        };
    } catch (err) {
        console.error('[normalizeFlight] Failed to normalize Amadeus offer:', err);
        return null;
    }
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

let _mystiflyCounter = 0;

/**
 * Normalize a single Mystifly fare itinerary (from Search/Flight v1).
 *
 * Mystifly nests data under FareItinerary.AirItineraryFareInfo and
 * OriginDestinationOptions with deeply nested FlightSegment objects.
 */
export function normalizeMystiflyOffer(
    // deno-lint-ignore no-explicit-any
    fareItinerary: any,
): NormalizedFlight | null {
    try {
        // V2 may nest under .FareItinerary, V1 may be flat
        const itinerary = fareItinerary?.FareItinerary ?? fareItinerary;
        const fareInfo = itinerary?.AirItineraryFareInfo;
        if (!fareInfo) return null;

        const fareSourceCode: string = fareInfo.FareSourceCode ?? '';
        if (!fareSourceCode) return null;

        // ── Price ──
        const itinFare = fareInfo.ItinTotalFare;
        const currency: string = itinFare?.TotalFare?.CurrencyCode ?? 'USD';
        const price = Number(itinFare?.TotalFare?.Amount) || 0;
        const baseFare = Number(itinFare?.BaseFare?.Amount) || 0;
        const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

        // Per-adult price from FareBreakdown
        let pricePerAdult = price;
        const fareBreakdown: any[] = fareInfo.FareBreakdown ?? [];
        for (const fb of fareBreakdown) {
            if (fb?.PassengerTypeQuantity?.Code === 'ADT') {
                pricePerAdult = Number(fb?.PassengerFare?.TotalFare?.Amount) || price;
                break;
            }
        }

        // Refundable from IsRefundable or FareType
        const refundable = itinerary.IsRefundable === true
            || itinerary.IsRefundable === 'Yes';

        // ── Segments ──
        const originDestOptions: any[] = itinerary.OriginDestinationOptions ?? [];
        const allSegments: NormalizedSegment[] = [];
        let totalDurationMin = 0;
        let totalStops = 0;

        for (const odo of originDestOptions) {
            totalStops += Number(odo.TotalStops) || 0;
            const options: any[] = odo.OriginDestinationOption ?? [];

            for (const opt of options) {
                const fs = opt.FlightSegment;
                if (!fs) continue;

                const airlineCode: string =
                    fs.OperatingAirline?.Code ?? fs.MarketingAirlineCode ?? '';
                const flightNum: string =
                    fs.FlightNumber ?? fs.OperatingAirline?.FlightNumber ?? '';
                const depTime: string = fs.DepartureDateTime ?? '';
                const arrTime: string = fs.ArrivalDateTime ?? '';
                const duration = Number(fs.JourneyDuration) || calculateDuration(depTime, arrTime);

                totalDurationMin += duration;

                allSegments.push({
                    airline: airlineCode,
                    airlineName: getAirlineName(airlineCode),
                    flightNumber: `${airlineCode}${flightNum}`,
                    origin: fs.DepartureAirportLocationCode ?? '',
                    destination: fs.ArrivalAirportLocationCode ?? '',
                    departureTime: depTime,
                    arrivalTime: arrTime,
                    duration,
                    terminal: fs.DepartureTerminal,
                    arrivalTerminal: fs.ArrivalTerminal,
                    aircraft: fs.Equipment?.AirEquipType,
                    cabinClass: mapCabinClass(fs.CabinClassCode ?? 'Y'),
                });
            }
        }

        if (!allSegments.length) return null;

        const firstSeg = allSegments[0];
        const lastSeg = allSegments[allSegments.length - 1];

        // ── Baggage (from ADT FareBreakdown) ──
        let checkedBags: number | undefined;
        let weightPerBag: number | undefined;
        let cabinBag: string | undefined;

        for (const fb of fareBreakdown) {
            if (fb?.PassengerTypeQuantity?.Code !== 'ADT') continue;
            const baggageArr: any[] = fb.BaggageAllowance ?? [];
            if (baggageArr.length > 0) {
                checkedBags = Number(baggageArr[0].NumberOfPieces) || 0;
                weightPerBag = Number(baggageArr[0].MaxWeight) || undefined;
            }
            const cabinArr: any[] = fb.CabinBaggageAllowance ?? [];
            if (cabinArr.length > 0) {
                cabinBag = `${cabinArr[0].MaxWeight ?? 7}kg carry-on`;
            }
            break;
        }

        // ── Branded fare ──
        const brandName: string | undefined =
            itinerary.BrandName ?? fareInfo.BrandName
            ?? itinerary.BrandedFareInformation?.BrandName ?? undefined;
        const brandId: string | undefined =
            itinerary.BrandId ?? fareInfo.BrandId
            ?? itinerary.BrandedFareInformation?.BrandId ?? undefined;
        const fareType: string | undefined =
            itinerary.FareType ?? fareInfo.FareType ?? undefined;

        // ── Seats remaining (from first option) ──
        const firstOpt = originDestOptions[0]?.OriginDestinationOption?.[0];
        const seatsRemaining = firstOpt?.SeatsRemaining?.Number
            ? Number(firstOpt.SeatsRemaining.Number) : undefined;

        // ── Build result ──
        _mystiflyCounter++;
        const id = `mystifly_${Date.now()}_${_mystiflyCounter}`;

        return {
            id,
            provider: 'mystifly',

            airline: firstSeg.airline,
            airlineName: firstSeg.airlineName,
            flightNumber: firstSeg.flightNumber,
            origin: firstSeg.origin,
            destination: lastSeg.destination,
            departureTime: firstSeg.departureTime,
            arrivalTime: lastSeg.arrivalTime,
            duration: formatDuration(totalDurationMin),
            durationMinutes: totalDurationMin,
            stops: totalStops,

            price,
            currency,
            baseFare,
            taxes,
            pricePerAdult,

            segments: allSegments,

            cabinClass: firstSeg.cabinClass,
            refundable,
            seatsRemaining,

            checkedBags,
            weightPerBag,
            cabinBag,
            brandName,
            brandId,
            fareType,
            traceId: fareSourceCode,
        };
    } catch (err) {
        console.error('[normalizeFlight] Failed to normalize Mystifly offer:', err);
        return null;
    }
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

/** Parse ISO 8601 PT duration (e.g. "PT2H10M") to minutes. */
export function parsePTDuration(pt: string | undefined | null): number {
    if (!pt) return 0;
    const match = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    return (parseInt(match[1] ?? '0', 10) * 60) + parseInt(match[2] ?? '0', 10);
}

/** Map Amadeus cabin string to our CabinClass enum. */
const AMADEUS_CABIN_MAP: Record<string, CabinClass> = {
    ECONOMY: 'economy',
    PREMIUM_ECONOMY: 'premium_economy',
    BUSINESS: 'business',
    FIRST: 'first',
};

export function mapAmadeusCabin(cabin: string): CabinClass {
    return AMADEUS_CABIN_MAP[cabin?.toUpperCase()] ?? 'economy';
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

/** Map our CabinClass to Amadeus travelClass query param. */
const CABIN_TO_AMADEUS: Record<string, string> = {
    economy: 'ECONOMY',
    premium_economy: 'PREMIUM_ECONOMY',
    business: 'BUSINESS',
    first: 'FIRST',
};

export function toAmadeusCabin(cabin: string): string {
    return CABIN_TO_AMADEUS[cabin] ?? 'ECONOMY';
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
