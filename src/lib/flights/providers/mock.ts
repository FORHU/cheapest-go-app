/**
 * Mock Flight Provider
 * 
 * Generates realistic flight offers for development and testing.
 * Always enabled when no real providers are configured.
 */

import type { FlightProvider } from '../provider';
import type {
    FlightSearchRequest,
    FlightSearchResponse,
    FlightOffer,
    FlightSegmentDetail,
    CabinClass,
} from '../types';
import { AIRLINES, getAirlineName } from '../types';

// ─── Mock Airlines by Route Region ───────────────────────────────────

const ASIA_AIRLINES = ['KE', 'OZ', 'PR', '5J', 'SQ', 'CX', 'TG', 'JL', 'NH', 'VN', 'GA', 'MH', 'BR', 'CI'];
const US_AIRLINES = ['AA', 'DL', 'UA', 'AS', 'HA'];
const EU_AIRLINES = ['BA', 'LH', 'AF', 'KL', 'TK', 'IB', 'LX'];
const ME_AIRLINES = ['EK', 'QR', 'EY', 'SV', 'TK'];

function getRouteAirlines(origin: string, dest: string): string[] {
    const asiaAirports = ['MNL', 'CEB', 'ICN', 'GMP', 'NRT', 'HND', 'KIX', 'SIN', 'BKK', 'HKG', 'TPE', 'PVG', 'PEK', 'CAN', 'KUL', 'SGN', 'HAN', 'DPS', 'CJU', 'FUK', 'CRK', 'DVO'];
    const usAirports = ['JFK', 'LAX', 'SFO', 'ORD', 'ATL', 'DFW', 'MIA', 'SEA', 'DEN', 'BOS', 'HNL', 'EWR', 'LGA'];
    const euAirports = ['LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'BCN', 'FCO', 'MUC', 'VIE', 'ZRH'];
    const meAirports = ['DXB', 'DOH', 'AUH', 'JED', 'IST'];

    const isAsiaOrigin = asiaAirports.includes(origin);
    const isAsiaDest = asiaAirports.includes(dest);
    const isUsOrigin = usAirports.includes(origin);
    const isUsDest = usAirports.includes(dest);
    const isEuOrigin = euAirports.includes(origin);
    const isEuDest = euAirports.includes(dest);
    const isMeOrigin = meAirports.includes(origin);
    const isMeDest = meAirports.includes(dest);

    // Both in Asia
    if (isAsiaOrigin && isAsiaDest) return ASIA_AIRLINES;
    // Both in US
    if (isUsOrigin && isUsDest) return US_AIRLINES;
    // Both in EU
    if (isEuOrigin && isEuDest) return EU_AIRLINES;
    // Asia ↔ US
    if ((isAsiaOrigin && isUsDest) || (isUsOrigin && isAsiaDest)) return [...ASIA_AIRLINES.slice(0, 4), ...US_AIRLINES.slice(0, 3)];
    // Asia ↔ EU
    if ((isAsiaOrigin && isEuDest) || (isEuOrigin && isAsiaDest)) return [...ASIA_AIRLINES.slice(0, 3), ...EU_AIRLINES.slice(0, 3), ...ME_AIRLINES.slice(0, 2)];
    // Middle East connector
    if (isMeOrigin || isMeDest) return ME_AIRLINES;

    // Fallback: mix
    return [...ASIA_AIRLINES.slice(0, 3), ...US_AIRLINES.slice(0, 2), ...EU_AIRLINES.slice(0, 2)];
}

// ─── Random Helpers ──────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

// ─── Price Generation ────────────────────────────────────────────────

const CABIN_MULTIPLIERS: Record<CabinClass, number> = {
    economy: 1,
    premium_economy: 1.6,
    business: 3.2,
    first: 5.5,
};

function generatePrice(origin: string, dest: string, cabin: CabinClass, passengers: { adults: number; children: number; infants: number }) {
    // Base price varies by route distance (simplified)
    const domestic = origin.slice(0, 1) === dest.slice(0, 1); // crude same-region check
    const basePerAdult = domestic
        ? randomInt(80, 250)
        : randomInt(300, 1200);

    const cabinPrice = Math.round(basePerAdult * CABIN_MULTIPLIERS[cabin]);
    const childPrice = Math.round(cabinPrice * 0.75);
    const infantPrice = Math.round(cabinPrice * 0.1);

    const totalBase = (cabinPrice * passengers.adults) + (childPrice * passengers.children) + (infantPrice * passengers.infants);
    const taxes = Math.round(totalBase * 0.12);
    const total = totalBase + taxes;

    return {
        total,
        base: totalBase,
        taxes,
        currency: 'USD',
        pricePerAdult: cabinPrice + Math.round(cabinPrice * 0.12),
    };
}

// ─── Segment Generation ─────────────────────────────────────────────

function generateSegments(
    origin: string,
    dest: string,
    date: string,
    airlineCode: string,
    cabin: CabinClass,
    stops: number
): FlightSegmentDetail[] {
    const segments: FlightSegmentDetail[] = [];
    const stopAirports = ['SIN', 'HKG', 'ICN', 'NRT', 'DXB', 'DOH', 'IST', 'FRA', 'LHR', 'ORD'];

    let currentOrigin = origin;
    const departHour = randomInt(6, 22);
    const departMinute = randomChoice([0, 15, 30, 45]);
    let currentTime = new Date(`${date}T${String(departHour).padStart(2, '0')}:${String(departMinute).padStart(2, '0')}:00`);

    for (let i = 0; i <= stops; i++) {
        const isLast = i === stops;
        const segDest = isLast ? dest : randomChoice(stopAirports.filter(a => a !== currentOrigin && a !== dest));
        const duration = stops === 0 ? randomInt(90, 720) : randomInt(90, 360);

        const departureTime = new Date(currentTime);
        const arrivalTime = new Date(departureTime.getTime() + duration * 60 * 1000);

        segments.push({
            segmentIndex: i,
            airline: { code: airlineCode, name: getAirlineName(airlineCode) },
            flightNumber: `${airlineCode}${randomInt(100, 999)}`,
            departure: {
                airport: currentOrigin,
                time: departureTime.toISOString(),
                terminal: randomChoice(['1', '2', '3', undefined]),
            },
            arrival: {
                airport: segDest,
                time: arrivalTime.toISOString(),
                terminal: randomChoice(['1', '2', 'A', 'B', undefined]),
            },
            duration,
            stops: 0,
            aircraft: randomChoice(['Boeing 777-300ER', 'Airbus A350-900', 'Boeing 787-9', 'Airbus A321neo', 'Boeing 737-800']),
            cabinClass: cabin,
        });

        currentOrigin = segDest;
        // Add layover time (45min–3hr)
        currentTime = new Date(arrivalTime.getTime() + randomInt(45, 180) * 60 * 1000);
    }

    return segments;
}

// ─── Mock Provider ───────────────────────────────────────────────────

export class MockProvider implements FlightProvider {
    readonly name = 'mock';
    readonly displayName = 'Mock Provider';
    readonly enabled = true;

    async search(request: FlightSearchRequest): Promise<FlightSearchResponse> {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, randomInt(200, 600)));

        const offers: FlightOffer[] = [];
        const airlines = getRouteAirlines(request.segments[0].origin, request.segments[0].destination);

        // Generate 8-15 offers per segment set
        const numOffers = randomInt(8, 15);

        for (let i = 0; i < numOffers; i++) {
            const airlineCode = randomChoice(airlines);
            const stops = randomChoice([0, 0, 0, 1, 1, 2]); // Bias toward nonstop

            // Build segments for each search segment
            const allSegments: FlightSegmentDetail[] = [];
            let segIdx = 0;

            for (const seg of request.segments) {
                const legSegments = generateSegments(
                    seg.origin,
                    seg.destination,
                    seg.departureDate,
                    airlineCode,
                    request.cabinClass,
                    stops,
                );
                // Adjust segment indices
                for (const s of legSegments) {
                    s.segmentIndex = segIdx++;
                    allSegments.push(s);
                }
            }

            const totalDuration = allSegments.reduce((sum, s) => sum + s.duration, 0);
            const price = generatePrice(
                request.segments[0].origin,
                request.segments[0].destination,
                request.cabinClass,
                request.passengers,
            );

            offers.push({
                offerId: `mock_${generateId()}`,
                provider: 'mock',
                price,
                segments: allSegments,
                totalDuration,
                totalStops: stops,
                refundable: randomChoice([true, false, false]),
                baggage: {
                    checkedBags: request.cabinClass === 'economy' ? randomChoice([0, 1]) : 2,
                    weightPerBag: 23,
                    cabinBag: '7kg carry-on',
                },
                seatsRemaining: randomChoice([undefined, randomInt(1, 9)]),
            });
        }

        // Sort by price
        offers.sort((a, b) => a.price.total - b.price.total);

        return {
            offers: offers.slice(0, request.maxOffers || 20),
            metadata: {
                provider: 'mock',
                searchId: `mock_search_${generateId()}`,
                timestamp: new Date().toISOString(),
                totalResults: offers.length,
            },
        };
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
