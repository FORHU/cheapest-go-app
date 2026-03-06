"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, SlidersHorizontal, ArrowUpDown, Loader2, AlertTriangle, Search, Plane } from 'lucide-react';
import { FlightCard } from '@/components/flights/FlightCard';
import BackButton from '@/components/common/BackButton';
import { useSearchStore } from '@/stores/searchStore';
import type { FlightOffer, FlightSearchRequest, CabinClass } from '@/lib/flights';

// ─── Types ───────────────────────────────────────────────────────────

type SortMode = 'recommended' | 'cheapest' | 'fastest' | 'best' | 'branded';
type StopFilter = 'any' | 'nonstop' | '1stop' | '2plus';

interface SearchResult {
    offers: FlightOffer[];
    providers: { name: string; offerCount: number; searchId: string; error?: string }[];
    totalResults: number;
    timestamp: string;
}

// ─── Component ───────────────────────────────────────────────────────

export default function FlightSearchContent({ serverSearchParams }: { serverSearchParams?: { [key: string]: string | string[] | undefined } }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { userCurrency, setUserCurrency, setUserCountry } = useSearchStore();

    // SYNC: Ensure store matches URL on load/change
    useEffect(() => {
        const urlCurrency = searchParams?.get('currency');
        if (urlCurrency && urlCurrency !== userCurrency) {
            setUserCurrency(urlCurrency);
            // Default mapping for labels
            const country = urlCurrency === 'PHP' ? 'PH' : urlCurrency === 'KRW' ? 'KR' : 'US';
            setUserCountry(country);
        }
    }, [searchParams, userCurrency, setUserCurrency, setUserCountry]);

    // Search state
    const [results, setResults] = useState<SearchResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter/sort state
    const [sortMode, setSortMode] = useState<SortMode>('recommended');
    const [stopFilter, setStopFilter] = useState<StopFilter>('any');
    const [airlineFilter, setAirlineFilter] = useState<string[]>([]);
    const [showFilters, setShowFilters] = useState(false);

    // Pagination state
    const [displayLimit, setDisplayLimit] = useState(20);

    // Reset pagination when filters change
    useEffect(() => {
        setDisplayLimit(20);
    }, [sortMode, stopFilter, airlineFilter]);

    // Parse search params using robust SSR values first, falling back to client-side
    const searchRequest = useMemo((): FlightSearchRequest | null => {
        // Safe getter function to retrieve from either SSR or client hook
        const getParam = (key: string): string | null => {
            if (serverSearchParams && typeof serverSearchParams[key] === 'string') {
                return serverSearchParams[key] as string;
            }
            return searchParams?.get(key);
        };

        const origin0 = getParam('origin0');
        const dest0 = getParam('dest0');
        const date0 = getParam('date0');

        if (!origin0 || !dest0 || !date0) return null;

        const tripType = (getParam('tripType') || 'one-way') as 'one-way' | 'round-trip' | 'multi-city';
        const segments = [{
            origin: origin0,
            destination: dest0,
            departureDate: date0.split('T')[0],
        }];

        // Round-trip return segment
        const date1 = getParam('date1');
        if ((tripType === 'round-trip') && date1) {
            segments.push({
                origin: dest0,
                destination: origin0,
                departureDate: date1.split('T')[0],
            });
        }

        // Multi-city additional segments
        if (tripType === 'multi-city') {
            let idx = 1;
            while (getParam(`origin${idx}`) && getParam(`dest${idx}`) && getParam(`date${idx}`)) {
                segments.push({
                    origin: getParam(`origin${idx}`)!,
                    destination: getParam(`dest${idx}`)!,
                    departureDate: getParam(`date${idx}`)!.split('T')[0],
                });
                idx++;
            }
        }

        const urlCurrency = getParam('currency');
        const effectiveCurrency = urlCurrency || userCurrency || 'PHP';

        return {
            tripType,
            segments,
            passengers: {
                adults: Number(getParam('adults')) || 1,
                children: Number(getParam('children')) || 0,
                infants: Number(getParam('infants')) || 0,
            },
            cabinClass: (getParam('cabin') as CabinClass) || 'economy',
            currency: effectiveCurrency,
        };
    }, [searchParams, serverSearchParams, userCurrency]);

    // Fetch results
    const fetchResults = useCallback(async () => {
        if (!searchRequest) {
            setError('Invalid search parameters');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/flights/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchRequest),
            });

            const json = await res.json();

            if (!json.success) {
                throw new Error(json.error || 'Search failed');
            }

            setResults(json.data);
        } catch (err: any) {
            setError(err.message || 'Failed to search flights');
        } finally {
            setLoading(false);
        }
    }, [searchRequest]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    // Available airlines for filter
    const availableAirlines = useMemo(() => {
        if (!results) return [];
        const airlines = new Map<string, string>();
        for (const offer of results.offers) {
            for (const seg of offer.segments) {
                airlines.set(seg.airline.code, seg.airline.name);
            }
        }
        return Array.from(airlines.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [results]);

    // Filtered + sorted offers
    const displayOffers = useMemo(() => {
        if (!results) return [];

        let offers = [...results.offers];

        // Stop filter
        if (stopFilter === 'nonstop') offers = offers.filter(o => o.totalStops === 0);
        else if (stopFilter === '1stop') offers = offers.filter(o => o.totalStops <= 1);
        else if (stopFilter === '2plus') offers = offers.filter(o => o.totalStops >= 2);

        // Airline filter
        if (airlineFilter.length > 0) {
            offers = offers.filter(o =>
                o.segments.some(s => airlineFilter.includes(s.airline.code))
            );
        }

        // Sort
        if (sortMode === 'recommended') {
            // Already interleaved/sorted by server
        } else if (sortMode === 'cheapest') {
            offers.sort((a, b) => a.price.total - b.price.total);
        } else if (sortMode === 'fastest') {
            offers.sort((a, b) => a.totalDuration - b.totalDuration);
        } else if (sortMode === 'branded') {
            offers.sort((a, b) => {
                const hasBrandA = a.brandedFare?.brandName ? 1 : 0;
                const hasBrandB = b.brandedFare?.brandName ? 1 : 0;
                if (hasBrandA !== hasBrandB) {
                    return hasBrandB - hasBrandA; // Branded flights come first
                }
                // If both are branded (or neither), sub-sort by cheapest price
                return a.price.total - b.price.total;
            });
        } else {
            // "Best" = weighted score of price + duration
            offers.sort((a, b) => {
                const scoreA = a.price.total * 0.6 + a.totalDuration * 2;
                const scoreB = b.price.total * 0.6 + b.totalDuration * 2;
                return scoreA - scoreB;
            });
        }

        return offers;
    }, [results, stopFilter, airlineFilter, sortMode]);

    // Route summary
    const originName = searchParams?.get('originName0') || searchParams?.get('origin0') || '';
    const destName = searchParams?.get('destName0') || searchParams?.get('dest0') || '';
    const tripType = searchParams?.get('tripType') || 'one-way';

    // ─── Loading State ───────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 bg-grid-alabaster dark:bg-grid-obsidian pt-3 lg:pt-8 pb-12 lg:pb-16">
                <div className="max-w-4xl mx-auto px-3 lg:px-4">
                    <div className="flex flex-col items-center justify-center py-12 lg:py-20 gap-3 lg:gap-4">
                        <div className="relative">
                            <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <Plane className="w-6 h-6 lg:w-8 lg:h-8 text-indigo-500 animate-pulse" />
                            </div>
                            <div className="absolute inset-0 w-12 h-12 lg:w-16 lg:h-16 border-[3px] lg:border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-base lg:text-xl font-semibold text-slate-900 dark:text-white">Searching flights...</h2>
                            <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {originName} → {destName}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Error State ─────────────────────────────────────────────────
    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 bg-grid-alabaster dark:bg-grid-obsidian pt-3 lg:pt-8 pb-12 lg:pb-16">
                <div className="max-w-4xl mx-auto px-3 lg:px-4">
                    <div className="flex flex-col items-center justify-center py-12 lg:py-20 gap-3 lg:gap-4">
                        <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 lg:w-8 lg:h-8 text-red-500" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-base lg:text-xl font-semibold text-slate-900 dark:text-white">Search Failed</h2>
                            <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 mt-1">{error}</p>
                        </div>
                        <button
                            onClick={fetchResults}
                            className="mt-2 lg:mt-4 px-5 lg:px-6 py-2 lg:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs lg:text-sm transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Results ─────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 bg-grid-alabaster dark:bg-grid-obsidian pt-3 lg:pt-8 pb-8 lg:pb-16">
            <div className="max-w-4xl mx-auto px-2.5 lg:px-4">
                {/* ─── Header ─── */}
                <div className="mb-2.5 lg:mb-6">
                    <BackButton
                        bareIcon
                        className="bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center shadow-sm !p-0"
                    />
                    <div className="flex items-center gap-1.5 lg:gap-3 mt-1 lg:mt-2">
                        <h1 className="text-[13px] lg:text-2xl font-bold text-slate-900 dark:text-white">
                            {originName} <ArrowLeftRight className="w-3.5 h-3.5 lg:w-5 lg:h-5 inline text-indigo-500 mx-0.5 lg:mx-1" /> {destName}
                        </h1>
                    </div>
                    <p className="text-[9px] lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5 lg:mt-1 capitalize">
                        {tripType.replace('-', ' ')} · {searchParams?.get('cabin') || 'economy'} · {
                            Number(searchParams?.get('adults') || 1) + Number(searchParams?.get('children') || 0)
                        } traveler(s)
                    </p>
                </div>

                {/* ─── Sort & Filter Bar ─── */}
                <div className="flex items-center gap-1.5 lg:gap-3 flex-wrap mb-2 lg:mb-4">
                    {/* Sort */}
                    <div className="flex items-center bg-white dark:bg-slate-800 rounded-md lg:rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] lg:text-sm">
                        {(['recommended', 'cheapest', 'fastest', 'best', 'branded'] as SortMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setSortMode(mode)}
                                className={`px-2 lg:px-4 py-1 lg:py-2 font-medium capitalize transition-colors ${sortMode === mode
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    {/* Stop filter */}
                    <div className="flex items-center bg-white dark:bg-slate-800 rounded-md lg:rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] lg:text-sm">
                        {[
                            { value: 'any' as StopFilter, label: 'Any' },
                            { value: 'nonstop' as StopFilter, label: 'Nonstop' },
                            { value: '1stop' as StopFilter, label: '≤1 stop' },
                        ].map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => setStopFilter(value)}
                                className={`px-1.5 lg:px-3 py-1 lg:py-2 font-medium transition-colors ${stopFilter === value
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Airline filter toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-0.5 lg:gap-1.5 px-1.5 lg:px-3 py-1 lg:py-2 rounded-md lg:rounded-xl border text-[10px] lg:text-sm font-medium transition-colors ${showFilters || airlineFilter.length > 0
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                    >
                        <SlidersHorizontal className="w-3 h-3 lg:w-4 lg:h-4" />
                        Airlines
                        {airlineFilter.length > 0 && (
                            <span className="px-1 py-px rounded-full bg-indigo-600 text-white text-[8px] lg:text-xs">{airlineFilter.length}</span>
                        )}
                    </button>

                    {/* Result count */}
                    <div className="ml-auto text-[9px] lg:text-sm text-slate-500 dark:text-slate-400">
                        {displayOffers.length} flight{displayOffers.length !== 1 ? 's' : ''} found
                    </div>
                </div>

                {/* ─── Airline Filter Panel ─── */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mb-2 lg:mb-4 overflow-hidden"
                        >
                            <div className="p-2.5 lg:p-4 bg-white dark:bg-slate-800 rounded-lg lg:rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center justify-between mb-1.5 lg:mb-3">
                                    <h3 className="text-[10px] lg:text-sm font-semibold text-slate-700 dark:text-slate-200">Filter by Airline</h3>
                                    {airlineFilter.length > 0 && (
                                        <button
                                            onClick={() => setAirlineFilter([])}
                                            className="text-[9px] lg:text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                        >
                                            Clear all
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1 lg:gap-2">
                                    {availableAirlines.map(([code, name]) => (
                                        <button
                                            key={code}
                                            onClick={() => {
                                                setAirlineFilter(prev =>
                                                    prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
                                                );
                                            }}
                                            className={`px-1.5 lg:px-3 py-0.5 lg:py-1.5 rounded-md lg:rounded-lg text-[9px] lg:text-xs font-medium transition-colors ${airlineFilter.includes(code)
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                }`}
                                        >
                                            {code} · {name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ─── Provider Info ─── */}
                {results && results.providers.length > 0 && (
                    <div className="flex items-center gap-1 lg:gap-2 mb-2 lg:mb-4 text-[9px] lg:text-xs text-slate-400 dark:text-slate-500">
                        <span>Sources:</span>
                        {results.providers.map(p => (
                            <span key={p.name} className="px-1 lg:px-2 py-px lg:py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                {p.name} ({p.offerCount})
                                {p.error && (
                                    <span className="text-red-400 ml-1 cursor-help" title={p.error}>
                                        ⚠
                                    </span>
                                )}
                            </span>
                        ))}
                    </div>
                )}

                {/* ─── Offer List ─── */}
                <div className="space-y-2 lg:space-y-3">
                    {displayOffers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 lg:py-16 gap-2 lg:gap-4">
                            <Search className="w-8 h-8 lg:w-12 lg:h-12 text-slate-300 dark:text-slate-600" />
                            <div className="text-center">
                                <h3 className="text-xs lg:text-lg font-semibold text-slate-700 dark:text-slate-300">No flights found</h3>
                                <p className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                    Try adjusting your filters or search for different dates.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <AnimatePresence>
                                {displayOffers.slice(0, displayLimit).map((offer, i) => (
                                    <FlightCard
                                        key={offer.offerId}
                                        offer={offer}
                                        index={i}
                                        onSelect={(selected) => {
                                            sessionStorage.setItem('selectedFlight', JSON.stringify(selected));
                                            router.push('/flights/book');
                                        }}
                                    />
                                ))}
                            </AnimatePresence>

                            {displayLimit < displayOffers.length && (
                                <div className="flex justify-center pt-4 lg:pt-6 pb-2">
                                    <button
                                        onClick={() => setDisplayLimit(prev => prev + 20)}
                                        className="px-6 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2"
                                    >
                                        Load More Flights ({displayOffers.length - displayLimit} remaining)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
