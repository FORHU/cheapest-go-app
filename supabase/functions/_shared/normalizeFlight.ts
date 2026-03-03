/**
 * Flight response normalization.
 *
 * Converts provider-specific response formats into NormalizedFlight.
 * Each provider has wildly different response shapes — this module is the
 * single source of truth for the mapping logic.
 */

import { FlightProvider } from './types.ts';
import type {
    NormalizedFlight,
    NormalizedSegment,
    CabinClass,
} from './types.ts';
import { formatDuration } from './types.ts';

// ─── Duffel Normalization ──────────────────────────────────────────

/**
 * Normalize a single Duffel offer.
 */
export function normalizeDuffelOffer(
    // deno-lint-ignore no-explicit-any
    rawOffer: any,
): NormalizedFlight | null {
    try {
        if (!rawOffer || !rawOffer.slices || !rawOffer.slices.length) return null;

        // ── Price ──
        const price = parseFloat(rawOffer.total_amount ?? '0');
        const baseFare = parseFloat(rawOffer.base_amount ?? '0');
        const currency = rawOffer.total_currency ?? rawOffer.total_amount_currency ?? 'USD';
        const taxes = parseFloat(rawOffer.tax_amount ?? '0') || Math.max(0, price - baseFare);

        // Per-adult price (approximation if not provided per passenger)
        const pricePerAdult = price / (rawOffer.passengers?.length || 1);

        // ── Segments — flatten all slices ──
        const allSegments: NormalizedSegment[] = [];
        let totalDurationMin = 0;
        let totalStops = 0;
        let primaryCabinClass = 'economy';
        let checkedBags = 0;

        let sliceIndex = 0;
        for (const slice of rawOffer.slices) {
            totalDurationMin += parsePTDuration(slice.duration);
            totalStops += Math.max(0, (slice.segments?.length || 1) - 1);

            for (const seg of slice.segments ?? []) {
                const carrierCode = seg.operating_carrier?.iata_code ?? seg.marketing_carrier?.iata_code ?? '';
                const carrierName = seg.operating_carrier?.name ?? seg.marketing_carrier?.name ?? getAirlineName(carrierCode);
                const flightNum = seg.operating_carrier_flight_number ?? seg.marketing_carrier_flight_number ?? '';

                // Cabin and baggage from the first passenger on this segment
                const firstPax = seg.passengers?.[0];
                const segCabin = firstPax?.cabin_class ?? 'economy';
                if (sliceIndex === 0 && allSegments.length === 0) {
                    primaryCabinClass = segCabin;
                    const bags = firstPax?.baggages?.filter((b: any) => b.type === 'checked') || [];
                    checkedBags = bags.reduce((acc: number, b: any) => acc + (b.quantity || 1), 0);
                }

                allSegments.push({
                    airline: carrierCode,
                    airlineName: carrierName,
                    flightNumber: `${carrierCode}${flightNum}`,
                    origin: seg.origin?.iata_code ?? '',
                    destination: seg.destination?.iata_code ?? '',
                    departureTime: seg.departing_at ?? '',
                    arrivalTime: seg.arriving_at ?? '',
                    duration: parsePTDuration(seg.duration),
                    terminal: seg.origin_terminal,
                    arrivalTerminal: seg.destination_terminal,
                    aircraft: seg.aircraft?.name || seg.aircraft?.iata_code,
                    cabinClass: segCabin as CabinClass,
                    bookingClass: firstPax?.cabin_class_marketing_name, // Duffel might not expose RBD directly in some plans
                    fareBasis: firstPax?.fare_basis_code,
                    itineraryIndex: sliceIndex,
                });
            }
            sliceIndex++;
        }

        if (!allSegments.length) return null;

        const firstSeg = allSegments[0];
        const lastSeg = allSegments[allSegments.length - 1];

        const airlineCode = rawOffer.owner?.iata_code ?? firstSeg.airline;
        const airlineName = rawOffer.owner?.name ?? firstSeg.airlineName;

        return {
            id: `duffel_${rawOffer.id}`,
            provider: FlightProvider.DUFFEL,

            airline: airlineCode,
            airlineName: airlineName,
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

            cabinClass: primaryCabinClass as CabinClass,
            refundable: rawOffer.conditions?.refund_before_departure?.allowed === true,

            // Seats remaining not always provided by Duffel
            seatsRemaining: undefined,
            validatingAirline: rawOffer.owner?.iata_code,
            lastTicketDate: rawOffer.expires_at,

            checkedBags: checkedBags,
            fareType: rawOffer.conditions?.refund_before_departure?.allowed ? 'Refundable' : 'Non-refundable',
            resultIndex: rawOffer.id,

            // Preserve the full raw Duffel offer for booking
            _rawOffer: rawOffer,
        };
    } catch (err) {
        console.error('[normalizeFlight] Failed to normalize Duffel offer:', err);
        return null;
    }
}

