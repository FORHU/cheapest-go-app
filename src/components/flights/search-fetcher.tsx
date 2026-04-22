"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlightResults } from '@/components/flights/flightResultsList';
import FlightFilters, { type FilterState } from '@/components/flights/filters';
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
    | { status: 'loading_slow' }
    | { status: 'needs_input'; originRaw: string; destinationRaw: string }
    | { status: 'success'; offers: FlightOffer[] }
    | { status: 'empty' }
    | { status: 'timeout' }
    | { status: 'error'; message: string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Soft warning — show "still searching" message */
const SLOW_SEARCH_MS = 15_000;
/** Hard client-side timeout. User sees an actionable state instead of infinite loading. */
const SEARCH_TIMEOUT_MS = 45_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAirlineName(o: FlightOffer): string {
    return o.validatingAirline || o.segments[0]?.airline?.name || o.segments[0]?.airline?.code || o.provider;
}

function getAirlines(offers: FlightOffer[]): string[] {
    const set = new Set<string>();
    for (const o of offers) {
        const airline = getAirlineName(o);
        if (airline) set.add(airline);
    }
    return Array.from(set).sort();
}

function getProviderCounts(offers: FlightOffer[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const o of offers) {
        counts[o.provider] = (counts[o.provider] || 0) + 1;
    }
    return counts;
}

// ─── Provider Status Badge ────────────────────────────────────────────────────

function ProviderStatus({ offers, loading }: { offers: FlightOffer[]; loading: boolean }) {
    const providerCounts = useMemo(() => getProviderCounts(offers), [offers]);
    const entries = Object.entries(providerCounts);

    if (loading) {
        return (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Fetching from providers...
                </span>
            </div>
        );
    }

    if (entries.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Sources:</span>
            {entries.map(([provider, count]) => (
                <span
                    key={provider}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {provider}: {count}
                </span>
            ))}
            <span className="text-slate-400">
                ({offers.length} total)
            </span>
        </div>
    );
}

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
    const router = useRouter();
    const [state, setState] = useState<SearchState>({ status: 'loading' });
    const [retryKey, setRetryKey] = useState(0);
    const [filters, setFilters] = useState<FilterState>({
        sortBy: 'price',
        selectedAirlines: [],
        maxStops: null,
        refundableOnly: false,
        selectedProviders: [],
    });
    // allOffers holds the unfiltered list (used to populate the filter panel)
    const [allOffers, setAllOffers] = useState<FlightOffer[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const searchBodyRef = useRef<object | null>(null);

    const searchParams = useSearchParams();
    const bundleHotelId = searchParams.get('bundleHotelId');

    const handleSelect = useCallback((offer: FlightOffer) => {
        sessionStorage.setItem('selectedFlight', JSON.stringify(offer));
        sessionStorage.setItem('flightSearchPassengers', JSON.stringify({ adults, children, infants }));
        let url = '/flights/book';
        if (bundleHotelId) {
            url += `?bundleHotelId=${bundleHotelId}`;
        }
        router.push(url);
    }, [router, adults, children, infants, bundleHotelId]);

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

        // 2. Progressive timeout — soft warning at 15s, hard abort at 45s
        const slowId = setTimeout(() => {
            setState(prev => prev.status === 'loading' ? { status: 'loading_slow' } : prev);
        }, SLOW_SEARCH_MS);
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
                searchBodyRef.current = body;

                const res = await fetch('/api/flights/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);
                clearTimeout(slowId);

                const json = await res.json();

                if (!json.success) {
                    setState({ status: 'error', message: json.error || 'Search failed' });
                    return;
                }

                const offers: FlightOffer[] = json.data?.offers ?? [];
                setAllOffers(offers);
                setState(offers.length > 0
                    ? { status: 'success', offers }
                    : { status: 'empty' }
                );
            } catch (err: any) {
                clearTimeout(timeoutId);
                clearTimeout(slowId);
                if (err.name === 'AbortError') return; // Timeout already handled or cancelled
                setState({ status: 'error', message: err.message || 'Network error' });
            }
        };

        run();
        return () => {
            clearTimeout(slowId);
            clearTimeout(timeoutId);
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origin, destination, departureDate, returnDate, adults, children, infants, cabinClass, retryKey]);

    // ─── Derived data ─────────────────────────────────────────────────────────
    const rawOffers = state.status === 'success' ? state.offers : [];
    // Airlines list always from the full unfiltered set so all options stay visible
    const airlines = useMemo(() => getAirlines(allOffers.length > 0 ? allOffers : rawOffers), [allOffers, rawOffers]);

    // Client-side filtering applied to cached allOffers — no re-fetch needed
    const filteredOffers = useMemo(() => {
        const base = allOffers.length > 0 ? allOffers : rawOffers;
        let offers = [...base];
        if (filters.maxStops !== null) {
            offers = offers.filter(o => (o.totalStops ?? 0) <= filters.maxStops!);
        }
        if (filters.refundableOnly) {
            offers = offers.filter(o => (o.farePolicy?.isRefundable ?? o.refundable) === true);
        }
        if (filters.selectedProviders.length > 0) {
            offers = offers.filter(o => filters.selectedProviders.includes(o.provider as any));
        }
        if (filters.selectedAirlines.length > 0) {
            offers = offers.filter(o => {
                const name = getAirlineName(o);
                return filters.selectedAirlines.includes(name);
            });
        }
        if (filters.sortBy === 'price') {
            offers.sort((a, b) => a.price.total - b.price.total);
        } else if (filters.sortBy === 'duration') {
            offers.sort((a, b) => (a.totalDuration ?? 0) - (b.totalDuration ?? 0));
        } else if (filters.sortBy === 'departure') {
            offers.sort((a, b) =>
                new Date(a.segments[0]?.departure?.time ?? 0).getTime() -
                new Date(b.segments[0]?.departure?.time ?? 0).getTime()
            );
        }
        return offers;
    }, [allOffers, rawOffers, filters]);

    const isLoading = state.status === 'loading' || state.status === 'loading_slow';
    const isSlowSearch = state.status === 'loading_slow';
    const hasResults = state.status === 'success';

    // ─── Non-result states (full-width, no sidebar) ───────────────────────────

    if (state.status === 'needs_input') {
        return (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-10 text-center space-y-4">
                <div className="text-5xl">✈️</div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Refine your search</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    We couldn&apos;t resolve <strong>{state.originRaw}</strong> or <strong>{state.destinationRaw}</strong> to an airport code.
                    Use the search bar to pick airports directly.
                </p>
                <a href="/"
                    className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors">
                    Search with Airport Picker
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
                        onClick={() => setRetryKey(k => k + 1)}
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

    if (state.status === 'error') {
        return (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-8 rounded-2xl text-center space-y-3">
                <p className="text-lg font-bold text-red-700 dark:text-red-400">Search Error</p>
                <p className="text-sm text-red-600 dark:text-red-300">{state.message}</p>
                <a href="/"
                    className="block mt-2 text-sm font-semibold text-red-700 dark:text-red-400 hover:underline">
                    Try another search
                </a>
            </div>
        );
    }

    // ─── Loading + Results layout (with sidebar) ──────────────────────────────

    return (
        <div className="space-y-4">
            {/* Provider status bar */}
            <ProviderStatus offers={rawOffers} loading={isLoading} />

            {/* Progressive slow-search banner */}
            {isSlowSearch && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-5 py-4 flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Still searching...</p>
                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Flight providers are responding slowly. Hang tight, we&apos;re still looking for the best fares.</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Filters sidebar */}
                <div className="w-full lg:w-72 shrink-0">
                    {isLoading && rawOffers.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 animate-pulse">
                            <div className="space-y-3">
                                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="space-y-2">
                                    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                                    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                                    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="space-y-2">
                                    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                                    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                                    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="space-y-2">
                                    <div className="h-5 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
                                    <div className="h-5 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
                                    <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <FlightFilters
                            airlines={airlines}
                            onFilterChange={setFilters}
                        />
                    )}
                </div>

                {/* Main results area */}
                <div className="flex-1 min-w-0">
                    {hasResults && filteredOffers.length === 0 && allOffers.length > 0 ? (
                        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center space-y-3">
                            <p className="text-lg font-bold text-slate-700 dark:text-slate-300">No flights match your filters</p>
                            <p className="text-sm text-slate-500">Try adjusting your filter criteria.</p>
                        </div>
                    ) : (
                        <FlightResults
                            offers={filteredOffers}
                            loading={isLoading}
                            onSelect={handleSelect}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
