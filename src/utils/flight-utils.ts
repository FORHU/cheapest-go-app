/**
 * Pure helper functions for flight-related formatting.
 * Migrated from legacy flight engine.
 */

import { AIRLINES, FlightSegmentDetail, FlightOffer, CabinClass } from '@/types/flights';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';

export function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
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

// ─── Legs (slices) ───────────────────────────────────────────────────────────

/** A single directional journey — the outbound, or the return. */
export interface FlightLeg {
    sliceIndex: number;
    segments: FlightSegmentDetail[];
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    /** Flight time plus connection time for this leg alone. */
    durationMinutes: number;
    /** Connections within this leg — NOT the sum across outbound and return. */
    stops: number;
    longestLayoverMinutes: number;
    /** A connection where the arrival and next departure fall on different calendar days. */
    hasOvernightLayover: boolean;
}

/** Long enough that a traveller should be told before they sort by price. */
export const LONG_LAYOVER_MINUTES = 4 * 60;

/**
 * Beyond this, a gap is a stay rather than a connection. Used only to split legs
 * on offers that carry no slice information — see groupSegmentsIntoLegs.
 */
const MAX_CONNECTION_MINUTES = 24 * 60;

/**
 * Minutes between landing and the next departure.
 *
 * Both timestamps are local to the SAME airport, so naive arithmetic is exact
 * here — which is the only reason this is safe to do on Duffel's offset-less
 * timestamps. Never subtract a departure from an arrival across two different
 * airports; that silently absorbs the timezone difference into the result.
 */
export function layoverMinutes(arrivalTime: string, nextDepartureTime: string): number {
    const a = new Date(arrivalTime).getTime();
    const b = new Date(nextDepartureTime).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 60000));
}

/**
 * Split an offer's flat segment list back into its legs.
 *
 * A round trip is two legs, and conflating them is how a card ends up claiming
 * "CRK → CRK, 35h 35m, 2 stops" — the outbound's origin, the return's arrival,
 * both durations added together and both connections counted as one journey's
 * stops. Grouping is by `sliceIndex`, falling back to `segmentIndex` (which the
 * Duffel parser sets to the slice index before normalisation flattens it) and
 * finally to a single leg.
 *
 * Durations are summed as flight time + connection time rather than measured
 * from first departure to last arrival: those two timestamps are local to
 * different airports, so subtracting them would be wrong by the offset between
 * them. Summing this way reproduces Duffel's own slice duration exactly.
 */
