"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FlightResults } from '@/components/flights/flightResultsList';
import FlightFilters, { type FilterState } from '@/components/flights/filters';
import type { FlightOffer, CabinClass } from '@/types/flights';
import { ListFilter, ChevronDown, X } from 'lucide-react';
import { ResponsiveFlightHeader } from './ResponsiveFlightHeader';
import { useSearchActions, useSearchStore } from '@/stores/searchStore';
import { createPortal } from 'react-dom';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { MobileBottomNav } from '@/components/common/MobileBottomNav';
import PriceCalendar from './PriceCalendar';
import { Suspense } from 'react';

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
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-normal">
            <span className="text-blue-600 dark:text-blue-400">Sources:</span>
            {entries.map(([provider, count]) => (
                <span
                    key={provider}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
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
    const { isMobileFiltersOpen } = useSearchStore();
    const { setIsMobileFiltersOpen } = useSearchActions();
    const [filtersOpen, setFiltersOpen] = useState(true);
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

    const activeFilterCount = filters.selectedAirlines.length +
        (filters.maxStops !== null ? 1 : 0) +
        (filters.refundableOnly ? 1 : 0) +
        filters.selectedProviders.length;

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

    const cabinLabel = cabinClass.replace('_', ' ');
    const passengersStr = `${adults} Adult${adults > 1 ? 's' : ''}`;
    const dateStr = returnDate ? `${departureDate} - ${returnDate}` : departureDate;

    const mobileFilterModal = (
        <AnimatePresence>
            {isMobileFiltersOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[90] bg-black/40 lg:hidden pointer-events-auto"
                        onClick={() => setIsMobileFiltersOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: "100%", scale: 1 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 sm:top-[88px] sm:bottom-auto sm:left-auto sm:w-[340px] sm:max-h-[calc(100vh-120px)] max-h-[85vh] z-[100] bg-white dark:bg-slate-900 bg-grid-slate-100 dark:bg-grid-slate-800/50 bg-[length:40px_40px] flex flex-col lg:hidden shadow-2xl rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200/50 dark:border-slate-800/50 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Background Sparkles */}
                        <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
                            <GlobalSparkle />
                        </div>

                        {/* Header */}
                        <div className="p-3 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 flex-shrink-0">
                            <button
                                onClick={() => setIsMobileFiltersOpen(false)}
                                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors -ml-1.5"
                            >
                                <X size={16} className="text-slate-700 dark:text-slate-300" />
                            </button>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-white absolute left-1/2 -translate-x-1/2">Flight Filters</h2>
                            <div className="w-8" />
                        </div>

                        {/* Filter Content */}
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar relative z-10">
                            <FlightFilters
                                airlines={airlines}
                                onFilterChange={setFilters}
                            />
                        </div>

                        {/* Fixed Footer */}
                        <div className="p-4 border-t border-slate-200/50 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex justify-center flex-shrink-0 relative z-10">
                            <button
                                onClick={() => setIsMobileFiltersOpen(false)}
                                className="w-full max-w-sm py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center justify-center transition-transform active:scale-[0.98] shadow-md hover:shadow-lg"
                            >
                                Show {filteredOffers.length} {filteredOffers.length === 1 ? 'flight' : 'flights'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return (
        <div className="flex flex-col gap-3 lg:gap-6 relative pb-24 pt-0 lg:pt-0">
            <ResponsiveFlightHeader
                origin={origin}
                destination={destination}
                dateStr={dateStr}
                passengersStr={passengersStr}
                activeFilterCount={activeFilterCount}
                statusElement={<ProviderStatus offers={rawOffers} loading={isLoading} />}
                resultCount={filteredOffers.length}
            />

            {typeof window !== 'undefined' && createPortal(mobileFilterModal, document.body)}

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

            <div className="flex flex-col lg:flex-row gap-6 lg:items-start items-stretch">
                {/* Desktop Sidebar Filters */}
                <AnimatePresence>
                    {filtersOpen && (
                        <motion.div
                            initial={{ width: 0, opacity: 0, x: -20 }}
                            animate={{ width: 288, opacity: 1, x: 0 }}
                            exit={{ width: 0, opacity: 0, x: -20 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="hidden lg:block sticky top-24 self-start flex-shrink-0 overflow-hidden"
                        >
                            <div className="w-full bg-white dark:bg-slate-900 p-6 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
                                <FlightFilters
                                    airlines={airlines}
                                    onFilterChange={setFilters}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex-1 min-w-0 space-y-4">

                    {/* Main results area */}
                    <div className="min-w-0">
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

        </div>
    );
}
