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
    const updateFirstSegment = (updates: any) => {
        setFlightSegment(0, updates);
    };

    // Helper: ensure date object
    const ensureDate = (d: any): Date | null => {
        if (!d) return null;
        if (d instanceof Date) return d;
        try { return new Date(d); } catch { return null; }
    };



    return (
        <div className="flex flex-col gap-2 sm:gap-0 sm:contents">
            {/* 1. Origins & Destinations */}
            <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 sm:bg-transparent rounded-2xl sm:rounded-none border border-slate-200 dark:border-slate-800 sm:border-0 shadow-sm sm:shadow-none">
                <FlightLocationPicker
                    label="From"
                    value={firstSegment.origin}
                    onChange={(val) => updateFirstSegment({ origin: val })}
                    isOpen={activeDropdown === 'flight-origin'}
                    onToggle={(open) => setActiveDropdown(open ? 'flight-origin' : null)}
                    excludeId={firstSegment.destination?.id}
                />
            </div>

            <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 sm:bg-transparent rounded-2xl sm:rounded-none border border-slate-200 dark:border-slate-800 sm:border-0 shadow-sm sm:shadow-none">
                <FlightLocationPicker
                    label="To"
                    value={firstSegment.destination}
                    onChange={(val) => updateFirstSegment({ destination: val })}
                    isOpen={activeDropdown === 'flight-destination'}
                    onToggle={(open) => setActiveDropdown(open ? 'flight-destination' : null)}
                    excludeId={firstSegment.origin?.id}
                />
            </div>

            {/* 2. Dates */}
            <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 sm:bg-transparent rounded-2xl sm:rounded-none border border-slate-200 dark:border-slate-800 sm:border-0 shadow-sm sm:shadow-none">
                <FlightDatePicker
                    label="Departure"
                    date={ensureDate(firstSegment.date)}
                    onChange={(d) => updateFirstSegment({ date: d || null })}
                    isOpen={activeDropdown === 'flight-dates-depart'}
                    onToggle={(open) => setActiveDropdown(open ? 'flight-dates-depart' : null)}
                />
            </div>

            {tripType === 'round-trip' && (
                <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 sm:bg-transparent rounded-2xl sm:rounded-none border border-slate-200 dark:border-slate-800 sm:border-0 shadow-sm sm:shadow-none">
                    <FlightDatePicker
                        label="Return"
                        date={ensureDate(flights[1]?.date)}
                        onChange={(d) => setFlightSegment(1, { date: d || null })}
                        minDate={ensureDate(firstSegment.date)}
                        isOpen={activeDropdown === 'flight-dates-return'}
                        onToggle={(open) => setActiveDropdown(open ? 'flight-dates-return' : null)}
                    />
                </div>
            )}

            {/* 3. Passengers */}
            <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 sm:bg-transparent rounded-2xl sm:rounded-none border border-slate-200 dark:border-slate-800 sm:border-0 shadow-sm sm:shadow-none">
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
    );
};
