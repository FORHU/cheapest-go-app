/**
 * Mystifly API Client for Node.js (Next.js server-side).
 *
 * Direct HTTP calls to Mystifly — no Supabase Edge Function hop.
 * Session is cached in module-level memory (persists across requests
 * within the same serverless instance, reducing auth overhead).
 */

import { env } from '@/utils/env';

// ─── Config ──────────────────────────────────────────────────────────

const SESSION_TTL_MS = 55 * 60 * 1000; // refresh 5 min before 60-min expiry
const FETCH_TIMEOUT_MS = 9_000;
const MAX_RETRIES = 2;

// ─── Session Cache ────────────────────────────────────────────────────

interface SessionCache {
    sessionId: string;
    createdAt: number;
}

let sessionCache: SessionCache | null = null;

async function createSession(): Promise<string> {
    if (sessionCache && Date.now() - sessionCache.createdAt < SESSION_TTL_MS) {
        return sessionCache.sessionId;
    }

    const baseUrl = env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com';
    const res = await fetchWithTimeout(`${baseUrl}/api/CreateSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            UserName: env.MYSTIFLY_USERNAME,
            Password: env.MYSTIFLY_PASSWORD,
            AccountNumber: env.MYSTIFLY_ACCOUNT_NUMBER,
        }),
    });

    if (!res.ok) {
        throw new Error(`Mystifly CreateSession failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.Success || !data.Data?.SessionId) {
        throw new Error(`Mystifly CreateSession failed: ${data.Message ?? 'No SessionId'}`);
    }

    sessionCache = { sessionId: data.Data.SessionId, createdAt: Date.now() };
    console.log('[MystiflyClient] Session acquired:', sessionCache.sessionId.slice(0, 8) + '…');
    return sessionCache.sessionId;
}

function clearSessionCache() {
    sessionCache = null;
}

function getMystiflyTarget(): 'Production' | 'Test' {
    return (env.MYSTIFLY_ENV || '').toLowerCase() === 'test' ? 'Test' : 'Production';
}

// ─── Core Request ─────────────────────────────────────────────────────

export async function mystiflyRequest<T = any>(
    endpoint: string,
    body: Record<string, any>,
): Promise<T> {
    const baseUrl = env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com';
    const target = body.Target ?? getMystiflyTarget();
    const conversationId = crypto.randomUUID();

    let sid = await createSession();

    const finalBody = { ...body, Target: target, ConversationId: conversationId };

    const buildInit = (s: string): RequestInit => ({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s}`,
            'ConversationId': conversationId,
        },
        body: JSON.stringify(finalBody),
    });

    let res = await fetchWithRetry(`${baseUrl}${endpoint}`, buildInit(sid));

    // Refresh session on 401 and retry once
    if (res.status === 401) {
        console.warn('[MystiflyClient] 401 — refreshing session');
        clearSessionCache();
        sid = await createSession();
        res = await fetchWithRetry(`${baseUrl}${endpoint}`, buildInit(sid));
    }

    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`Mystifly ${endpoint} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
        throw new Error(`Mystifly ${endpoint} → ${res.status}: ${json?.Message ?? text.slice(0, 200)}`);
    }

    return json as T;
}

// ─── Search Helpers ───────────────────────────────────────────────────

export async function searchMystiflyDirect(body: any) {
    return mystiflyRequest('/api/v1/Search/Flight', body);
}

export async function searchMystiflyV2Direct(body: any) {
    return mystiflyRequest('/api/v2/Search/Flight', body);
}

// ─── Fetch Helpers ────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetchWithTimeout(url, init);
            if (res.status >= 500 && attempt < MAX_RETRIES) {
                await sleep(attempt * 500);
                continue;
            }
            return res;
        } catch (err: any) {
            lastErr = err;
            if (attempt < MAX_RETRIES) await sleep(attempt * 500);
        }
    }
    throw lastErr ?? new Error('Mystifly request failed after retries');
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Normalization ────────────────────────────────────────────────────