/**
 * Normalize a batch of Duffel offers.
 */
export function normalizeDuffelResponse(
    // deno-lint-ignore no-explicit-any
    data: any[],
): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];
    for (const raw of data) {
        const offer = normalizeDuffelOffer(raw);
        if (offer) results.push(offer);
    }
    return results;
}

// ─── Mystifly Normalization ─────────────────────────────────────────

let _mystiflyCounter = 0;

/**
 * Normalize a single Mystifly fare itinerary.
 * Supports both v1 (nested) and v2 (summarized/dictionary) formats.
 */
export function normalizeMystiflyOffer(
    // deno-lint-ignore no-explicit-any
    fareItinerary: any,
    // deno-lint-ignore no-explicit-any
    dataContext?: any, // Full 'Data' object for v2 summarized lookups
): NormalizedFlight | null {
    try {
        // ── Detect V2 Summarized vs V1 Nested ──
        const isV2 = fareItinerary.FareRef !== undefined && dataContext?.FlightFaresList;

        if (isV2) {
            console.log('[normalizeFlight] Mystifly V2 (Summarized) detected');
            return normalizeMystiflyV2(fareItinerary, dataContext);
        }
        console.log('[normalizeFlight] Mystifly V1 (Legacy) detected');

        // V1/Legacy Path
        // V2 may nest under .FareItinerary, V1 may be flat
        const itinerary = fareItinerary?.FareItinerary ?? fareItinerary;
        const fareInfo = itinerary?.AirItineraryFareInfo ?? itinerary?.AirItineraryPricingInfo;
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
        const fareBreakdown: any[] = fareInfo.FareBreakdown ?? fareInfo.PTC_FareBreakdowns ?? [];
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
            const options: any[] = odo.OriginDestinationOption ?? odo.FlightSegments ?? [];

            for (const opt of options) {
                const fs = opt.FlightSegment ?? opt;
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
                    bookingClass: fs.ResBookDesigCode ?? fs.CabinClassCode,
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
            const baggageArr: any[] = fb.BaggageAllowance ?? fb.BaggageInfo ?? [];
            if (baggageArr.length > 0) {
                if (typeof baggageArr[0] === 'string') {
                    checkedBags = parseInt(baggageArr[0], 10) || 0;
                } else {
                    checkedBags = Number(baggageArr[0].NumberOfPieces) || 0;
                    weightPerBag = Number(baggageArr[0].MaxWeight) || undefined;
                }
            }
            const cabinArr: any[] = fb.CabinBaggageAllowance ?? fb.CabinBaggageInfo ?? [];
            if (cabinArr.length > 0) {
                if (typeof cabinArr[0] === 'string') {
                    cabinBag = cabinArr[0] === 'SB' ? 'Small Bag' : cabinArr[0];
                } else {
                    cabinBag = `${cabinArr[0].MaxWeight ?? 7}kg carry-on`;
                }
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
            provider: FlightProvider.MYSTIFLY,

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
    // deno-lint-ignore no-explicit-any
    dataContext?: any,
): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];
    for (const fi of fareItineraries) {
        const offer = normalizeMystiflyOffer(fi, dataContext);
        if (offer) results.push(offer);
    }
    return results;
}

/**
 * Internal helper to normalize v2 summarized Mystifly itineraries.
 */
function normalizeMystiflyV2(
    // deno-lint-ignore no-explicit-any
    itin: any,
    // deno-lint-ignore no-explicit-any
    data: any,
): NormalizedFlight | null {
    try {
        // Find fare by FareRef ID (not index)
        const fare = data.FlightFaresList?.find((f: any) => f.FareRef === itin.FareRef);
        if (!fare) return null;

        const fareSourceCode: string = itin.FareSourceCode ?? '';

        // ── Price ──
        const currency: string = fare.Currency ?? 'USD';
        let totalPrice = 0;
        let totalBase = 0;
        let pricePerAdult = 0;

        const passengerFares: any[] = fare.PassengerFare ?? [];
        for (const pf of passengerFares) {
            const paxTotal = parseFloat(pf.TotalFare) || 0;
            const paxBase = parseFloat(pf.BaseFare) || 0;
            const qty = Number(pf.Quantity) || 1;

            totalPrice += paxTotal * qty;
            totalBase += paxBase * qty;

            if (pf.PaxType === 'ADT') {
                pricePerAdult = paxTotal;
            }
        }

        if (pricePerAdult === 0) pricePerAdult = totalPrice;
        const taxes = Math.max(0, totalPrice - totalBase);

        // ── Segments & Branded Info ──
        const allSegments: NormalizedSegment[] = [];
        let totalDurationMin = 0;
        let totalStops = 0;
        let brandName: string | undefined = undefined;
        let checkedBags = 0;
        let cabinBag = '';

        const odos: any[] = itin.OriginDestinations ?? [];
        for (const odo of odos) {
            // Find segment by SegmentRef ID (not index)
            const seg = data.FlightSegmentList?.find((s: any) => s.SegmentRef === odo.SegmentRef);
            if (!seg) continue;

            const airlineCode: string =
                seg.OperatingCarrierCode ?? seg.MarketingCarriercode ?? '';
            const flightNum: string =
                seg.OperatingFlightNumber ?? seg.MarketingFlightNumber ?? '';

            const depTime: string = seg.DepartureDateTime ?? '';
            const arrTime: string = seg.ArrivalDateTime ?? '';
            const duration = Number(seg.JourneyDuration) || calculateDuration(depTime, arrTime);

            totalDurationMin += duration;
            totalStops += Number(seg.stops) || 0;

            // Get baggage & brand info from ItineraryRef
            const iref = data.ItineraryReferenceList?.find((i: any) => i.ItineraryRef === odo.ItineraryRef);
            let segCabinBag = '';

            if (iref) {
                if (!brandName) brandName = iref.FareFamily;

                // Parse checked baggage
                const chkBags = iref.CheckinBaggage?.find((b: any) => b.Type === 'ADT')?.Value || '';
                if (chkBags) {
                    const match = chkBags.match(/(\d+)/);
                    if (match) checkedBags = Math.max(checkedBags, parseInt(match[1], 10));
                }

                // Parse cabin baggage
                const cabBags = iref.CabinBaggage?.find((b: any) => b.Type === 'ADT')?.Value || '';
                if (cabBags) {
                    segCabinBag = cabBags.toUpperCase() === 'SB' ? 'Small Bag' : cabBags;
                    cabinBag = segCabinBag; // take the last or most prominent
                }
            }

            allSegments.push({
                airline: airlineCode,
                airlineName: getAirlineName(airlineCode),
                flightNumber: `${airlineCode}${flightNum}`,
                origin: seg.DepartureAirportLocationCode ?? '',
                destination: seg.ArrivalAirportLocationCode ?? '',
                departureTime: depTime,
                arrivalTime: arrTime,
                duration,
                terminal: seg.DepartureTerminal,
                arrivalTerminal: seg.ArrivalTerminal,
                aircraft: seg.Equipment,
                cabinClass: mapCabinClass(iref?.CabinClassCode ?? seg.CabinClassCode ?? 'Y'),
                bookingClass: iref?.RBD ?? seg.ResBookDesigCode ?? seg.CabinClassCode,
                fareBasis: iref?.FareBasisCodes,
            });
        }

        if (!allSegments.length) return null;

        const firstSeg = allSegments[0];
        const lastSeg = allSegments[allSegments.length - 1];

        _mystiflyCounter++;
        const id = `mystifly_${Date.now()}_${_mystiflyCounter}`;

        return {
            id,
            provider: FlightProvider.MYSTIFLY_V2,
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
            price: totalPrice,
            currency,
            baseFare: totalBase,
            taxes,
            pricePerAdult,
            segments: allSegments,
            cabinClass: firstSeg.cabinClass,
            refundable: fare.FareType === 'Public',
            checkedBags: checkedBags || undefined,
            cabinBag: cabinBag || undefined,
            brandName: brandName || fare.FareType,
            traceId: fareSourceCode,
        };
    } catch (err) {
        console.error('[normalizeFlight] Failed to normalize Mystifly V2 offer:', err);
        return null;
    }
}

/**
 * Normalize a batch of Mystifly V2 fare itineraries.
 */
export function normalizeMystiflyV2Response(
    // deno-lint-ignore no-explicit-any
    fareItineraries: any[],
    // deno-lint-ignore no-explicit-any
    dataContext?: any,
): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];
    if (!fareItineraries) return results;

    for (const itin of fareItineraries) {
        const offer = normalizeMystiflyV2(itin, dataContext);
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
    CI: 'China Airlines', BR: 'EVA Air', YP: 'Air Premia',
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
