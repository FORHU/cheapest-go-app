"use client";

import { useState } from "react";

interface FlightFiltersProps {
    airlines: string[];
    onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
    sortBy: "price" | "duration" | "departure";
    selectedAirlines: string[];
    maxStops: number | null; // null means any
}

/**
 * FlightFilters - Client-side filtering and sorting for results.
 */
export default function FlightFilters({ airlines, onFilterChange }: FlightFiltersProps) {
    const [state, setState] = useState<FilterState>({
        sortBy: "price",
        selectedAirlines: [],
        maxStops: null,
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
        <div className="flex flex-col gap-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm self-start w-full lg:w-72">
            {/* Sorting */}
            <div className="space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sort By</p>
                <div className="flex flex-col gap-2">
                    <button 
                        onClick={() => updateSort("price")}
                        className={`text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${state.sortBy === 'price' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        Cheapest First
                    </button>
                    <button 
                        onClick={() => updateSort("duration")}
                        className={`text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${state.sortBy === 'duration' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        Fastest First
                    </button>
                    <button 
                        onClick={() => updateSort("departure")}
                        className={`text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${state.sortBy === 'departure' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        Earliest Departure
                    </button>
                </div>
            </div>

            {/* Stops */}
            <div className="space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Stops</p>
                <div className="flex flex-col gap-2">
                    {[
                        { label: "Any Stops", value: null },
                        { label: "Non-stop only", value: 0 },
                        { label: "Up to 1 stop", value: 1 },
                    ].map((option) => (
                        <button 
                            key={option.label}
                            onClick={() => updateStops(option.value)}
                            className={`text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${state.maxStops === option.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Airlines */}
            <div className="space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Airlines</p>
                <div className="flex flex-col gap-2">
                    {airlines.map(airline => (
                        <label key={airline} className="flex items-center gap-3 cursor-pointer group">
                            <input 
                                type="checkbox"
                                checked={state.selectedAirlines.includes(airline)}
                                onChange={() => toggleAirline(airline)}
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                {airline}
                            </span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
