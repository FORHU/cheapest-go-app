"use client";

import { useEffect, useCallback, useRef } from 'react';
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
    const hasSynced = useRef(false);

    useEffect(() => {
        if (hasSynced.current) return;
        if (!searchParams.get('mode') || searchParams.get('mode') !== 'flights') return;

        hasSynced.current = true;

        const tripType = searchParams.get('tripType') as any;
        if (tripType) setFlightType(tripType);

        const cabin = searchParams.get('cabin') as any;
        if (cabin) setFlightCabin(cabin);

        const adults = parseInt(searchParams.get('adults') || '1');
        const children = parseInt(searchParams.get('children') || '0');
        const infants = parseInt(searchParams.get('infants') || '0');
        setFlightPassengers({ adults, children, infants });

        // Parse segments
        for (let i = 0; i < 4; i++) {
            const originCode = searchParams.get(`origin${i}`);
            const originName = searchParams.get(`originName${i}`);
            const destCode = searchParams.get(`dest${i}`);
            const destName = searchParams.get(`destName${i}`);
            const dateStr = searchParams.get(`date${i}`);

            if (originCode || destCode || dateStr) {
                const segment: any = {};
                if (originCode) {
                    segment.origin = {
                        type: 'airport',
                        code: originCode,
                        title: originName || originCode,
                        subtitle: '',
                        id: originCode
                    };
                }
                if (destCode) {
                    segment.destination = {
                        type: 'airport',
                        code: destCode,
                        title: destName || destCode,
                        subtitle: '',
                        id: destCode
                    };
                }
                if (dateStr) {
                    try { segment.date = new Date(dateStr); } catch (e) {}
                }
                setFlightSegment(i, segment);
            }
        }
    }, [searchParams, setFlightType, setFlightCabin, setFlightPassengers, setFlightSegment]);

    const handleFlightSearch = useCallback(() => {
        const state = useSearchStore.getState();
        const { flightState } = state;

        // ─── Map Segments by Trip Type ───────────────────────────
        const isRoundTrip = flightState.tripType === 'round-trip';

        const segmentsToSearch = flightState.tripType === 'one-way'
            ? [flightState.flights[0]]
            : isRoundTrip
                ? [
                    flightState.flights[0],
                    {
                        ...flightState.flights[1],
                        origin: flightState.flights[0]?.destination || null,
                        destination: flightState.flights[0]?.origin || null,
                    }
                ]
                : flightState.flights;

        // ─── Validation ──────────────────────────────────────────
        const missingFields: string[] = [];

        segmentsToSearch.forEach((segment, index) => {
            if (!segment?.origin?.code) missingFields.push(isRoundTrip && index === 1 ? 'return origin airport' : `segment ${index + 1} origin airport`);
            if (!segment?.destination?.code) missingFields.push(isRoundTrip && index === 1 ? 'return destination airport' : `segment ${index + 1} destination airport`);
            if (!segment?.date) missingFields.push(isRoundTrip && index === 1 ? 'return date' : `segment ${index + 1} date`);
        });

        if (missingFields.length > 0) {
            toast.error(`Missing information`, {
                description: `Please select ${missingFields[0]}`,
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
        segmentsToSearch.forEach((segment, index) => {
            if (segment.origin?.code) params.set(`origin${index}`, segment.origin.code);
            if (segment.origin?.title) params.set(`originName${index}`, segment.origin.title);
            if (segment.destination?.code) params.set(`dest${index}`, segment.destination.code);
            if (segment.destination?.title) params.set(`destName${index}`, segment.destination.title);
            
            // Safe date serialization
            let dateStr = '';
            if (segment.date) {
                const dateObj = segment.date instanceof Date ? segment.date : new Date(segment.date);
                if (!isNaN(dateObj.getTime())) {
                    dateStr = dateObj.toISOString();
                }
            }
            params.set(`date${index}`, dateStr);
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
