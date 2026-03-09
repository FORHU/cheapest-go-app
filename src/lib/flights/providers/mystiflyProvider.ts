import type {
    FlightSearchResponse,
    FlightOffer,
    FlightPrice,
    FlightSegmentDetail,
    CabinClass,
} from '../types';
import { getAirlineName } from '../types';
import {
    calculateNormalizedPriceUsd,
    calculateBestScore,
    generatePhysicalFlightId
} from '../utils';
import type {
    IFlightProvider,
    SearchFlightsParams,
    GetFlightDetailsParams,
    RevalidatePriceParams,
    CreateBookingParams,
    IssueTicketParams,
    FlightDetails,
    RevalidatePriceResult,
    CreateBookingResult,
    IssueTicketResult,
} from './flightProvider.interface';
import { FlightProviderError } from './flightProvider.interface';

// ─── Config ──────────────────────────────────────────────────────────

const MYSTIFLY_USERNAME = process.env.MYSTIFLY_USERNAME || '';
const MYSTIFLY_PASSWORD = process.env.MYSTIFLY_PASSWORD || '';
const MYSTIFLY_ACCOUNT_NUMBER = process.env.MYSTIFLY_ACCOUNT_NUMBER || '';
const MYSTIFLY_BASE_URL = process.env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com';

// ─── Session Cache ──────────────────────────────────────────────────

interface SessionCache {
    sessionId: string;
    createdAt: number;
}

const SESSION_TTL_MS = 55 * 60 * 1000;

let sessionCache: SessionCache | null = null;

