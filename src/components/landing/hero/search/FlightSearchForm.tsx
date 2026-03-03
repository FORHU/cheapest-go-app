"use client";

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useFlightSearch } from '@/hooks/search/useFlightSearch';
import { FlightLocationPicker } from './FlightLocationPicker';
import { FlightTravelersPicker } from './FlightTravelersPicker';
import { FlightDatePicker } from './FlightDatePicker';

export const FlightSearchForm: React.FC = () => {
    const {
        flightState,
        activeDropdown,
        setActiveDropdown,
        setFlightSegment,
        setFlightPassengers,
        setFlightCabin,
        addFlightSegment,
        removeFlightSegment,
    } = useFlightSearch();

    const { flights, tripType, passengers, cabinClass } = flightState;
    const firstSegment = flights[0];

    const ENABLE_MULTI_CITY = true;

    // Helper: update the first flight segment
    const updateFirstSegment = (updates: any) => setFlightSegment(0, updates);

    // Helper: ensure date object
    const ensureDate = (d: any): Date | null => {
        if (!d) return null;
        if (d instanceof Date) return d;
        try { return new Date(d); } catch { return null; }
    };

    if (tripType === 'multi-city' && ENABLE_MULTI_CITY) {
        return (
            <div className="flex flex-col w-full divide-y divide-slate-200 dark:divide-white/5 bg-transparent rounded-lg">
                <div className="flex flex-col gap-2 p-2">
                    {flights.map((segment, index) => {
                        const isSegmentActive = activeDropdown?.includes(segment.id);
                        return (
                            <div key={segment.id} className={`flex flex-col sm:flex-row gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-white/5 relative group ${isSegmentActive ? 'z-50' : 'z-0'}`}>

                                {/* Segment Index Badge */}
                                <div className="hidden lg:flex w-6 h-full items-center justify-center pt-5">
                                    <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 flex items-center justify-center shrink-0">
                                        {index + 1}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 border sm:border-0 border-slate-200 dark:border-white/5 rounded-lg flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                                    <FlightLocationPicker
                                        label="From"
                                        value={segment.origin}
                                        onChange={(val) => setFlightSegment(index, { origin: val })}
                                        isOpen={activeDropdown === `origin-${segment.id}`}
                                        onToggle={(open) => setActiveDropdown(open ? `origin-${segment.id}` : null)}
                                        excludeId={segment.destination?.id}
                                    />
                                    <FlightLocationPicker
                                        label="To"
                                        value={segment.destination}
                                        onChange={(val) => setFlightSegment(index, { destination: val })}
                                        isOpen={activeDropdown === `destination-${segment.id}`}
                                        onToggle={(open) => setActiveDropdown(open ? `destination-${segment.id}` : null)}
                                        excludeId={segment.origin?.id}
                                    />
                                    <FlightDatePicker
                                        label="Departure"
                                        date={ensureDate(segment.date)}
                                        onChange={(d) => setFlightSegment(index, { date: d || null })}
                                        isOpen={activeDropdown === `date-${segment.id}`}
                                        onToggle={(open) => setActiveDropdown(open ? `date-${segment.id}` : null)}
                                        minDate={index > 0 ? ensureDate(flights[index - 1]?.date) : undefined}
                                    />
                                </div>

                                {/* Remove Segment Button - visible on hover or mobile */}
                                {flights.length > 1 && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); removeFlightSegment(index); }}
                                        className="absolute -right-2 -top-2 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-900/50 shadow-sm transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 z-10"
                                        title="Remove flight"
                                    >
                                        <span className="sr-only">Remove flight {index + 1}</span>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between p-2 lg:pl-10 lg:pr-2 gap-2">
                    <button
                        onClick={(e) => { e.preventDefault(); addFlightSegment(); }}
                        disabled={flights.length >= 4}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${flights.length >= 4 ? 'text-slate-400 cursor-not-allowed opacity-50' : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20'}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        Add another flight
                    </button>

                    <div className="w-full sm:w-auto min-w-[200px] border border-slate-200 dark:border-white/5 rounded-lg bg-white dark:bg-slate-900">
                        <FlightTravelersPicker
                            passengers={passengers}
                            cabinClass={cabinClass}
                            onChangePassengers={setFlightPassengers}
                            onChangeCabin={setFlightCabin}
                            isOpen={activeDropdown === 'flight-passengers'}
                            onToggle={(open) => setActiveDropdown(open ? 'flight-passengers' : null)}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <React.Fragment>
            {/* 1. Origins & Destinations */}
            <FlightLocationPicker
                label="From"
                value={firstSegment.origin}
                onChange={(val) => updateFirstSegment({ origin: val })}
                isOpen={activeDropdown === 'flight-origin'}
                onToggle={(open) => setActiveDropdown(open ? 'flight-origin' : null)}
                excludeId={firstSegment.destination?.id}
            />

            <FlightLocationPicker
                label="To"
                value={firstSegment.destination}
                onChange={(val) => updateFirstSegment({ destination: val })}
                isOpen={activeDropdown === 'flight-destination'}
                onToggle={(open) => setActiveDropdown(open ? 'flight-destination' : null)}
                excludeId={firstSegment.origin?.id}
            />

            {/* 2. Dates */}
            <FlightDatePicker
                label="Departure"
                date={ensureDate(firstSegment.date)}
                onChange={(d) => updateFirstSegment({ date: d || null })}
                isOpen={activeDropdown === 'flight-dates-depart'}
                onToggle={(open) => setActiveDropdown(open ? 'flight-dates-depart' : null)}
            />

            {tripType === 'round-trip' && (
                <FlightDatePicker
                    label="Return"
                    date={ensureDate(flights[1]?.date)}
                    onChange={(d) => setFlightSegment(1, { date: d || null })}
                    minDate={ensureDate(firstSegment.date)}
                    isOpen={activeDropdown === 'flight-dates-return'}
                    onToggle={(open) => setActiveDropdown(open ? 'flight-dates-return' : null)}
                />
            )}

            {/* 3. Passengers */}
            <FlightTravelersPicker
                passengers={passengers}
                cabinClass={cabinClass}
                onChangePassengers={setFlightPassengers}
                onChangeCabin={setFlightCabin}
                isOpen={activeDropdown === 'flight-passengers'}
                onToggle={(open) => setActiveDropdown(open ? 'flight-passengers' : null)}
            />
        </React.Fragment>
    );
};
