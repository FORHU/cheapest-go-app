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
    } = useFlightSearch();

    const { flights, tripType, passengers, cabinClass } = flightState;
    const firstSegment = flights[0];

    // Helper: update the first flight segment
    const updateFirstSegment = (updates: any) => setFlightSegment(0, updates);

    // Helper: ensure date object
    const ensureDate = (d: any): Date | null => {
        if (!d) return null;
        if (d instanceof Date) return d;
        try { return new Date(d); } catch { return null; }
    };

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
