import type { FlightProvider } from '../provider';
import type {
    FlightSearchRequest,
    FlightSearchResponse,
    FlightOffer,
    FlightSegmentDetail,
    FlightPrice,
    CabinClass,
} from '../types';
import { getAirlineName } from '../types';

// ─── Configuration ───────────────────────────────────────────────────

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || '';
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || '';
const AMADEUS_BASE_URL = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

// ─── OAuth2 Token Management ─────────────────────────────────────────

interface AmadeusToken {
    accessToken: string;
    expiresAt: number; // Unix timestamp in ms
}

let cachedToken: AmadeusToken | null = null;

async function getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
        return cachedToken.accessToken;
    }

    const res = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: AMADEUS_API_KEY,
            client_secret: AMADEUS_API_SECRET,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Amadeus OAuth failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };

    console.log('[Amadeus] Token refreshed, expires in', data.expires_in, 's');
    return cachedToken.accessToken;
}

// ─── Cabin Class Mapping ─────────────────────────────────────────────

const CABIN_MAP: Record<CabinClass, string> = {
    economy: 'ECONOMY',
    premium_economy: 'PREMIUM_ECONOMY',
    business: 'BUSINESS',
    first: 'FIRST',
};

const CABIN_REVERSE: Record<string, CabinClass> = {
    ECONOMY: 'economy',
    PREMIUM_ECONOMY: 'premium_economy',
    BUSINESS: 'business',
    FIRST: 'first',
};

// ─── Response Normalization ──────────────────────────────────────────

function normalizeOffer(raw: any, index: number): FlightOffer {
    const segments: FlightSegmentDetail[] = [];
    let segIdx = 0;
    let totalStops = 0;
    let totalDuration = 0;

    for (const itinerary of raw.itineraries || []) {
        for (const seg of itinerary.segments || []) {
            const depTime = new Date(seg.departure.at);
            const arrTime = new Date(seg.arrival.at);
            const durationMinutes = Math.round((arrTime.getTime() - depTime.getTime()) / 60_000);
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
                duration: durationMinutes,
                stops,
                aircraft: seg.aircraft?.code,
                cabinClass: CABIN_REVERSE[seg.cabin] || 'economy',
            });

            totalStops += stops;
            totalDuration += durationMinutes;
        }
    }

    // Parse price
    const rawPrice = raw.price || {};
    const total = parseFloat(rawPrice.grandTotal || rawPrice.total || '0');
    const base = parseFloat(rawPrice.base || '0');
    const taxes = total - base;
    const adultCount = (raw.travelerPricings || []).filter((t: any) => t.travelerType === 'ADULT').length || 1;

    const price: FlightPrice = {
        total,
        base,
        taxes: Math.max(0, taxes),
        currency: rawPrice.currency || 'USD',
        pricePerAdult: Math.round(total / adultCount),
    };

    // Check refundability from fare rules
    const refundable = (raw.pricingOptions?.fareType || []).includes('PUBLISHED');

    return {
        offerId: `amadeus_${raw.id || index}`,
        provider: 'amadeus',
        price,
        segments,
        totalDuration,
        totalStops,
        refundable,
        baggage: normalizeBaggage(raw),
        seatsRemaining: raw.numberOfBookableSeats,
    };
}

function normalizeBaggage(raw: any): FlightOffer['baggage'] {
    try {
        const firstPricing = raw.travelerPricings?.[0];
        const firstSegPricing = firstPricing?.fareDetailsBySegment?.[0];
        const bags = firstSegPricing?.includedCheckedBags;
        if (bags) {
            return {
                checkedBags: bags.quantity || (bags.weight ? 1 : 0),
                weightPerBag: bags.weight,
                cabinBag: firstSegPricing?.cabin || undefined,
            };
        }
    } catch {
        // Ignore parse errors
    }
    return undefined;
}

// ─── Amadeus Provider ────────────────────────────────────────────────

export class AmadeusProvider implements FlightProvider {
    readonly name = 'amadeus';
    readonly displayName = 'Amadeus';
    readonly enabled: boolean;

    constructor() {
        this.enabled = !!(AMADEUS_API_KEY && AMADEUS_API_SECRET);
        if (!this.enabled) {
            console.log('[Amadeus] Disabled — missing AMADEUS_API_KEY or AMADEUS_API_SECRET');
        }
    }

    async search(request: FlightSearchRequest): Promise<FlightSearchResponse> {
        const token = await getAccessToken();

        // Build request body for Flight Offers Search v2
        const body = this.buildSearchBody(request);

        const res = await fetch(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error('[Amadeus] Search failed:', res.status, errorText);
            throw new Error(`Amadeus search failed: ${res.status}`);
        }

        const data = await res.json();
        const rawOffers = data.data || [];

        const offers: FlightOffer[] = rawOffers.map(
            (raw: any, i: number) => normalizeOffer(raw, i)
        );

        // Sort by price
        offers.sort((a, b) => a.price.total - b.price.total);

        return {
            offers: offers.slice(0, request.maxOffers || 50),
            metadata: {
                provider: 'amadeus',
                searchId: data.meta?.count ? `amadeus_${Date.now()}` : `amadeus_${Date.now()}`,
                timestamp: new Date().toISOString(),
                totalResults: rawOffers.length,
            },
        };
    }

    private buildSearchBody(request: FlightSearchRequest) {
        // Build origin-destination pairs
        const originDestinations = request.segments.map((seg, i) => ({
            id: String(i + 1),
            originLocationCode: seg.origin,
            destinationLocationCode: seg.destination,
            departureDateTimeRange: { date: seg.departureDate },
        }));

        // Build travelers
        const travelers: any[] = [];
        let travelerId = 1;

        for (let i = 0; i < request.passengers.adults; i++) {
            travelers.push({ id: String(travelerId++), travelerType: 'ADULT' });
        }
        for (let i = 0; i < request.passengers.children; i++) {
            travelers.push({ id: String(travelerId++), travelerType: 'CHILD' });
        }
        for (let i = 0; i < request.passengers.infants; i++) {
            travelers.push({
                id: String(travelerId++),
                travelerType: 'SEATED_INFANT',
                associatedAdultId: String(i + 1), // Associate with adult
            });
        }

        return {
            currencyCode: request.currency || 'USD',
            originDestinations,
            travelers,
            sources: ['GDS'],
            searchCriteria: {
                maxFlightOffers: request.maxOffers || 50,
                flightFilters: {
                    cabinRestrictions: [{
                        cabin: CABIN_MAP[request.cabinClass],
                        coverage: 'MOST_SEGMENTS',
                        originDestinationIds: originDestinations.map(od => od.id),
                    }],
                },
            },
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            await getAccessToken();
            return true;
        } catch {
            return false;
        }
    }
}
