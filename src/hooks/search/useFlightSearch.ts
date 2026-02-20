"use client";

import { useEffect, useCallback } from 'react';
import { useSearchStore, FlightState, FlightSegment } from '@/stores/searchStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

export interface UseFlightSearchReturn {
    // State
    searchMode: 'hotels' | 'flights' | 'ai';
    flightState: FlightState;
    isSearching: boolean;
    activeDropdown: string | null;

    // Actions
    setSearchMode: (mode: 'hotels' | 'flights' | 'ai') => void;
    setFlightType: (type: FlightState['tripType']) => void;
    setFlightCabin: (cabin: FlightState['cabinClass']) => void;
    setFlightSegment: (index: number, segment: Partial<FlightSegment>) => void;
    addFlightSegment: () => void;
    removeFlightSegment: (index: number) => void;
    setFlightPassengers: (passengers: Partial<FlightState['passengers']>) => void;
    setActiveDropdown: (dropdown: any) => void;

    // Search Action
    handleFlightSearch: () => void;
}

export const useFlightSearch = (): UseFlightSearchReturn => {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Zustand store
    const {
        searchMode,
        flightState,
        isSearching,
        activeDropdown,
        setSearchMode,
        setFlightType,
        setFlightCabin,
        setFlightSegment,
        addFlightSegment,
        removeFlightSegment,
        setFlightPassengers,
        setActiveDropdown,
        setIsSearching,
    } = useSearchStore();

    // Sync URL params to store on mount
    useEffect(() => {
        // Future: parse flight params from URL for shared search links
    }, [searchParams]);

    const handleFlightSearch = useCallback(() => {
        const state = useSearchStore.getState();
        const { flightState } = state;

        // ─── Validation ──────────────────────────────────────────
        const missingFields: string[] = [];

        const firstSegment = flightState.flights[0];
        if (!firstSegment.origin) missingFields.push('origin');
        if (!firstSegment.destination) missingFields.push('destination');
        if (!firstSegment.date) missingFields.push('departure date');

        if (flightState.tripType === 'round-trip') {
            const returnSegment = flightState.flights[1];
            if (!returnSegment?.date) missingFields.push('return date');
        }

        if (missingFields.length > 0) {
            toast.error(`Please select ${missingFields.join(', ')}`, {
                description: 'Required fields missing for flight search',
            });
            return;
        }

        setIsSearching(true);
        setActiveDropdown(null);

        // ─── Construct URL ───────────────────────────────────────
        const params = new URLSearchParams();
        params.set('mode', 'flights');
        params.set('tripType', flightState.tripType);
        params.set('cabin', flightState.cabinClass);
        params.set('adults', flightState.passengers.adults.toString());
        params.set('children', flightState.passengers.children.toString());
        params.set('infants', flightState.passengers.infants.toString());

        // Serialize segments
        flightState.flights.forEach((segment, index) => {
            if (segment.origin?.code) params.set(`origin${index}`, segment.origin.code);
            if (segment.origin?.title) params.set(`originName${index}`, segment.origin.title);
            if (segment.destination?.code) params.set(`dest${index}`, segment.destination.code);
            if (segment.destination?.title) params.set(`destName${index}`, segment.destination.title);
            if (segment.date) params.set(`date${index}`, segment.date.toISOString());
        });

        // ─── Navigate to results page ────────────────────────────
        router.push(`/flights/search?${params.toString()}`);

        // Reset loading after short delay (page transition handles the rest)
        setTimeout(() => setIsSearching(false), 1500);

    }, [router, setIsSearching, setActiveDropdown]);

    return {
        searchMode,
        flightState,
        isSearching,
        activeDropdown,
        setSearchMode,
        setFlightType,
        setFlightCabin,
        setFlightSegment,
        addFlightSegment,
        removeFlightSegment,
        setFlightPassengers,
        setActiveDropdown,
        handleFlightSearch
    };
};

export default useFlightSearch;
