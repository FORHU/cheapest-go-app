"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

type OfferLike = {
    totalStops?: number;
    farePolicy?: { isRefundable?: boolean };
    refundable?: boolean;
    segments?: { airline?: { name?: string } }[];
    validatingAirline?: string;
    provider?: string;
};

interface FlightFiltersProps {
    airlines: string[];
    onFilterChange: (filters: FilterState) => void;
    className?: string;
    /** All unfiltered offers — used to show per-option result counts */
    allOffers?: OfferLike[];
    /** Increment to programmatically reset filters (e.g. from a "clear all" button outside) */
    resetKey?: number;
}

export type FlightProvider = "duffel";

export interface FilterState {
    sortBy: "price" | "duration" | "departure";
    selectedAirlines: string[];
    maxStops: number | null;
    refundableOnly: boolean;
    selectedProviders: FlightProvider[];
}

const DEFAULT_FILTERS: FilterState = {
    sortBy: "price",
    selectedAirlines: [],
    maxStops: null,
    refundableOnly: false,
    selectedProviders: [],
};

function getOfferAirline(o: OfferLike): string {
    return o.validatingAirline || o.segments?.[0]?.airline?.name || o.provider || '';
}

export default function FlightFilters({
    airlines,
    onFilterChange,
    className,
    allOffers = [],
    resetKey,
}: FlightFiltersProps) {
    const t = useTranslations('flights.filtersPanel');
    const [state, setState] = useState<FilterState>(DEFAULT_FILTERS);

    // Allow parent to force-reset filters
    useEffect(() => {
        if (resetKey === undefined) return;
        setState(DEFAULT_FILTERS);
        onFilterChange(DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const update = (patch: Partial<FilterState>) => {
        const next = { ...state, ...patch };
        setState(next);
        onFilterChange(next);
    };

    const toggleAirline = (airline: string) => {
        const next = state.selectedAirlines.includes(airline)
            ? state.selectedAirlines.filter(a => a !== airline)
            : [...state.selectedAirlines, airline];
        update({ selectedAirlines: next });
    };

    const resetAll = () => {
        setState(DEFAULT_FILTERS);
        onFilterChange(DEFAULT_FILTERS);
    };

    const hasActiveFilters =
        state.maxStops !== null ||
        state.refundableOnly ||
        state.selectedAirlines.length > 0 ||
        state.selectedProviders.length > 0;

    // Per-airline counts from unfiltered offers
    const airlineCounts: Record<string, number> = {};
    for (const o of allOffers) {
        const name = getOfferAirline(o);
        if (name) airlineCounts[name] = (airlineCounts[name] ?? 0) + 1;
    }

    const refundableCount = allOffers.filter(o => o.farePolicy?.isRefundable ?? o.refundable).length;

    return (
        <div className={`flex flex-col gap-4 ${className}`}>
            {/* Reset button — only shown when filters are active */}
            {hasActiveFilters && (
                <button
                    onClick={resetAll}
                    className="flex items-center gap-1.5 text-[11px] lg:text-xs font-normal text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors self-start"
                >
                    <RotateCcw className="w-3 h-3" />
                    Reset all filters
                </button>
            )}

            {/* Sorting */}
            <div className="space-y-1.5 lg:space-y-2">
                <p className="text-[10px] lg:text-[11px] font-normal text-slate-400 uppercase tracking-widest">{t('sortBy')}</p>
                <div className="flex flex-col gap-0.5 lg:gap-1">
                    {(["price", "duration", "departure"] as const).map((sort) => (
                        <button
                            key={sort}
                            onClick={() => update({ sortBy: sort })}
                            className={`text-left px-3 py-1 lg:py-1.5 rounded-md text-[11px] lg:text-xs font-normal transition-colors ${state.sortBy === sort ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            {sort === 'price' ? t('cheapestFirst') : sort === 'duration' ? t('fastestFirst') : t('earliestDeparture')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stops */}
            <div className="space-y-1.5 lg:space-y-2">
                <p className="text-[10px] lg:text-[11px] font-normal text-slate-400 uppercase tracking-widest">{t('stops')}</p>
                <div className="flex flex-col gap-0.5 lg:gap-1">
                    {([
                        { label: t('anyStops'), value: null, count: allOffers.length },
                        { label: t('nonStopOnly'), value: 0, count: allOffers.filter(o => (o.totalStops ?? 0) === 0).length },
                        { label: t('upToOneStop'), value: 1, count: allOffers.filter(o => (o.totalStops ?? 0) <= 1).length },
                    ] as const).map((option) => (
                        <button
                            key={option.label}
                            onClick={() => update({ maxStops: option.value })}
                            className={`flex items-center justify-between text-left px-3 py-1 lg:py-1.5 rounded-md text-[11px] lg:text-xs font-normal transition-colors ${state.maxStops === option.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            <span>{option.label}</span>
                            {allOffers.length > 0 && (
                                <span className="text-[9px] lg:text-[10px] opacity-60">{option.count}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Fare Type */}
            <div className="space-y-1.5 lg:space-y-2">
                <p className="text-[10px] lg:text-[11px] font-normal text-slate-400 uppercase tracking-widest">{t('fareType')}</p>
                <label className="flex items-center justify-between cursor-pointer group">
                    <div>
                        <span className="text-[11px] lg:text-xs font-normal text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            {t('refundableFares')}
                        </span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {allOffers.length > 0
                                ? `${refundableCount} of ${allOffers.length} flights`
                                : t('refundableFaresDescription')}
                        </p>
                    </div>
                    <button
                        role="switch"
                        aria-checked={state.refundableOnly}
                        onClick={() => update({ refundableOnly: !state.refundableOnly })}
                        className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
                            state.refundableOnly ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                    >
                        <span
                            className={`inline-block h-3 w-3 mt-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                state.refundableOnly ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                        />
                    </button>
                </label>
                {/* Warn when the toggle would wipe most/all results */}
                {state.refundableOnly && refundableCount === 0 && allOffers.length > 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 px-1">
                        No refundable fares available for this route.
                    </p>
                )}
            </div>

            {/* Provider — dev only */}
            {process.env.NODE_ENV !== 'production' && (
                <div className="space-y-1.5 lg:space-y-2">
                    <p className="text-[10px] lg:text-[11px] font-normal text-slate-400 uppercase tracking-widest">{t('provider')}</p>
                    <div className="flex flex-col gap-1">
                        {([{ value: "duffel" as FlightProvider, label: "Duffel", sub: t('ndc') }]).map(({ value, label, sub }) => {
                            const active = state.selectedProviders.includes(value);
                            return (
                                <button
                                    key={value}
                                    onClick={() => {
                                        const next = active
                                            ? state.selectedProviders.filter(p => p !== value)
                                            : [...state.selectedProviders, value];
                                        update({ selectedProviders: next });
                                    }}
                                    className={`flex items-center justify-between px-3 py-1 lg:py-1.5 rounded-md text-[11px] lg:text-xs font-normal transition-colors text-left ${
                                        active
                                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-300 dark:ring-indigo-700'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    }`}
                                >
                                    <span>{label}</span>
                                    <span className={`text-[9px] font-normal ${active ? 'text-indigo-400' : 'text-slate-400'}`}>{sub}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Airlines */}
            <div className="space-y-1.5 lg:space-y-2">
                <p className="text-[10px] lg:text-[11px] font-normal text-slate-400 uppercase tracking-widest">{t('airlines')}</p>
                <div className="flex flex-col gap-1.5">
                    {airlines.map(airline => {
                        const count = airlineCounts[airline] ?? 0;
                        return (
                            <label key={airline} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={state.selectedAirlines.includes(airline)}
                                    onChange={() => toggleAirline(airline)}
                                    className="w-3 h-3 lg:w-3.5 lg:h-3.5 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="flex-1 text-[11px] lg:text-xs font-normal text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    {airline}
                                </span>
                                {allOffers.length > 0 && (
                                    <span className="text-[9px] lg:text-[10px] text-slate-400 dark:text-slate-500">{count}</span>
                                )}
                            </label>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
