/**
 * Pure helper functions for flight-related formatting.
 * No UI state, no React hooks, no database calls.
 */

export function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
}

import type { FlightSegmentDetail } from './types';

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
