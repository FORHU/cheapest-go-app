/**
 * Pure helper functions for flight-related formatting.
 * Migrated from legacy flight engine.
 */

import { AIRLINES, FlightSegmentDetail, FlightOffer, CabinClass } from '@/types/flights';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';

/**
 * A departure or arrival in Local Airport Time, rendered for `locale`.
 *
 * Providers quote these with no UTC offset, so the string's own digits ARE the answer —
 * the wall clock at that airport. They are read straight out of the string rather than
 * through a Date, so no runtime timezone can shift them.
 *
 * The clock is chosen per locale, but the AM/PM marker is OUR string, not CLDR's. Intl
 * was tried first and rejected: Node's ICU 78 renders Korean as "PM 2:42" rather than
 * "오후 2:42", and any disagreement between the server's ICU and the viewer's browser
 * shows up as a hydration mismatch on every flight time on the page.
 */
const CLOCK: Record<string, { hour12: boolean; am?: string; pm?: string; markerFirst?: boolean }> = {
    en: { hour12: true, am: 'AM', pm: 'PM' },
    ko: { hour12: true, am: '오전', pm: '오후', markerFirst: true },
    ja: { hour12: false },
    zh: { hour12: false },
};

export function formatTimeIn(iso: string | undefined, locale = 'en'): string {
    if (!iso) return '--:--';
    // The digits in the string ARE the answer — no Date is constructed, so no runtime
    // timezone can shift them and an offset in the string cannot either.
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return '--:--';
    const minute = m[2];
    const hour24 = Number(m[1]);
    if (!Number.isFinite(hour24) || hour24 > 23) return '--:--';

    const clock = CLOCK[locale.split('-')[0]] ?? CLOCK.en;
    if (!clock.hour12) return `${String(hour24).padStart(2, '0')}:${minute}`;

    const marker = hour24 < 12 ? clock.am : clock.pm;
    const hour12 = hour24 % 12 || 12;
    return clock.markerFirst ? `${marker} ${hour12}:${minute}` : `${hour12}:${minute} ${marker}`;
}

export function formatTime(iso: string): string {
    return formatTimeIn(iso);
}

/**
 * Whole calendar days between two Local Airport Times — the `+1` on an arrival that
 * lands the next day. Compares dates only, so it never depends on either zone.
 */
export function dayOffset(fromIso?: string, toIso?: string): number {
    if (!fromIso || !toIso) return 0;
    const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
    return Math.round((to - from) / 86_400_000);
}

/**
 * Ground time between landing and the next departure. Both times are at the SAME
 * airport, so their shared offset cancels and subtracting the wall clocks is exact —
 * which is not true of any other pair of times in an itinerary.
 */
export function layoverMinutes(arrivalIso?: string, departureIso?: string): number {
    if (!arrivalIso || !departureIso) return 0;
    const arr = Date.parse(`${arrivalIso.slice(0, 19)}Z`);
    const dep = Date.parse(`${departureIso.slice(0, 19)}Z`);
    if (!Number.isFinite(arr) || !Number.isFinite(dep)) return 0;
    return Math.max(0, Math.round((dep - arr) / 60_000));
}

export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPrice(amount: number, currency: string, targetCurrency?: string): string {
    const from = currency?.toUpperCase() || 'USD';
    const to = targetCurrency?.toUpperCase() || from;
    const displayAmount = from !== to ? convertCurrency(amount, from, to) : amount;
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency', currency: to, minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(displayAmount);
    } catch {
        const symbol = getCurrencySymbol(to);
        return `${symbol}${Math.round(displayAmount).toLocaleString()}`;
    }
}

export function calculateNormalizedPriceUsd(amount: number, currency: string): number {
    const rates: Record<string, number> = {
        'USD': 1.0,
        'PHP': 0.018,
        'KRW': 0.00075,
    };
    const rate = rates[currency.toUpperCase()] || 1.0;
    return amount * rate;
}

export function calculateBestScore(priceUsd: number, durationMin: number, stops: number): number {
    return (priceUsd * 1.0) + (durationMin * 0.3) + (stops * 40);
}