export function groupSegmentsIntoLegs(segments: FlightSegmentDetail[]): FlightLeg[] {
    if (!segments || segments.length === 0) return [];

    const groups = new Map<number, FlightSegmentDetail[]>();
    const hasExplicitSlices = segments.every(s => (s as any).sliceIndex != null);

    if (hasExplicitSlices) {
        for (const seg of segments) {
            const key = (seg as any).sliceIndex as number;
            const bucket = groups.get(key);
            if (bucket) bucket.push(seg);
            else groups.set(key, [seg]);
        }
    } else {
        // No slice information — offers cached or stored in sessionStorage before
        // sliceIndex existed, where `segmentIndex` is the flat position and so
        // would put every segment in its own leg.
        //
        // Two signals, because neither alone is sufficient:
        //   - Geography catches multi-city, where one leg ends in a city the next
        //     does not depart from.
        //   - Time catches a round trip, which IS airport-continuous end to end
        //     (the return departs where the outbound landed) and can only be split
        //     on the stay in between.
        //
        // Approximate by nature: a genuine connection longer than a day would be
        // read as a leg break. That is tolerable here because this path only ever
        // sees offers issued before sliceIndex existed, and it self-heals on the
        // next search.
        let legIndex = 0;
        segments.forEach((seg, i) => {
            if (i > 0) {
                const prev = segments[i - 1];
                const prevArrival = prev.arrival.airport || prev.destination;
                const thisDeparture = seg.departure.airport || seg.origin;
                const discontinuous = !!prevArrival && !!thisDeparture && prevArrival !== thisDeparture;
                const staysOvernight = layoverMinutes(prev.arrival.time, seg.departure.time) >= MAX_CONNECTION_MINUTES;
                if (discontinuous || staysOvernight) legIndex++;
            }
            const bucket = groups.get(legIndex);
            if (bucket) bucket.push(seg);
            else groups.set(legIndex, [seg]);
        });
    }

    return [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sliceIndex, unordered]) => {
            // Order within the leg explicitly rather than trusting input order —
            // layover maths and the leg's origin/destination both depend on it.
            const legSegments = [...unordered].sort((a, b) => {
                const bySegment = (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0);
                if (bySegment !== 0) return bySegment;
                return String(a.departure.time ?? '').localeCompare(String(b.departure.time ?? ''));
            });
            const first = legSegments[0];
            const last = legSegments[legSegments.length - 1];

            let flightMinutes = 0;
            for (const s of legSegments) flightMinutes += s.duration ?? 0;

            let connectionMinutes = 0;
            let longestLayoverMinutes = 0;
            let hasOvernightLayover = false;
            for (let i = 0; i < legSegments.length - 1; i++) {
                const gap = layoverMinutes(legSegments[i].arrival.time, legSegments[i + 1].departure.time);
                connectionMinutes += gap;
                if (gap > longestLayoverMinutes) longestLayoverMinutes = gap;
                // Compared as date strings, not Date objects — both are local to the
                // connecting airport, so the calendar day is what the traveller sees.
                const landed = (legSegments[i].arrival.time ?? '').slice(0, 10);
                const departs = (legSegments[i + 1].departure.time ?? '').slice(0, 10);
                if (landed && departs && landed !== departs) hasOvernightLayover = true;
            }

            return {
                sliceIndex,
                segments: legSegments,
                origin: first.departure.airport || first.origin || '',
                destination: last.arrival.airport || last.destination || '',
                departureTime: first.departure.time,
                arrivalTime: last.arrival.time,
                durationMinutes: flightMinutes + connectionMinutes,
                stops: legSegments.length - 1,
                longestLayoverMinutes,
                hasOvernightLayover,
            };
        });
}

/**
 * Is this fare refundable in any way the traveller would recognise as refundable?
 *
 * A penalty at or above the fare is not a refund — it is a non-refundable ticket
 * with extra steps. Presenting it as "Refundable (est. fee: $500)" on a $499
 * ticket is the kind of claim that turns into a chargeback, so it is classified
 * as non-refundable here.
 */
export function refundabilityOf(
    farePolicy: { isRefundable?: boolean; refundPenaltyAmount?: number | null } | undefined,
    legacyRefundable: boolean | undefined,
    fareTotal: number,
): 'free' | 'fee' | 'none' {
    const isRefundable = farePolicy ? farePolicy.isRefundable === true : legacyRefundable === true;
    if (!isRefundable) return 'none';

    const penalty = farePolicy?.refundPenaltyAmount;
    if (penalty == null) return 'fee';       // refundable, amount unknown
    if (penalty <= 0) return 'free';
    if (fareTotal > 0 && penalty >= fareTotal) return 'none';
    return 'fee';
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
        segmentIndex: idx,
        // Preserve the leg grouping the provider parser assigned. Overwriting this
        // with `idx` is what made a 2+2 round trip look like four separate legs,
        // so the card could only render it as one CRK→CRK journey. Duffel's parser
        // puts the slice index in `segmentIndex` too, hence the second fallback.
        sliceIndex: seg.sliceIndex ?? seg.segmentIndex ?? seg.itineraryIndex ?? 0,
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
            terminal: seg.terminal,
            // Nested shape first: parseDuffelOffer emits departure.time / arrival.time,
            // while Mystifly and the synthetic fallback use the flat departureTime.
            // Reading only the flat form left Duffel segments undefined, so every leg
            // silently inherited nf.departure_time — the OFFER's overall departure — and
            // a return leg ended up stamped with the outbound's times.
            time: seg.departure?.time ?? seg.departureTime ?? nf.departure_time ?? '',
        },
        arrival: {
            airport: seg.destination ?? nf.destination ?? '',
            terminal: seg.arrivalTerminal,
            time: seg.arrival?.time ?? seg.arrivalTime ?? nf.arrival_time ?? '',
        },
        duration: seg.duration ?? nf.duration ?? 0,
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
        baggage: nf.checkedBags != null ? {
            checkedBags: nf.checkedBags,
            weightPerBag: nf.weightPerBag,
            cabinBag: nf.cabinBag,
        } : undefined,
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