async function createSession(): Promise<string> {
    if (sessionCache && (Date.now() - sessionCache.createdAt) < SESSION_TTL_MS) {
        return sessionCache.sessionId;
    }

    const res = await fetch(`${MYSTIFLY_BASE_URL}/api/CreateSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            UserName: MYSTIFLY_USERNAME,
            Password: MYSTIFLY_PASSWORD,
            AccountNumber: MYSTIFLY_ACCOUNT_NUMBER,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new FlightProviderError(
            `Mystifly CreateSession HTTP error: ${res.status} ${text}`,
            'mystifly',
            'AUTH_FAILURE',
            res.status,
        );
    }

    const data = await res.json();

    if (!data.Success || !data.Data?.SessionId) {
        throw new FlightProviderError(
            `Mystifly CreateSession failed: ${data.Message || 'Unknown error'}`,
            'mystifly',
            'AUTH_FAILURE',
        );
    }

    sessionCache = {
        sessionId: data.Data.SessionId,
        createdAt: Date.now(),
    };

    console.log('[Mystifly] Session created successfully');
    return sessionCache.sessionId;
}

// ─── FareSourceCode Cache ───────────────────────────────────────────
// FareSourceCodes are very long strings. We map short offer IDs → full codes
// so downstream methods (revalidate, book) can look them up.

const fareSourceCache = new Map<string, string>();

let offerCounter = 0;

function storeAndGetOfferId(fareSourceCode: string): string {
    offerCounter++;
    const offerId = `mystifly_${Date.now()}_${offerCounter}`;
    fareSourceCache.set(offerId, fareSourceCode);
    return offerId;
}

/** Retrieve the FareSourceCode for a given offerId. */
export function getFareSourceCode(offerId: string): string | undefined {
    return fareSourceCache.get(offerId);
}

// ─── Mapping Helpers ────────────────────────────────────────────────

const CABIN_TO_MYSTIFLY: Record<CabinClass, string> = {
    economy: 'Y',
    premium_economy: 'S',
    business: 'C',
    first: 'F',
};

const MYSTIFLY_CABIN_TO_OURS: Record<string, CabinClass> = {
    Y: 'economy',
    S: 'premium_economy',
    C: 'business',
    F: 'first',
};

const TRIP_TYPE_TO_MYSTIFLY: Record<string, string> = {
    'one-way': 'OneWay',
    'round-trip': 'Return',
    'multi-city': 'MultiCity',
};

function getRequestOptions(maxOffers?: number): string {
    if (!maxOffers || maxOffers <= 50) return 'Fifty';
    if (maxOffers <= 100) return 'Hundred';
    return 'TwoHundred';
}

function getMaxStops(nonStopOnly?: boolean): string {
    return nonStopOnly ? 'Direct' : 'All';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOffer(fareItinerary: any): FlightOffer | null {
    try {
        // V2 may nest under FareItinerary or be flat
        const itinerary = fareItinerary.FareItinerary ?? fareItinerary;
        const fareInfo = itinerary.AirItineraryFareInfo;
        if (!fareInfo) return null;

        const fareSourceCode: string = fareInfo.FareSourceCode;
        if (!fareSourceCode) return null;

        const offerId = storeAndGetOfferId(fareSourceCode);

        // ── Price ──
        const itinFare = fareInfo.ItinTotalFare;
        const currency = itinFare?.TotalFare?.CurrencyCode || 'USD';
        const total = Number(itinFare?.TotalFare?.Amount) || 0;
        const base = Number(itinFare?.BaseFare?.Amount) || 0;
        const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

        // Per-adult price from FareBreakdown
        let pricePerAdult = total;
        const fareBreakdown: unknown[] = fareInfo.FareBreakdown || [];
        for (const fb of fareBreakdown as Record<string, unknown>[]) {
            const paxType = fb.PassengerTypeQuantity as Record<string, unknown> | undefined;
            if (paxType?.Code === 'ADT') {
                const paxFare = fb.PassengerFare as Record<string, unknown> | undefined;
                const paxTotal = paxFare?.TotalFare as Record<string, unknown> | undefined;
                pricePerAdult = Number(paxTotal?.Amount) || total;
                break;
            }
        }

        // ── Segments ──
        const originDestOptions: unknown[] = itinerary.OriginDestinationOptions || [];
        const allSegments: FlightSegmentDetail[] = [];
        let totalStops = 0;
        let segIdx = 0;

        for (const odo of originDestOptions as Record<string, unknown>[]) {
            const options: unknown[] = (odo.OriginDestinationOption || []) as unknown[];
            totalStops += Number(odo.TotalStops) || 0;

            for (const opt of options as Record<string, unknown>[]) {
                const fs = opt.FlightSegment as Record<string, unknown> | undefined;
                if (!fs) continue;

                const opAirline = fs.OperatingAirline as Record<string, unknown> | undefined;
                const airlineCode = (opAirline?.Code as string) || (fs.MarketingAirlineCode as string) || '';
                const flightNum = (fs.FlightNumber as string) || (opAirline?.FlightNumber as string) || '';
                const equipment = fs.Equipment as Record<string, unknown> | undefined;
                const cabinCode = (fs.CabinClassCode as string) || 'Y';

                const depTime = fs.DepartureDateTime as string;
                const arrTime = fs.ArrivalDateTime as string;
                const duration = Number(fs.JourneyDuration) || calculateDuration(depTime, arrTime);

                const seatsInfo = opt.SeatsRemaining as Record<string, unknown> | undefined;

                const segment: FlightSegmentDetail = {
                    segmentIndex: segIdx++,
                    airline: {
                        code: airlineCode,
                        name: getAirlineName(airlineCode),
                    },
                    flightNumber: `${airlineCode}${flightNum}`,
                    origin: (fs.DepartureAirportLocationCode as string) || '',
                    destination: (fs.ArrivalAirportLocationCode as string) || '',
                    departure: {
                        airport: (fs.DepartureAirportLocationCode as string) || '',
                        terminal: fs.DepartureTerminal as string | undefined,
                        time: depTime || '',
                    },
                    arrival: {
                        airport: (fs.ArrivalAirportLocationCode as string) || '',
                        terminal: fs.ArrivalTerminal as string | undefined,
                        time: arrTime || '',
                    },
                    duration,
                    stops: Number(fs.StopQuantity) || 0,
                    aircraft: (equipment?.AirEquipType as string) || undefined,
                    cabinClass: MYSTIFLY_CABIN_TO_OURS[cabinCode] || 'economy',
                };

                allSegments.push(segment);

                // Attach seats remaining from the last segment
                if (seatsInfo) {
                    (segment as FlightSegmentDetail & { _seatsRemaining?: number })._seatsRemaining =
                        Number(seatsInfo.Number) || undefined;
                }
            }
        }

        if (allSegments.length === 0) return null;

        const totalDuration = allSegments.reduce((sum, s) => sum + s.duration, 0);
        const seatsRemaining = getMinSeats(originDestOptions);

        const normalizedPriceUsd = calculateNormalizedPriceUsd(total, currency);
        const bestScore = calculateBestScore(normalizedPriceUsd, totalDuration, totalStops);
        const physicalFlightId = generatePhysicalFlightId('mystifly', allSegments);

        const offer: FlightOffer = {
            offerId,
            provider: 'mystifly',
            price: { total, base, taxes, currency, pricePerAdult },
            segments: allSegments,
            totalDuration,
            totalStops,
            refundable: fareInfo.IsRefundable === true,
            seatsRemaining,
            normalizedPriceUsd,
            bestScore,
            physicalFlightId,
        };

        // Extract baggage if available
        const baggage = extractBaggage(fareInfo);
        if (baggage) offer.baggage = baggage;

        // ── V2 Branded Fare Info ──
        const brandedFare = extractBrandedFare(itinerary, fareInfo);
        if (brandedFare) offer.brandedFare = brandedFare;

        // Validating airline
        const validatingAirline = (itinerary.ValidatingAirlineCode as string)
            || (fareInfo.ValidatingAirlineCode as string);
        if (validatingAirline) offer.validatingAirline = validatingAirline;

        // Last ticket date
        const lastTicketDate = (fareInfo.LastTicketDate as string)
            || (itinerary.LastTicketDate as string);
        if (lastTicketDate) offer.lastTicketDate = lastTicketDate;

        return offer;
    } catch (err) {
        console.warn('[Mystifly] Failed to normalize offer:', err);
        return null;
    }
}

function calculateDuration(dep: string, arr: string): number {
    if (!dep || !arr) return 0;
    const diff = new Date(arr).getTime() - new Date(dep).getTime();
    return Math.max(0, Math.round(diff / 60_000));
}

function getMinSeats(originDestOptions: unknown[]): number | undefined {
    let min: number | undefined;
    for (const odo of originDestOptions as Record<string, unknown>[]) {
        const options = (odo.OriginDestinationOption || []) as Record<string, unknown>[];
        for (const opt of options) {
            const seats = opt.SeatsRemaining as Record<string, unknown> | undefined;
            const num = Number(seats?.Number);
            if (num > 0) {
                min = min === undefined ? num : Math.min(min, num);
            }
        }
    }
    return min;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBaggage(fareInfo: any): FlightOffer['baggage'] | undefined {
    try {
        const breakdown: unknown[] = fareInfo.FareBreakdown || [];
        for (const fb of breakdown as Record<string, unknown>[]) {
            const paxType = fb.PassengerTypeQuantity as Record<string, unknown> | undefined;
            if (paxType?.Code !== 'ADT') continue;

            const baggageArr = fb.BaggageAllowance as Record<string, unknown>[] | undefined;
            if (!baggageArr || baggageArr.length === 0) return undefined;

            const bag = baggageArr[0];
            const checkedBags = Number(bag.NumberOfPieces) || 0;
            const weight = Number(bag.MaxWeight) || undefined;

            const cabinBagArr = fb.CabinBaggageAllowance as Record<string, unknown>[] | undefined;
            const cabinBag = cabinBagArr?.[0]
                ? `${cabinBagArr[0].MaxWeight || '7'}kg carry-on`
                : undefined;

            return { checkedBags, weightPerBag: weight, cabinBag };
        }
    } catch {
        // Baggage info is optional
    }
    return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBrandedFare(itinerary: any, fareInfo: any): FlightOffer['brandedFare'] | undefined {
    try {
        // V2 branded fare info can live at itinerary level or fareInfo level
        const fareType = (itinerary.FareType as string)
            || (fareInfo.FareType as string);
        const brandName = (itinerary.BrandName as string)
            || (fareInfo.BrandName as string)
            || (itinerary.BrandedFareInformation?.BrandName as string);
        const brandId = (itinerary.BrandId as string)
            || (fareInfo.BrandId as string)
            || (itinerary.BrandedFareInformation?.BrandId as string);
        const brandTier = Number(itinerary.BrandTier ?? fareInfo.BrandTier
            ?? itinerary.BrandedFareInformation?.BrandTier) || undefined;

        // Only return if we have at least some branded info
        if (!fareType && !brandName && !brandId) return undefined;

        return {
            fareType: fareType || undefined,
            brandName: brandName || undefined,
            brandId: brandId || undefined,
            brandTier,
        };
    } catch {
        return undefined;
    }
}

// ─── Provider ────────────────────────────────────────────────────────

export class MystiflyProvider implements IFlightProvider {
    readonly name = 'mystifly';
    readonly displayName = 'Mystifly';
    readonly enabled: boolean;
    readonly priority = 2;

    constructor() {
        this.enabled = !!(MYSTIFLY_USERNAME && MYSTIFLY_PASSWORD && MYSTIFLY_ACCOUNT_NUMBER);
    }

    /** Get a valid session ID, creating one if needed. */
    async getSessionId(): Promise<string> {
        return createSession();
    }

    // ── Search Flights ──────────────────────────────────────────────

    async searchFlights(params: SearchFlightsParams): Promise<FlightSearchResponse> {
        const sessionId = await this.getSessionId();

        // Build passenger types
        const passengerTypes: { Code: string; Quantity: number }[] = [];
        if (params.passengers.adults > 0) {
            passengerTypes.push({ Code: 'ADT', Quantity: params.passengers.adults });
        }
        if (params.passengers.children > 0) {
            passengerTypes.push({ Code: 'CHD', Quantity: params.passengers.children });
        }
        if (params.passengers.infants > 0) {
            passengerTypes.push({ Code: 'INF', Quantity: params.passengers.infants });
        }

        // Build origin-destination segments
        const originDestinations = params.segments.map(seg => ({
            DepartureDateTime: `${seg.departureDate}T00:00:00`,
            OriginLocationCode: seg.origin,
            DestinationLocationCode: seg.destination,
        }));

        const requestBody = {
            SessionId: sessionId,
            OriginDestinationInformations: originDestinations,
            PassengerTypeQuantities: passengerTypes,
            IsRefundable: false,
            NearByAirports: false,
            PricingSourceType: 0,
            RequestOptions: getRequestOptions(params.maxOffers),
            Sources: null,
            TravelPreferences: {
                AirTripType: TRIP_TYPE_TO_MYSTIFLY[params.tripType] || 'OneWay',
                CabinPreference: CABIN_TO_MYSTIFLY[params.cabinClass] || 'Y',
                MaxStopsQuantity: getMaxStops(params.nonStopOnly),
            },
        };

        console.log('[Mystifly] Searching flights:', JSON.stringify({
            origin: params.segments[0]?.origin,
            destination: params.segments[0]?.destination,
            tripType: params.tripType,
            passengers: params.passengers,
        }));

        // Debug: log full request body to verify format
        console.log('[Mystifly] Full request body:', JSON.stringify(requestBody, null, 2));

        const res = await fetch(`${MYSTIFLY_BASE_URL}/api/v1/Search/Flight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new FlightProviderError(
                `Mystifly search HTTP error: ${res.status} ${text}`,
                'mystifly',
                'PROVIDER_ERROR',
                res.status,
                res.status >= 500,
            );
        }

        const data = await res.json();

        console.log('[Mystifly] Search response:', JSON.stringify({
            Success: data.Success,
            Message: data.Message,
            HasData: !!data.Data,
            FareCount: data.Data?.FareItineraries?.length ?? 0,
        }));

        // Debug: log first itinerary keys to understand V2 structure
        const firstItinerary = data.Data?.FareItineraries?.[0];
        if (firstItinerary) {
            console.log('[Mystifly] V2 first itinerary keys:', Object.keys(firstItinerary));
            const inner = firstItinerary.FareItinerary ?? firstItinerary;
            if (inner !== firstItinerary) {
                console.log('[Mystifly] V2 inner itinerary keys:', Object.keys(inner));
            }
        }

        if (!data.Success) {
            // "Flights not found" is a normal empty result, not an error
            const msg = data.Message || '';
            const isEmptyResult = msg.toLowerCase().includes('not found')
                || msg.toLowerCase().includes('no flights')
                || msg.toLowerCase().includes('no result');

            if (isEmptyResult) {
                console.log('[Mystifly] No flights found for this route — returning empty result');
                return {
                    offers: [],
                    metadata: {
                        provider: 'mystifly',
                        searchId: data.SessionId || sessionId,
                        timestamp: new Date().toISOString(),
                        totalResults: 0,
                    },
                };
            }

            // Session may have expired — clear cache and throw retryable error
            if (msg.includes('session') || msg.includes('Session')) {
                sessionCache = null;
            }
            throw new FlightProviderError(
                `Mystifly search failed: ${msg || 'Unknown error'}`,
                'mystifly',
                'PROVIDER_ERROR',
                undefined,
                true,
            );
        }

        // Normalize fare itineraries into FlightOffer[]
        const fareItineraries: unknown[] = data.Data?.FareItineraries || [];
        const offers: FlightOffer[] = [];

        for (const fi of fareItineraries) {
            const offer = normalizeOffer(fi);
            if (offer) {
                // Apply max price filter client-side if set
                if (params.maxPrice && offer.price.total > params.maxPrice) continue;
                offers.push(offer);
            }
        }

        // Sort by price ascending
        offers.sort((a, b) => a.price.total - b.price.total);

        const maxOffers = params.maxOffers || 50;
        const trimmedOffers = offers.slice(0, maxOffers);

        console.log(`[Mystifly] Search returned ${fareItineraries.length} itineraries, normalized ${offers.length} offers`);

        return {
            offers: trimmedOffers,
            metadata: {
                provider: 'mystifly',
                searchId: data.SessionId || sessionId,
                timestamp: new Date().toISOString(),
                totalResults: offers.length,
            },
        };
    }

    // ── Stubs (to be implemented) ───────────────────────────────────

    async getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails> {
        throw new FlightProviderError(
            'getFlightDetails not yet implemented for Mystifly',
            'mystifly',
            'PROVIDER_ERROR',
        );
    }

    async revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult> {
        const sessionId = await this.getSessionId();

        // Look up the full FareSourceCode from our cache
        const fareSourceCode = getFareSourceCode(params.offerId);
        if (!fareSourceCode) {
            throw new FlightProviderError(
                `FareSourceCode not found for offerId: ${params.offerId}. The offer may have expired from cache.`,
                'mystifly',
                'OFFER_EXPIRED',
            );
        }

        console.log('[Mystifly] Revalidating flight price for:', params.offerId);

        const requestBody = {
            FareSourceCode: fareSourceCode,
            Target: MYSTIFLY_BASE_URL.includes('demo') ? 'Test' : 'Production',
        };

        const res = await fetch(`${MYSTIFLY_BASE_URL}/api/v1/Revalidate/Flight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new FlightProviderError(
                `Mystifly revalidation HTTP error: ${res.status} ${text}`,
                'mystifly',
                'PROVIDER_ERROR',
                res.status,
                res.status >= 500,
            );
        }

        const data = await res.json();

        console.log('[Mystifly] Revalidation response:', JSON.stringify({
            Success: data.Success,
            Message: data.Message,
            PriceChanged: data.Data?.PriceChanged,
        }));

        if (!data.Success) {
            const msg = data.Message || '';
            // Offer no longer available
            if (msg.toLowerCase().includes('not available')
                || msg.toLowerCase().includes('not found')
                || msg.toLowerCase().includes('expired')) {
                return {
                    available: false,
                    offerId: params.offerId,
                    price: { total: 0, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
                    priceChanged: false,
                };
            }

            if (msg.includes('session') || msg.includes('Session')) {
                sessionCache = null;
            }
            throw new FlightProviderError(
                `Mystifly revalidation failed: ${msg}`,
                'mystifly',
                'PROVIDER_ERROR',
                undefined,
                true,
            );
        }

        // Parse the revalidated fare data
        const revalData = data.Data || {};
        const priceChanged = revalData.PriceChanged === true;

        // Extract updated pricing — response may nest under FareItinerary or be flat
        const itinerary = revalData.FareItinerary ?? revalData;
        const fareInfo = itinerary.AirItineraryFareInfo ?? revalData;
        const itinFare = fareInfo.ItinTotalFare;

        const currency = itinFare?.TotalFare?.CurrencyCode || 'USD';
        const total = Number(itinFare?.TotalFare?.Amount) || 0;
        const base = Number(itinFare?.BaseFare?.Amount) || 0;
        const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

        // Per-adult price
        let pricePerAdult = total;
        const fareBreakdown: unknown[] = fareInfo.FareBreakdown || [];
        for (const fb of fareBreakdown as Record<string, unknown>[]) {
            const paxType = fb.PassengerTypeQuantity as Record<string, unknown> | undefined;
            if (paxType?.Code === 'ADT') {
                const paxFare = fb.PassengerFare as Record<string, unknown> | undefined;
                const paxTotal = paxFare?.TotalFare as Record<string, unknown> | undefined;
                pricePerAdult = Number(paxTotal?.Amount) || total;
                break;
            }
        }

        // Update FareSourceCode cache if a new one was returned
        const newFareSourceCode = fareInfo.FareSourceCode || revalData.FareSourceCode;
        if (newFareSourceCode && newFareSourceCode !== fareSourceCode) {
            fareSourceCache.set(params.offerId, newFareSourceCode);
            console.log('[Mystifly] Updated FareSourceCode after revalidation');
        }

        const updatedPrice: FlightPrice = { total, base, taxes, currency, pricePerAdult };

        console.log(`[Mystifly] Revalidation complete — available: true, priceChanged: ${priceChanged}, total: ${currency} ${total}`);

        return {
            available: true,
            offerId: params.offerId,
            price: updatedPrice,
            priceChanged,
        };
    }

    async createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
        throw new FlightProviderError(
            'createBooking not yet implemented for Mystifly',
            'mystifly',
            'BOOKING_FAILED',
        );
    }

    async issueTicket(params: IssueTicketParams): Promise<IssueTicketResult> {
        throw new FlightProviderError(
            'issueTicket not yet implemented for Mystifly',
            'mystifly',
            'TICKETING_FAILED',
        );
    }
}