export function generatePhysicalFlightId(provider: string, segments: FlightSegmentDetail[]): string {
    if (!segments || segments.length === 0) return `${provider}_${Date.now()}`;
    const first = segments[0];
    const last = segments[segments.length - 1];

    // Match the Edge Function format: provider_airline_routeKey_origin_destination_time
    const routeKey = segments.map(s => `${s.airline.code}${s.flightNumber}`).join('-');
    const timeKey = first.departure.time.replace(/[-:T]/g, '').slice(0, 12);

    return [
        provider,
        first.airline.code,
        routeKey,
        first.origin,
        last.destination,
        timeKey
    ].join('_');
}

export function getAirlineName(code: string): string {
    return AIRLINES[code] || code;
}

/**
 * Transforms a raw flight result (as stored in cache/DB) back into a UI-ready FlightOffer.
 */
export function normalizedToFlightOffer(nf: any, tripType?: FlightOffer['tripType']): FlightOffer {
    let rawSegments = nf.segments;
    
    // Resilience: If segments are missing but we have basic flight info, create a synthetic segment
    if ((!rawSegments || rawSegments.length === 0) && nf.departure_time && nf.arrival_time) {
        rawSegments = [{
            airline: nf.airline,
            origin: nf.origin || '',
            destination: nf.destination || '',
            flightNumber: nf.flightNumber || '',
            departureTime: nf.departure_time,
            arrivalTime: nf.arrival_time,
            duration: nf.duration || 0,
            cabinClass: nf.cabinClass || 'economy'
        }];
    }

    const segments: FlightSegmentDetail[] = (rawSegments ?? []).map((seg: any, idx: number) => ({
        // Preserve the provider's slice-based grouping (e.g. Duffel sets sliceIdx so both
        // outbound segments share index 0 and return segments share index 1). Fall back to
        // flat array index only when the raw segment has no grouping info.
        // Falling back to the array position invented a slice boundary per segment: a
        // 2-segment outbound became two one-segment slices, and Mystifly — which names this
        // field itineraryIndex — had every segment split. 0 groups them into a single slice,
        // which is wrong only in shape, never in count.
        segmentIndex: seg.segmentIndex ?? (seg as any).itineraryIndex ?? 0,
        airline: {
            code: (() => {
                const raw = typeof seg.airline === 'object' ? seg.airline?.code : seg.airline;
                // Only use nf.airline fallback if it looks like an IATA code (2–3 uppercase letters)
                const fallback = /^[A-Z0-9]{2,3}$/.test(nf.airline ?? '') ? nf.airline : '';
                return (raw && raw.length <= 3 ? raw : null) ?? fallback ?? '';
            })(),
            name: (typeof seg.airline === 'object' ? seg.airline.name : (seg.airlineName || getAirlineName(seg.airline ?? '') || nf.airline || '')),
        },
        origin: seg.origin ?? nf.origin ?? '',
        destination: seg.destination ?? nf.destination ?? '',
        flightNumber: seg.flightNumber ?? nf.flightNumber ?? '',
        departure: {
            airport: seg.origin ?? nf.origin ?? '',
            // Nested first, for the same reason as the time below: parseDuffelOffer emits
            // departure.terminal, so reading only the flat seg.terminal dropped every
            // Duffel terminal here — the one place the whole app gets its segments. It
            // never reached the client, the book payload or flight_segments, which is why
            // both the confirmation email and admin rendered no terminal on any booking.
            terminal: seg.departure?.terminal ?? seg.terminal ?? seg.originTerminal,
            // Nested shape first: parseDuffelOffer emits departure.time / arrival.time,
            // while Mystifly and the synthetic fallback use the flat departureTime.
            // Reading only the flat form left Duffel segments undefined, so every leg
            // silently inherited nf.departure_time — the OFFER's overall departure — and
            // a return leg ended up stamped with the outbound's times.
            time: seg.departure?.time ?? seg.departureTime ?? nf.departure_time ?? '',
        },
        arrival: {
            airport: seg.destination ?? nf.destination ?? '',
            terminal: seg.arrival?.terminal ?? seg.arrivalTerminal ?? seg.destinationTerminal,
            time: seg.arrival?.time ?? seg.arrivalTime ?? nf.arrival_time ?? '',
        },
        duration: seg.duration ?? nf.duration ?? 0,
        operatingAirline: seg.operatingAirline,
        stops: 0,
        aircraft: seg.aircraft,
        cabinClass: (seg.cabinClass ?? nf.cabinClass ?? 'economy') as CabinClass,
    }));

    return {
        offerId: nf.id ?? nf.offer_id ?? '',
        provider: nf.provider ?? '',
        price: {
            total: nf.price ?? 0,
            base: nf.baseFare ?? nf.base ?? 0,
            taxes: nf.taxes ?? 0,
            currency: nf.currency ?? 'USD',
            pricePerAdult: nf.pricePerAdult ?? nf.price ?? 0,
        },
        segments,
        sliceDurations: nf.sliceDurations ?? nf.raw?.sliceDurations,
        totalDuration: nf.durationMinutes ?? nf.duration ?? nf.raw?.durationMinutes ?? nf.raw?.duration ?? 0,
        totalStops: nf.stops ?? nf.raw?.stops ?? 0,
        refundable: nf.refundable ?? nf.raw?.refundable ?? false,
        farePolicy: (() => {
            if (nf.farePolicy) return nf.farePolicy;
            // Reconstruct from Duffel raw conditions (covers cache path where farePolicy isn't stored separately)
            const rawConds = nf.raw?.conditions;
            if (rawConds && nf.provider === 'duffel') {
                const rc = rawConds.refund_before_departure;
                const cc = rawConds.change_before_departure;
                return {
                    isRefundable: rc?.allowed === true,
                    isChangeable: cc?.allowed === true,
                    refundPenaltyAmount: rc?.penalty_amount != null ? parseFloat(rc.penalty_amount) : null,
                    refundPenaltyCurrency: rc?.penalty_currency ?? null,
                    changePenaltyAmount: cc?.penalty_amount != null ? parseFloat(cc.penalty_amount) : null,
                    changePenaltyCurrency: cc?.penalty_currency ?? null,
                    policyVersion: 'search' as const,
                    policySource: 'duffel' as const,
                };
            }
            return undefined;
        })(),
        // Duffel emits a structured allowance (carry-on + checked); Mystifly and the
        // legacy cache shape carry a flat checkedBags. Prefer the structured one.
        baggage: nf.baggage ?? (nf.checkedBags != null ? {
            checkedBags: nf.checkedBags,
            weightPerBag: nf.weightPerBag,
            cabinBag: nf.cabinBag,
        } : undefined),
        seatsRemaining: nf.seatsRemaining ?? nf.remaining_seats ?? nf.raw?.seatsRemaining ?? nf.raw?.remaining_seats,
        brandedFare: (nf.brandName || nf.raw?.brandName) ? {
            brandName: nf.brandName ?? nf.raw?.brandName,
            brandId: nf.brandId ?? nf.raw?.brandId,
            fareType: nf.fareType ?? nf.raw?.fareType,
        } : undefined,
        validatingAirline: nf.validatingAirline,
        lastTicketDate: nf.lastTicketDate,
        tripType: tripType ?? 'one-way',

        // Sorting & Normalization
        normalizedPriceUsd: nf.normalizedPriceUsd ?? (nf.price ? calculateNormalizedPriceUsd(nf.price, nf.currency ?? 'USD') : 0),
        bestScore: nf.bestScore ?? 0,
        physicalFlightId: nf.physicalFlightId ?? nf.id,
        // Provider-specific IDs needed for booking
        resultIndex: nf.resultIndex,
        traceId: nf.traceId,
        // _rawOffer for Duffel
        ...(nf.provider === 'duffel' ? {
            _rawOffer: nf._rawOffer || nf.raw || nf.rawOffer,
        } : {}),
    } as FlightOffer;
}
