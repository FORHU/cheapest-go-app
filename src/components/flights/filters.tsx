"use client";

import { useState } from "react";

interface FlightFiltersProps {
    airlines: string[];
    onFilterChange: (filters: FilterState) => void;
}

export type FlightProvider = "mystifly_v2" | "duffel";

export interface FilterState {
    sortBy: "price" | "duration" | "departure";
    selectedAirlines: string[];
    maxStops: number | null; // null means any
    refundableOnly: boolean;
    selectedProviders: FlightProvider[]; // empty = all
}

/**
 * FlightFilters - Client-side filtering and sorting for results.
 */
export default function FlightFilters({ airlines, onFilterChange }: FlightFiltersProps) {
    const [state, setState] = useState<FilterState>({
        sortBy: "price",
        selectedAirlines: [],
        maxStops: null,
        refundableOnly: false,
        selectedProviders: [],
    });

    const toggleAirline = (airline: string) => {
        const newAirlines = state.selectedAirlines.includes(airline)
            ? state.selectedAirlines.filter(a => a !== airline)
            : [...state.selectedAirlines, airline];
        
        const newState = { ...state, selectedAirlines: newAirlines };
        setState(newState);
        onFilterChange(newState);
    };

    const updateSort = (sort: "price" | "duration" | "departure") => {
        const newState = { ...state, sortBy: sort };
        setState(newState);
        onFilterChange(newState);
    };

    const updateStops = (stops: number | null) => {
        const newState = { ...state, maxStops: stops };
        setState(newState);
        onFilterChange(newState);
    };

    return (
        <div className="flex flex-col gap-3 lg:gap-6 bg-white dark:bg-slate-900 p-3 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm self-start w-full lg:w-72">
            {/* Sorting */}
            <div className="space-y-2 lg:space-y-3">
                <p className="text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">Sort By</p>
                <div className="flex flex-col gap-0.5 lg:gap-2">
                    <button 
                        onClick={() => updateSort("price")}
                        className={`text-left px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-colors ${state.sortBy === 'price' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        Cheapest First
                    </button>
                    <button 
                        onClick={() => updateSort("duration")}
                        className={`text-left px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-colors ${state.sortBy === 'duration' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        Fastest First
                    </button>
                    <button 
                        onClick={() => updateSort("departure")}
                        className={`text-left px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-colors ${state.sortBy === 'departure' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        Earliest Departure
                    </button>
                </div>
            </div>

            {/* Stops */}
            <div className="space-y-2 lg:space-y-3">
                <p className="text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">Stops</p>
                <div className="flex flex-col gap-0.5 lg:gap-2">
                    {[
                        { label: "Any Stops", value: null },
                        { label: "Non-stop only", value: 0 },
                        { label: "Up to 1 stop", value: 1 },
                    ].map((option) => (
                        <button 
                            key={option.label}
                            onClick={() => updateStops(option.value)}
                            className={`text-left px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-colors ${state.maxStops === option.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Fare Type */}
            <div className="space-y-2 lg:space-y-3">
                <p className="text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">Fare Type</p>
                <label className="flex items-center justify-between cursor-pointer group">
                    <div>
                        <span className="text-xs lg:text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            Refundable fares
                        </span>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Fares that allow cancellation with a refund (fees may apply)</p>
                    </div>
                    <button
                        role="switch"
                        aria-checked={state.refundableOnly}
                        onClick={() => {
                            const newState = { ...state, refundableOnly: !state.refundableOnly };
                            setState(newState);
                            onFilterChange(newState);
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
                            state.refundableOnly ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                state.refundableOnly ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                        />
                    </button>
                </label>
            </div>

            {/* Provider — dev only */}
            {process.env.NODE_ENV !== 'production' && (
            <div className="space-y-2 lg:space-y-3">
                <p className="text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">Provider</p>
                <div className="flex flex-col gap-2">
                    {([
                        { value: "mystifly_v2" as FlightProvider, label: "Mystifly", sub: "Branded fares" },
                        { value: "duffel" as FlightProvider, label: "Duffel", sub: "NDC fares" },
                    ]).map(({ value, label, sub }) => {
                        const active = state.selectedProviders.includes(value);
                        return (
                            <button
                                key={value}
                                onClick={() => {
                                    const next = active
                                        ? state.selectedProviders.filter(p => p !== value)
                                        : [...state.selectedProviders, value];
                                    const newState = { ...state, selectedProviders: next };
                                    setState(newState);
                                    onFilterChange(newState);
                                }}
                                className={`flex items-center justify-between px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-colors text-left ${
                                    active
                                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-300 dark:ring-indigo-700'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                            >
                                <span>{label}</span>
                                <span className={`text-[10px] font-medium ${active ? 'text-indigo-400' : 'text-slate-400'}`}>{sub}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            )}

            {/* Airlines */}
            <div className="space-y-2 lg:space-y-3">
                <p className="text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">Airlines</p>
                <div className="flex flex-col gap-2">
                    {airlines.map(airline => (
                        <label key={airline} className="flex items-center gap-3 cursor-pointer group">
                            <input 
                                type="checkbox"
                                checked={state.selectedAirlines.includes(airline)}
                                onChange={() => toggleAirline(airline)}
                                className="w-3.5 h-3.5 lg:w-4 lg:h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs lg:text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                {airline}
                            </span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
