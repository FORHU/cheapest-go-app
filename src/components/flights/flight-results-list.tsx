"use client";

import { FlightResultCache } from "@/types/flights";
import { useState, useMemo } from "react";
import FlightCard from "./flight-card";
import FlightFilters, { FilterState } from "./filters";

interface FlightResultsListProps {
    initialResults: FlightResultCache[];
}

/**
 * FlightResultsList - Client component that manages filtering and mapping of results.
 */
export default function FlightResultsList({ initialResults }: FlightResultsListProps) {
    const [filters, setFilters] = useState<FilterState>({
        sortBy: "price",
        selectedAirlines: [],
    });

    // Extract unique airlines for the filter UI
    const airlines = useMemo(() => {
        const unique = new Set(initialResults.map(r => r.airline));
        return Array.from(unique).sort();
    }, [initialResults]);

    // Apply filtering and sorting
    const filteredResults = useMemo(() => {
        let results = [...initialResults];

        // 1. Filter by Airline
        if (filters.selectedAirlines.length > 0) {
            results = results.filter(r => filters.selectedAirlines.includes(r.airline));
        }

        // 2. Filter by Stops
        if (filters.maxStops !== null) {
            results = results.filter(r => r.stops <= filters.maxStops!);
        }

        // 3. Price Analytics for Marketing Tags
        const avgPrice = initialResults.reduce((acc, r) => acc + r.price, 0) / (initialResults.length || 1);
        const cheapThreshold = avgPrice * 0.7;

        // 4. Sort
        results.sort((a, b) => {
            if (filters.sortBy === "price") {
                return a.price - b.price;
            } else if (filters.sortBy === "duration") {
                return a.duration - b.duration;
            } else if (filters.sortBy === "departure") {
                return new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime();
            }
            return 0;
        });

        return results.map(r => ({
            ...r,
            isSuperCheap: r.price <= cheapThreshold,
            isAlmostSoldOut: r.remaining_seats !== null && r.remaining_seats < 5
        }));
    }, [initialResults, filters]);

    if (initialResults.length === 0) {
        return (
            <div className="bg-white p-16 rounded-3xl text-center border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-3xl shadow-inner">
                    ✈️
                </div>
                <div className="space-y-2">
                    <h3 className="text-xl font-black text-slate-900">No flights found</h3>
                    <p className="text-slate-400 font-medium max-w-xs mx-auto">
                        We couldn't find any results for this route. Try adjusting your airports or traveling on different dates.
                    </p>
                </div>
                <a href="/landing" className="mt-4 px-8 py-3 bg-slate-900 text-white font-bold rounded-full hover:bg-slate-800 transition-colors">
                    Search Again
                </a>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters */}
            <FlightFilters 
                airlines={airlines} 
                onFilterChange={setFilters} 
            />

            {/* Main Results Area */}
            <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Showing {filteredResults.length} of {initialResults.length} Results
                    </p>
                </div>

                <div className="space-y-4">
                    {filteredResults.map((flight) => (
                        <FlightCard key={flight.id} flight={flight} />
                    ))}
                    
                    {filteredResults.length === 0 && (
                        <div className="bg-slate-50 p-12 rounded-2xl text-center border border-dashed border-slate-300">
                            <p className="text-slate-400 font-medium tracking-tight">
                                No results match your active filters.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
