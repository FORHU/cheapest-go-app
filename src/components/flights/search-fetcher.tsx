"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FlightResults } from '@/components/flights/flightResultsList';
import type { FlightOffer, CabinClass } from '@/types/flights';

// ─── City name → IATA code lookup ─────────────────────────────────────────────
const CITY_TO_IATA: Record<string, string> = {
    'manila': 'MNL', 'tokyo': 'NRT', 'osaka': 'KIX', 'seoul': 'ICN', 'busan': 'PUS',
    'beijing': 'PEK', 'shanghai': 'PVG', 'hong kong': 'HKG', 'hongkong': 'HKG',
    'taipei': 'TPE', 'singapore': 'SIN', 'bangkok': 'BKK', 'kuala lumpur': 'KUL',
    'kl': 'KUL', 'bali': 'DPS', 'denpasar': 'DPS', 'jakarta': 'CGK',
    'hanoi': 'HAN', 'ho chi minh': 'SGN', 'saigon': 'SGN', 'dubai': 'DXB',
    'abu dhabi': 'AUH', 'doha': 'DOH', 'istanbul': 'IST', 'delhi': 'DEL',
    'new delhi': 'DEL', 'mumbai': 'BOM', 'colombo': 'CMB', 'kathmandu': 'KTM',
    'london': 'LHR', 'paris': 'CDG', 'amsterdam': 'AMS', 'frankfurt': 'FRA',
    'munich': 'MUC', 'berlin': 'BER', 'rome': 'FCO', 'milan': 'MXP',
    'madrid': 'MAD', 'barcelona': 'BCN', 'zurich': 'ZRH', 'vienna': 'VIE',
    'athens': 'ATH', 'lisbon': 'LIS', 'brussels': 'BRU', 'copenhagen': 'CPH',
    'stockholm': 'ARN', 'oslo': 'OSL', 'helsinki': 'HEL', 'prague': 'PRG',
    'warsaw': 'WAW', 'budapest': 'BUD', 'new york': 'JFK', 'nyc': 'JFK',
    'los angeles': 'LAX', 'la': 'LAX', 'san francisco': 'SFO', 'sf': 'SFO',
    'chicago': 'ORD', 'miami': 'MIA', 'toronto': 'YYZ', 'vancouver': 'YVR',
    'cancun': 'CUN', 'mexico city': 'MEX', 'sydney': 'SYD', 'melbourne': 'MEL',
    'auckland': 'AKL', 'da nang': 'DAD', 'danang': 'DAD', 'phu quoc': 'PQC',
};

const IATA_RE = /^[A-Z]{3}$/;

function resolveIATA(input: string): string | null {
    const upper = input.trim().toUpperCase();
    if (IATA_RE.test(upper)) return upper;
    return CITY_TO_IATA[input.trim().toLowerCase()] ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchFetcherProps {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    children: number;
    infants: number;
    cabinClass: CabinClass;
}

type SearchState =
    | { status: 'loading' }
    | { status: 'needs_input'; originRaw: string; destinationRaw: string }
    | { status: 'success'; offers: FlightOffer[] }
    | { status: 'empty' }
    | { status: 'timeout' }
    | { status: 'error'; message: string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard client-side timeout. User sees an actionable state instead of infinite loading. */
const SEARCH_TIMEOUT_MS = 25_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchFetcher({
    origin,
    destination,
    departureDate,
    returnDate,
    adults,
    children,
    infants,
    cabinClass,
}: SearchFetcherProps) {
    const [state, setState] = useState<SearchState>({ status: 'loading' });
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Cancel any previous in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setState({ status: 'loading' });

        // 1. Resolve city names → IATA codes
        const resolvedOrigin = resolveIATA(origin);
        const resolvedDestination = resolveIATA(destination);

        if (!resolvedOrigin || !resolvedDestination) {
            setState({ status: 'needs_input', originRaw: origin, destinationRaw: destination });
            return;
        }

        // 2. Hard client-side timeout — user sees actionable state after 25s
        const timeoutId = setTimeout(() => {
            controller.abort();
            setState({ status: 'timeout' });
        }, SEARCH_TIMEOUT_MS);

        const run = async () => {
            try {
                const body = {
                    origin: resolvedOrigin,
                    destination: resolvedDestination,
                    departureDate,
                    returnDate: returnDate || undefined,
                    passengers: { adults, children, infants },
                    cabinClass,
                    tripType: returnDate ? 'round-trip' : 'one-way',
                };

                const res = await fetch('/api/flights/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                const json = await res.json();

                if (!json.success) {
                    setState({ status: 'error', message: json.error || 'Search failed' });
                    return;
                }

                const offers: FlightOffer[] = json.data?.offers ?? [];
                setState(offers.length > 0
                    ? { status: 'success', offers }
                    : { status: 'empty' }
                );
            } catch (err: any) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') return; // Timeout already handled or cancelled
                setState({ status: 'error', message: err.message || 'Network error' });
            }
        };

        run();
        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origin, destination, departureDate, returnDate, adults, children, infants, cabinClass]);

    // ─── Render ──────────────────────────────────────────────────────────────

    if (state.status === 'loading') {
        return <FlightResults offers={[]} loading={true} />;
    }

    if (state.status === 'success') {
        return <FlightResults offers={state.offers} loading={false} />;
    }

    if (state.status === 'empty') {
        return (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center space-y-4">
                <div className="text-5xl">✈️</div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">No flights found</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    We couldn't find any flights for this route and date. Try different dates or another airport.
                </p>
                <a href="/"
                    className="inline-block px-6 py-2.5 mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors">
                    New Search
                </a>
            </div>
        );
    }

    if (state.status === 'timeout') {
        return (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-10 text-center space-y-4">
                <div className="text-5xl">⏱️</div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Search is taking longer than usual</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Flight providers are slow to respond right now. Please try again or adjust your search.
                </p>
                <div className="flex gap-3 justify-center mt-2">
                    <button
                        onClick={() => setState({ status: 'loading' })}
                        className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full transition-colors">
                        Try Again
                    </button>
                    <a href="/"
                        className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-white text-sm font-semibold rounded-full transition-colors">
                        New Search
                    </a>
                </div>
            </div>
        );
    }

    if (state.status === 'needs_input') {
        return (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-10 text-center space-y-4">
                <div className="text-5xl">✈️</div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Refine your search</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    We couldn't resolve <strong>{state.originRaw}</strong> or <strong>{state.destinationRaw}</strong> to an airport code.
                    Use the search bar to pick airports directly.
                </p>
                <a href="/"
                    className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors">
                    Search with Airport Picker
                </a>
            </div>
        );
    }

    // error
    return (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-8 rounded-2xl text-center space-y-3">
            <p className="text-lg font-bold text-red-700 dark:text-red-400">Search Error</p>
            <p className="text-sm text-red-600 dark:text-red-300">{(state as any).message}</p>
            <a href="/"
                className="block mt-2 text-sm font-semibold text-red-700 dark:text-red-400 hover:underline">
                Try another search
            </a>
        </div>
    );
}
