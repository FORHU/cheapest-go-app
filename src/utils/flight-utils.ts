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

/**
 * Transforms a raw flight result (as stored in cache/DB) back into a UI-ready FlightOffer.
 */
export function normalizedToFlightOffer(nf: any, tripType?: FlightOffer['tripType']): FlightOffer {
    let rawSegments = nf.segments;
    
    // Resilience: If segments are missing but we have basic flight info, create a synthetic segment
    if ((!rawSegments || rawSegments.length === 0) && nf.departure_time && nf.arrival_time) {
        rawSegments = [{
            airline: nf.airline,
            origin: nf.origin || '---',
            destination: nf.destination || '---',
            flightNumber: nf.flightNumber || '---',
            departureTime: nf.departure_time,
            arrivalTime: nf.arrival_time,
            duration: nf.duration || 0,
            cabinClass: nf.cabinClass || 'economy'
        }];
    }

    const segments: FlightSegmentDetail[] = (rawSegments ?? []).map((seg: any, idx: number) => ({
        segmentIndex: idx,
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
            time: seg.departureTime ?? nf.departure_time ?? '',
        },
        arrival: {
            airport: seg.destination ?? nf.destination ?? '',
            terminal: seg.arrivalTerminal,
            time: seg.arrivalTime ?? nf.arrival_time ?? '',
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