export { getMystiflyTarget };

export const CABIN_MAP: Record<string, string> = {
    economy: 'Y',
    premium_economy: 'S',
    business: 'C',
    first: 'F',
};

export const TRIP_TYPE_MAP: Record<string, string> = {
    'one-way': 'OneWay',
    'round-trip': 'Return',
    'multi-city': 'MultiCity',
};

function getRequestOptions(maxOffers = 50): string {
    if (maxOffers <= 50) return 'Fifty';
    if (maxOffers <= 100) return 'Hundred';
    return 'TwoHundred';
}

const AIRLINE_NAMES: Record<string, string> = {
    // Asia-Pacific
    KE: 'Korean Air', OZ: 'Asiana Airlines', '7C': 'Jeju Air', TW: "T'way Air",
    LJ: 'Jin Air', ZE: 'Eastar Jet', BX: 'Air Busan', RS: 'Air Seoul',
    PR: 'Philippine Airlines', '5J': 'Cebu Pacific', Z2: 'AirAsia Philippines',
    JL: 'Japan Airlines', NH: 'ANA', MM: 'Peach Aviation',
    SQ: 'Singapore Airlines', TR: 'Scoot', MH: 'Malaysia Airlines', AK: 'AirAsia',
    TG: 'Thai Airways', FD: 'Thai AirAsia', VN: 'Vietnam Airlines', VJ: 'VietJet Air',
    GA: 'Garuda Indonesia', QZ: 'Indonesia AirAsia', SL: 'Thai Lion Air',
    D7: 'AirAsia X', XJ: 'Thai AirAsia X', CX: 'Cathay Pacific', HX: 'Hong Kong Airlines',
    CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern',
    CI: 'China Airlines', BR: 'EVA Air', MI: 'SilkAir', JQ: 'Jetstar', GK: 'Jetstar Japan',
    YP: 'Air Premia',
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

function getAirlineName(code: string): string {
    return AIRLINE_NAMES[code] || code;
}

function mapCabinClass(code: string): string {
    const map: Record<string, string> = {
        Y: 'economy', W: 'premium_economy', C: 'business', F: 'first',
        S: 'premium_economy', J: 'business', P: 'first',
    };
    return map[code?.toUpperCase()] || 'economy';
}

function calculateDuration(dep: string, arr: string): number {
    try {
        const d = new Date(dep).getTime();
        const a = new Date(arr).getTime();
        if (isNaN(d) || isNaN(a)) return 0;
        return Math.round((a - d) / 60000);
    } catch { return 0; }
}

// ─── V1 Result Normalization ──────────────────────────────────────────

export function normalizeMystiflyV1Results(raw: any, maxOffers = 50): any[] {
    const itinData: any[] = raw.Data?.PricedItineraries ?? raw.Data?.FareItineraries ?? [];
    const results: any[] = [];

    for (const fareItinerary of itinData.slice(0, maxOffers)) {
        try {
            const itinerary = fareItinerary?.FareItinerary ?? fareItinerary;
            const fareInfo = itinerary?.AirItineraryFareInfo ?? itinerary?.AirItineraryPricingInfo;
            if (!fareInfo) continue;

            const fareSourceCode: string = fareInfo.FareSourceCode ?? '';
            if (!fareSourceCode) continue;

            const itinFare = fareInfo.ItinTotalFare;
            const currency: string = itinFare?.TotalFare?.CurrencyCode ?? 'USD';
            const price = Number(itinFare?.TotalFare?.Amount) || 0;
            const baseFare = Number(itinFare?.BaseFare?.Amount) || 0;
            const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

            let pricePerAdult = price;
            const fareBreakdown: any[] = fareInfo.FareBreakdown ?? fareInfo.PTC_FareBreakdowns ?? [];
            for (const fb of fareBreakdown) {
                if (fb?.PassengerTypeQuantity?.Code === 'ADT') {
                    pricePerAdult = Number(fb?.PassengerFare?.TotalFare?.Amount) || price;
                    break;
                }
            }

            const originDestOptions: any[] = itinerary.OriginDestinationOptions ?? [];
            const segments: any[] = [];
            let totalDurationMin = 0;
            let totalStops = 0;

            for (const odo of originDestOptions) {
                const options: any[] = odo.OriginDestinationOption ?? odo.FlightSegments ?? [];
                // Derive stops from segment count — TotalStops from Mystifly is often 0 even for connections
                totalStops += Math.max(0, options.length - 1);
                for (const opt of options) {
                    const fs = opt.FlightSegment ?? opt;
                    if (!fs) continue;
                    const airlineCode = fs.OperatingAirline?.Code ?? fs.MarketingAirlineCode ?? '';
                    const flightNum = fs.FlightNumber ?? fs.OperatingAirline?.FlightNumber ?? '';
                    const depTime = fs.DepartureDateTime ?? '';
                    const arrTime = fs.ArrivalDateTime ?? '';
                    const duration = Number(fs.JourneyDuration) || calculateDuration(depTime, arrTime);
                    totalDurationMin += duration;
                    segments.push({
                        airline: airlineCode,
                        airlineName: getAirlineName(airlineCode),
                        flightNumber: `${airlineCode}${flightNum}`,
                        origin: fs.DepartureAirportLocationCode ?? '',
                        destination: fs.ArrivalAirportLocationCode ?? '',
                        departureTime: depTime,
                        arrivalTime: arrTime,
                        duration,
                        cabinClass: mapCabinClass(fs.CabinClassCode ?? 'Y'),
                        terminal: fs.DepartureTerminal,
                        arrivalTerminal: fs.ArrivalTerminal,
                        aircraft: fs.Equipment?.AirEquipType,
                    });
                }
            }

            if (!segments.length) continue;

            const firstSeg = segments[0];
            const lastSeg = segments[segments.length - 1];
            const firstOpt = originDestOptions[0]?.OriginDestinationOption?.[0];
            const seatsRemaining = firstOpt?.SeatsRemaining?.Number
                ? Number(firstOpt.SeatsRemaining.Number) : null;

            // Baggage
            let checkedBags: number | undefined;
            for (const fb of fareBreakdown) {
                if (fb?.PassengerTypeQuantity?.Code !== 'ADT') continue;
                const bags = fb.BaggageAllowance ?? fb.BaggageInfo ?? [];
                if (bags.length > 0) {
                    checkedBags = typeof bags[0] === 'string'
                        ? parseInt(bags[0], 10) || 0
                        : Number(bags[0].NumberOfPieces) || 0;
                }
                break;
            }

            // Refundability
            const isRefundable = fareInfo.IsRefundable === true
                || itinerary.IsRefundable === true
                || fareInfo.FareType?.toLowerCase().includes('refund');

            results.push({
                provider: 'mystifly',
                offer_id: fareSourceCode,
                price,
                currency,
                baseFare,
                taxes,
                pricePerAdult,
                airline: firstSeg.airline,
                airlineName: firstSeg.airlineName,
                departure_time: firstSeg.departureTime,
                arrival_time: lastSeg.arrivalTime,
                duration: totalDurationMin,
                durationMinutes: totalDurationMin,
                stops: totalStops,
                remaining_seats: seatsRemaining,
                checkedBags,
                refundable: isRefundable,
                traceId: fareSourceCode,
                segments,
                raw: fareItinerary,
            });
        } catch (err: any) {
            console.error('[MystiflyClient] V1 normalization error:', err.message);
        }
    }

    return results;
}

// ─── V2 Result Normalization ──────────────────────────────────────────

export function normalizeMystiflyV2Results(raw: any, maxOffers = 50): any[] {
    const data = raw.Data ?? raw;
    const itinList: any[] = data.PricedItineraries ?? data.FareItineraries ?? data.ItineraryList ?? data.FlightItineraries ?? [];
    const results: any[] = [];

    for (const itin of itinList.slice(0, maxOffers)) {
        try {
            const fareSourceCode: string = itin.FareSourceCode ?? '';
            const fare = data.FlightFaresList?.find((f: any) => f.FareRef === itin.FareRef);
            if (!fare && !fareSourceCode) continue;

            // Price
            const currency: string = fare?.Currency ?? 'USD';
            let totalPrice = 0;
            let totalBase = 0;
            let pricePerAdult = 0;

            for (const pf of (fare?.PassengerFare ?? [])) {
                const paxTotal = parseFloat(pf.TotalFare) || 0;
                const paxBase = parseFloat(pf.BaseFare) || 0;
                const qty = Number(pf.Quantity) || 1;
                totalPrice += paxTotal * qty;
                totalBase += paxBase * qty;
                if (pf.PaxType === 'ADT') pricePerAdult = paxTotal;
            }
            if (pricePerAdult === 0) pricePerAdult = totalPrice;
            const taxes = Math.max(0, totalPrice - totalBase);

            // Segments
            const segments: any[] = [];
            let totalDurationMin = 0;
            let totalStops = 0;
            let brandName: string | undefined;
            let checkedBags = 0;

            for (const odo of (itin.OriginDestinations ?? [])) {
                const seg = data.FlightSegmentList?.find((s: any) => s.SegmentRef === odo.SegmentRef);
                if (!seg) continue;
                const airlineCode = seg.OperatingCarrierCode ?? seg.MarketingCarriercode ?? '';
                const flightNum = seg.OperatingFlightNumber ?? seg.MarketingFlightNumber ?? '';
                const depTime = seg.DepartureDateTime ?? '';
                const arrTime = seg.ArrivalDateTime ?? '';
                const duration = Number(seg.JourneyDuration) || calculateDuration(depTime, arrTime);
                totalDurationMin += duration;
                totalStops += Number(seg.stops) || 0;

                const iref = data.ItineraryReferenceList?.find((i: any) => i.ItineraryRef === odo.ItineraryRef);
                if (iref?.FareFamily && !brandName) brandName = iref.FareFamily;
                const chkBags = iref?.CheckinBaggage?.find((b: any) => b.Type === 'ADT')?.Value || '';
                if (chkBags) {
                    const m = chkBags.match(/(\d+)/);
                    if (m) checkedBags = Math.max(checkedBags, parseInt(m[1], 10));
                }

                segments.push({
                    airline: airlineCode,
                    airlineName: getAirlineName(airlineCode),
                    flightNumber: `${airlineCode}${flightNum}`,
                    origin: seg.DepartureAirportLocationCode ?? '',
                    destination: seg.ArrivalAirportLocationCode ?? '',
                    departureTime: depTime,
                    arrivalTime: arrTime,
                    duration,
                    cabinClass: mapCabinClass(iref?.CabinClassCode ?? seg.CabinClassCode ?? 'Y'),
                    terminal: seg.DepartureTerminal,
                    arrivalTerminal: seg.ArrivalTerminal,
                    aircraft: seg.Equipment,
                });
            }

            if (!segments.length) continue;

            const firstSeg = segments[0];
            const lastSeg = segments[segments.length - 1];

            const isRefundable = fare?.IsRefundable === true
                || fare?.FareType?.toLowerCase().includes('refund');

            results.push({
                provider: 'mystifly_v2',
                offer_id: fareSourceCode,
                price: totalPrice,
                currency,
                baseFare: totalBase,
                taxes,
                pricePerAdult,
                airline: firstSeg.airline,
                airlineName: firstSeg.airlineName,
                departure_time: firstSeg.departureTime,
                arrival_time: lastSeg.arrivalTime,
                duration: totalDurationMin,
                durationMinutes: totalDurationMin,
                stops: totalStops,
                remaining_seats: null,
                checkedBags: checkedBags || undefined,
                refundable: isRefundable,
                brandName,
                traceId: fareSourceCode,
                segments,
                raw: itin,
            });
        } catch (err: any) {
            console.error('[MystiflyClient] V2 normalization error:', err.message);
        }
    }

    return results;
}
