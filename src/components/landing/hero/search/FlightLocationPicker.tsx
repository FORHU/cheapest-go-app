"use client";

import React from 'react';
import { AirportAutocomplete } from '@/components/inputs/AirportAutocomplete';
import { Destination } from '@/stores/searchStore';
import type { Airport } from '@/lib/airports';

interface FlightLocationPickerProps {
    value: Destination | null;
    onChange: (destination: Destination | null) => void;
    label: string;
    placeholder?: string;
    isOpen: boolean;
    onToggle: (isOpen: boolean) => void;
    excludeId?: string; // IATA code of the other field (to prevent same origin/dest)
}

/**
 * Maps Airport → Destination at the boundary so the store stays unchanged.
 * Maps Destination → Airport for the reverse direction.
 */
function destinationToAirport(dest: Destination | null): Airport | null {
    if (!dest || dest.type !== 'airport') return null;
    return {
        iata: dest.code || '',
        name: dest.subtitle || '',
        city: dest.title || '',
        country: '',
        countryCode: dest.countryCode || '',
    };
}

function airportToDestination(airport: Airport): Destination {
    return {
        type: 'airport',
        title: `${airport.city} (${airport.iata})`,
        subtitle: airport.name,
        code: airport.iata,
        countryCode: airport.countryCode,
        id: airport.iata,
    };
}

export const FlightLocationPicker: React.FC<FlightLocationPickerProps> = ({
    value,
    onChange,
    label,
    placeholder = "Search airport...",
    isOpen,
    onToggle,
    excludeId,
}) => {
    const airportValue = destinationToAirport(value);

    const handleAirportChange = (airport: Airport | null) => {
        if (airport) {
            onChange(airportToDestination(airport));
        } else {
            onChange(null);
        }
    };

    return (
        <AirportAutocomplete
            value={airportValue}
            onChange={handleAirportChange}
            label={label}
            placeholder={placeholder}
            isOpen={isOpen}
            onToggle={onToggle}
            excludeIata={excludeId}
        />
    );
};
