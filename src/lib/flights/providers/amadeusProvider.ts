import type {
    FlightSearchResponse,
    FlightOffer,
    FlightSegmentDetail,
    FlightPrice,
    CabinClass,
} from '../types';
import { getAirlineName } from '../types';
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

const API_KEY = process.env.AMADEUS_API_KEY || '';
const API_SECRET = process.env.AMADEUS_API_SECRET || '';
const BASE_URL = process.env.AMADEUS_BASE_URL || '';

// ─── OAuth2 Token Cache ──────────────────────────────────────────────

interface TokenCache {
    accessToken: string;
    expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function authenticate(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
        return tokenCache.accessToken;
    }

    const res = await fetch(`${BASE_URL}/v1/security/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: API_KEY,
            client_secret: API_SECRET,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new FlightProviderError(
            `OAuth failed: ${res.status} ${text}`,
            'amadeus',
            'AUTH_FAILURE',
            res.status,
        );
    }

    const data = await res.json();
    tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
    return tokenCache.accessToken;
}

// ─── Cabin Mapping ───────────────────────────────────────────────────

const CABIN_TO_AMADEUS: Record<CabinClass, string> = {
    economy: 'ECONOMY',
    premium_economy: 'PREMIUM_ECONOMY',
    business: 'BUSINESS',
    first: 'FIRST',
};

const AMADEUS_TO_CABIN: Record<string, CabinClass> = {
    ECONOMY: 'economy',
    PREMIUM_ECONOMY: 'premium_economy',
    BUSINESS: 'business',
    FIRST: 'first',
};

// ─── Response Normalization ──────────────────────────────────────────

function normalizeOffer(raw: any, idx: number): FlightOffer {
    const segments: FlightSegmentDetail[] = [];
    let segIdx = 0;
    let totalStops = 0;
    let totalDuration = 0;

    for (const itinerary of raw.itineraries || []) {
        for (const seg of itinerary.segments || []) {
            const dep = new Date(seg.departure.at);
            const arr = new Date(seg.arrival.at);
            const mins = Math.round((arr.getTime() - dep.getTime()) / 60_000);
            const stops = seg.numberOfStops || 0;

            segments.push({
                segmentIndex: segIdx++,
                airline: {
                    code: seg.carrierCode || seg.operating?.carrierCode || '',
                    name: getAirlineName(seg.carrierCode || ''),
                },
                flightNumber: `${seg.carrierCode}${seg.number}`,
                departure: {
                    airport: seg.departure.iataCode,
                    terminal: seg.departure.terminal,
                    time: seg.departure.at,
                },
                arrival: {
                    airport: seg.arrival.iataCode,
                    terminal: seg.arrival.terminal,
                    time: seg.arrival.at,
                },
                duration: mins,
                stops,
                aircraft: seg.aircraft?.code,
                cabinClass: AMADEUS_TO_CABIN[seg.cabin] || 'economy',
            });

            totalStops += stops;
            totalDuration += mins;
        }
    }

    const rawPrice = raw.price || {};
    const total = parseFloat(rawPrice.grandTotal || rawPrice.total || '0');
    const base = parseFloat(rawPrice.base || '0');
    const taxes = Math.max(0, total - base);
    const adultCount = (raw.travelerPricings || [])
        .filter((t: any) => t.travelerType === 'ADULT').length || 1;

    const price: FlightPrice = {
        total,
        base,
        taxes,
        currency: rawPrice.currency || 'USD',
        pricePerAdult: Math.round(total / adultCount),
    };

    const refundable = (raw.pricingOptions?.fareType || []).includes('PUBLISHED');

    let baggage: FlightOffer['baggage'];
    try {
        const firstPricing = raw.travelerPricings?.[0];
        const segPricing = firstPricing?.fareDetailsBySegment?.[0];
        const bags = segPricing?.includedCheckedBags;
        if (bags) {
            baggage = {
                checkedBags: bags.quantity || (bags.weight ? 1 : 0),
                weightPerBag: bags.weight,
                cabinBag: segPricing?.cabin,
            };
        }
    } catch { /* ignore */ }

    return {
        offerId: `amadeus_${raw.id || idx}`,
        provider: 'amadeus',
        price,
        segments,
        totalDuration,
        totalStops,
        refundable,
        baggage,
        seatsRemaining: raw.numberOfBookableSeats,
    };
}

// ─── Provider ────────────────────────────────────────────────────────

export class AmadeusProvider implements IFlightProvider {
    readonly name = 'amadeus';
    readonly displayName = 'Amadeus GDS';
    readonly enabled: boolean;
    readonly priority = 1;

    constructor() {
        this.enabled = !!(API_KEY && API_SECRET);
    }

    // Search flights using Amadeus Flight Offers Search v2 (POST).
    // Normalizes each raw offer into the unified FlightOffer shape.
    async searchFlights(params: SearchFlightsParams): Promise<FlightSearchResponse> {
        const token = await authenticate();

        const originDestinations = params.segments.map((seg, i) => ({
            id: String(i + 1),
            originLocationCode: seg.origin,
            destinationLocationCode: seg.destination,
            departureDateTimeRange: { date: seg.departureDate },
        }));

        const travelers: any[] = [];
        let tid = 1;
        for (let i = 0; i < params.passengers.adults; i++) travelers.push({ id: String(tid++), travelerType: 'ADULT' });
        for (let i = 0; i < params.passengers.children; i++) travelers.push({ id: String(tid++), travelerType: 'CHILD' });
        for (let i = 0; i < params.passengers.infants; i++) {
            travelers.push({ id: String(tid++), travelerType: 'SEATED_INFANT', associatedAdultId: String(i + 1) });
        }

        const body: any = {
            currencyCode: params.currency || 'USD',
            originDestinations,
            travelers,
            sources: ['GDS'],
            searchCriteria: {
                maxFlightOffers: params.maxOffers || 50,
                flightFilters: {
                    cabinRestrictions: [{
                        cabin: CABIN_TO_AMADEUS[params.cabinClass],
                        coverage: 'MOST_SEGMENTS',
                        originDestinationIds: originDestinations.map(od => od.id),
                    }],
                },
            },
        };

        if (params.nonStopOnly) {
            body.searchCriteria.flightFilters.connectionRestriction = { maxNumberOfConnections: 0 };
        }

        if (params.maxPrice) {
            body.searchCriteria.flightFilters.maxPrice = params.maxPrice;
        }

        const res = await fetch(`${BASE_URL}/v2/shopping/flight-offers`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorText = await res.text();
            const code = res.status === 429 ? 'RATE_LIMIT' : res.status === 401 ? 'AUTH_FAILURE' : 'PROVIDER_ERROR';
            throw new FlightProviderError(
                `Amadeus search failed: ${res.status} ${errorText}`,
                'amadeus',
                code,
                res.status,
                res.status === 429,
            );
        }

        const data = await res.json();
        const rawOffers = data.data || [];
        const offers = rawOffers.map((raw: any, i: number) => normalizeOffer(raw, i));
        offers.sort((a: FlightOffer, b: FlightOffer) => a.price.total - b.price.total);

        return {
            offers: offers.slice(0, params.maxOffers || 50),
            metadata: {
                provider: 'amadeus',
                searchId: `amadeus_${Date.now()}`,
                timestamp: new Date().toISOString(),
                totalResults: rawOffers.length,
            },
        };
    }

    // Retrieve full details for an offer including fare rules.
    // Uses the Amadeus Flight Offers Price API to get the latest fare conditions.
    async getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails> {
        // TODO: call GET /v2/shopping/flight-offers/{id} or
        //       POST /v1/shopping/flight-offers/pricing with include=detailed-fare-rules
        throw new FlightProviderError(
            'getFlightDetails not yet implemented for Amadeus',
            'amadeus',
            'PROVIDER_ERROR',
        );
    }

    // Reprice an existing offer to confirm current availability and price.
    // Uses POST /v1/shopping/flight-offers/pricing.
    async revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult> {
        // TODO: POST /v1/shopping/flight-offers/pricing with the cached offer body
        throw new FlightProviderError(
            'revalidateFlightPrice not yet implemented for Amadeus',
            'amadeus',
            'PROVIDER_ERROR',
        );
    }

    // Create a PNR booking using the Amadeus Flight Orders API.
    // POST /v1/booking/flight-orders
    async createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
        // TODO: POST /v1/booking/flight-orders
        throw new FlightProviderError(
            'createBooking not yet implemented for Amadeus',
            'amadeus',
            'BOOKING_FAILED',
        );
    }

    // Issue tickets for a confirmed booking.
    // Amadeus sandbox does not support real ticketing — this will be used in production only.
    async issueTicket(params: IssueTicketParams): Promise<IssueTicketResult> {
        // TODO: call ticketing endpoint or partner-specific issuance flow
        throw new FlightProviderError(
            'issueTicket not yet implemented for Amadeus',
            'amadeus',
            'TICKETING_FAILED',
        );
    }
}
