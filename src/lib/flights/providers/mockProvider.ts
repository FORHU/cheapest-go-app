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

// ─── Helpers ─────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function uid(): string {
    return Math.random().toString(36).substring(2, 10);
}

function fakePnr(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let pnr = '';
    for (let i = 0; i < 6; i++) pnr += chars[randomInt(0, 25)];
    return pnr;
}

function fakeTicketNumber(): string {
    return `${randomInt(100, 999)}-${randomInt(1000000000, 9999999999)}`;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Data ────────────────────────────────────────────────────────────

const ASIA_AIRLINES = ['KE', 'OZ', 'PR', '5J', 'SQ', 'CX', 'TG', 'JL', 'NH', 'VN', 'GA', 'MH', 'BR', 'CI'];
const US_AIRLINES = ['AA', 'DL', 'UA', 'AS', 'HA'];
const EU_AIRLINES = ['BA', 'LH', 'AF', 'KL', 'TK', 'IB', 'LX'];
const ME_AIRLINES = ['EK', 'QR', 'EY', 'SV', 'TK'];

const ASIA_AIRPORTS = ['MNL', 'CEB', 'ICN', 'GMP', 'NRT', 'HND', 'KIX', 'SIN', 'BKK', 'HKG', 'TPE', 'PVG', 'PEK', 'KUL', 'SGN', 'DPS', 'CJU'];
const US_AIRPORTS = ['JFK', 'LAX', 'SFO', 'ORD', 'ATL', 'DFW', 'MIA', 'SEA', 'DEN', 'BOS', 'HNL', 'EWR'];
const EU_AIRPORTS = ['LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'BCN', 'FCO', 'MUC', 'VIE', 'ZRH'];
const ME_AIRPORTS = ['DXB', 'DOH', 'AUH', 'JED', 'IST'];
const STOP_AIRPORTS = ['SIN', 'HKG', 'ICN', 'NRT', 'DXB', 'DOH', 'IST', 'FRA', 'LHR', 'ORD'];
const AIRCRAFT = ['Boeing 777-300ER', 'Airbus A350-900', 'Boeing 787-9', 'Airbus A321neo', 'Boeing 737-800', 'Airbus A380-800'];

const CABIN_MULT: Record<CabinClass, number> = { economy: 1, premium_economy: 1.6, business: 3.2, first: 5.5 };

function routeAirlines(origin: string, dest: string): string[] {
    const isAsiaO = ASIA_AIRPORTS.includes(origin);
    const isAsiaD = ASIA_AIRPORTS.includes(dest);
    const isUsO = US_AIRPORTS.includes(origin);
    const isUsD = US_AIRPORTS.includes(dest);
    const isEuO = EU_AIRPORTS.includes(origin);
    const isEuD = EU_AIRPORTS.includes(dest);
    const isMeO = ME_AIRPORTS.includes(origin);
    const isMeD = ME_AIRPORTS.includes(dest);

    if (isAsiaO && isAsiaD) return ASIA_AIRLINES;
    if (isUsO && isUsD) return US_AIRLINES;
    if (isEuO && isEuD) return EU_AIRLINES;
    if ((isAsiaO && isUsD) || (isUsO && isAsiaD)) return [...ASIA_AIRLINES.slice(0, 4), ...US_AIRLINES.slice(0, 3)];
    if ((isAsiaO && isEuD) || (isEuO && isAsiaD)) return [...ASIA_AIRLINES.slice(0, 3), ...EU_AIRLINES.slice(0, 3), ...ME_AIRLINES.slice(0, 2)];
    if (isMeO || isMeD) return ME_AIRLINES;
    return [...ASIA_AIRLINES.slice(0, 3), ...US_AIRLINES.slice(0, 2), ...EU_AIRLINES.slice(0, 2)];
}

// ─── Generator Functions ─────────────────────────────────────────────

function generatePrice(
    origin: string, dest: string, cabin: CabinClass,
    passengers: { adults: number; children: number; infants: number },
): FlightPrice {
    const sameRegion =
        (ASIA_AIRPORTS.includes(origin) && ASIA_AIRPORTS.includes(dest)) ||
        (US_AIRPORTS.includes(origin) && US_AIRPORTS.includes(dest)) ||
        (EU_AIRPORTS.includes(origin) && EU_AIRPORTS.includes(dest));
    const basePerAdult = sameRegion ? randomInt(80, 300) : randomInt(350, 1400);
    const cabinPrice = Math.round(basePerAdult * CABIN_MULT[cabin]);
    const childPrice = Math.round(cabinPrice * 0.75);
    const infantPrice = Math.round(cabinPrice * 0.1);
    const totalBase = (cabinPrice * passengers.adults) + (childPrice * passengers.children) + (infantPrice * passengers.infants);
    const taxes = Math.round(totalBase * randomInt(8, 15) / 100);
    return {
        total: totalBase + taxes,
        base: totalBase,
        taxes,
        currency: 'USD',
        pricePerAdult: cabinPrice + Math.round(cabinPrice * 0.12),
    };
}

function generateSegments(
    origin: string, dest: string, date: string,
    airline: string, cabin: CabinClass, stops: number,
): FlightSegmentDetail[] {
    const segments: FlightSegmentDetail[] = [];
    let current = origin;
    const hr = randomInt(5, 22);
    const mn = pick([0, 15, 30, 45]);
    let time = new Date(`${date}T${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}:00`);

    for (let i = 0; i <= stops; i++) {
        const isLast = i === stops;
        const segDest = isLast ? dest : pick(STOP_AIRPORTS.filter(a => a !== current && a !== dest));
        const dur = stops === 0 ? randomInt(90, 780) : randomInt(90, 400);
        const dep = new Date(time);
        const arr = new Date(dep.getTime() + dur * 60_000);

        segments.push({
            segmentIndex: i,
            airline: { code: airline, name: getAirlineName(airline) },
            flightNumber: `${airline}${randomInt(100, 9999)}`,
            departure: { airport: current, time: dep.toISOString(), terminal: pick(['1', '2', '3', undefined]) },
            arrival: { airport: segDest, time: arr.toISOString(), terminal: pick(['1', '2', 'A', 'B', undefined]) },
            duration: dur,
            stops: 0,
            aircraft: pick(AIRCRAFT),
            cabinClass: cabin,
        });

        current = segDest;
        time = new Date(arr.getTime() + randomInt(50, 200) * 60_000);
    }

    return segments;
}

// ─── In-memory offer cache (so getFlightDetails / revalidate can look up) ──

const offerCache = new Map<string, FlightOffer>();

// ─── Provider ────────────────────────────────────────────────────────

export class MockProvider implements IFlightProvider {
    readonly name = 'mock';
    readonly displayName = 'Mock Provider';
    readonly enabled = true;
    readonly priority = 99;

    // Generate 8–15 realistic fake flight offers with a 2–4 second simulated delay.
    async searchFlights(params: SearchFlightsParams): Promise<FlightSearchResponse> {
        await delay(randomInt(2000, 4000));

        const airlines = routeAirlines(params.segments[0].origin, params.segments[0].destination);
        const count = randomInt(8, 15);
        const offers: FlightOffer[] = [];

        for (let i = 0; i < count; i++) {
            const airline = pick(airlines);
            const stops = params.nonStopOnly ? 0 : pick([0, 0, 0, 1, 1, 2]);
            const allSegs: FlightSegmentDetail[] = [];
            let segIdx = 0;

            for (const seg of params.segments) {
                const legSegs = generateSegments(seg.origin, seg.destination, seg.departureDate, airline, params.cabinClass, stops);
                for (const s of legSegs) {
                    s.segmentIndex = segIdx++;
                    allSegs.push(s);
                }
            }

            const totalDuration = allSegs.reduce((sum, s) => sum + s.duration, 0);
            const price = generatePrice(params.segments[0].origin, params.segments[0].destination, params.cabinClass, params.passengers);

            if (params.maxPrice && price.total > params.maxPrice) continue;

            const offer: FlightOffer = {
                offerId: `mock_${uid()}`,
                provider: 'mock',
                price,
                segments: allSegs,
                totalDuration,
                totalStops: stops,
                refundable: pick([true, false, false]),
                baggage: {
                    checkedBags: params.cabinClass === 'economy' ? pick([0, 1]) : 2,
                    weightPerBag: 23,
                    cabinBag: '7kg carry-on',
                },
                seatsRemaining: pick([undefined, randomInt(1, 9)]),
            };

            offerCache.set(offer.offerId, offer);
            offers.push(offer);
        }

        offers.sort((a, b) => a.price.total - b.price.total);

        return {
            offers: offers.slice(0, params.maxOffers || 20),
            metadata: {
                provider: 'mock',
                searchId: `mock_search_${uid()}`,
                timestamp: new Date().toISOString(),
                totalResults: offers.length,
            },
        };
    }

    // Return full details for a previously-searched offer with generated fare rules.
    async getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails> {
        await delay(randomInt(500, 1500));

        const offer = offerCache.get(params.offerId);
        if (!offer) {
            throw new Error(`Offer ${params.offerId} not found or expired`);
        }

        const deadline = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

        return {
            ...offer,
            fareRules: {
                changePolicy: {
                    allowed: true,
                    fee: { amount: randomInt(30, 150), currency: 'USD' },
                    deadline,
                },
                cancellationPolicy: {
                    allowed: offer.refundable,
                    fee: offer.refundable ? { amount: randomInt(50, 200), currency: 'USD' } : undefined,
                    deadline: offer.refundable ? deadline : undefined,
                },
                refundable: offer.refundable,
            },
            minConnectionTime: offer.totalStops > 0 ? randomInt(45, 120) : undefined,
            lastValidated: new Date().toISOString(),
            ttl: 1800,
        };
    }

    // Re-check price for an offer. Has a 20% chance of a small price change to simulate volatility.
    async revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult> {
        await delay(randomInt(800, 2000));

        const offer = offerCache.get(params.offerId);
        if (!offer) {
            return { available: false, offerId: params.offerId, price: { total: 0, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 }, priceChanged: false };
        }

        const priceShift = Math.random() < 0.2;
        let newPrice = { ...offer.price };

        if (priceShift) {
            const delta = randomInt(-50, 80);
            newPrice = {
                ...newPrice,
                total: Math.max(50, newPrice.total + delta),
                base: Math.max(30, newPrice.base + Math.round(delta * 0.85)),
                taxes: Math.max(5, newPrice.taxes + Math.round(delta * 0.15)),
                pricePerAdult: Math.max(30, newPrice.pricePerAdult + delta),
            };
        }

        return {
            available: true,
            offerId: params.offerId,
            price: newPrice,
            priceChanged: priceShift,
            originalPrice: priceShift ? offer.price : undefined,
            ttl: 900,
        };
    }

    // Create a mock booking with a fake PNR and a 24-hour ticketing deadline.
    async createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
        await delay(randomInt(1500, 3000));

        const offer = offerCache.get(params.offerId);
        if (!offer) {
            return {
                success: false,
                bookingId: '',
                pnr: '',
                status: 'failed',
                price: { total: 0, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
                error: 'Offer expired or not found',
            };
        }

        return {
            success: true,
            bookingId: `MBK${Date.now()}`,
            pnr: fakePnr(),
            status: 'held',
            ticketingDeadline: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
            price: offer.price,
        };
    }

    // Issue fake e-tickets (one per passenger) and return a mock ticketing result.
    async issueTicket(params: IssueTicketParams): Promise<IssueTicketResult> {
        await delay(randomInt(2000, 4000));

        const ticketCount = randomInt(1, 4);
        const tickets: string[] = [];
        for (let i = 0; i < ticketCount; i++) {
            tickets.push(fakeTicketNumber());
        }

        return {
            success: true,
            bookingId: params.bookingId,
            pnr: params.pnr,
            status: 'ticketed',
            ticketNumbers: tickets,
            totalPaid: randomInt(200, 2000),
            currency: 'USD',
        };
    }
}
