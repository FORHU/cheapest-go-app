"use client";

import { useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('flights.validation');
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
            if (!segment?.origin?.code) {
                missingFields.push(isRoundTrip && index === 1
                    ? t('fields.returnOriginAirport')
                    : t('fields.segmentOriginAirport', { index: index + 1 }));
            }
            if (!segment?.destination?.code) {
                missingFields.push(isRoundTrip && index === 1
                    ? t('fields.returnDestinationAirport')
                    : t('fields.segmentDestinationAirport', { index: index + 1 }));
            }
            if (!segment?.date) {
                missingFields.push(isRoundTrip && index === 1
                    ? t('fields.returnDate')
                    : t('fields.segmentDate', { index: index + 1 }));
            }
        });

        if (missingFields.length > 0) {
            toast.error(t('missingInformation'), {
                description: t('selectField', { field: missingFields[0] }),
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

        // `isSearching` is cleared by <SearchFetcher> when the results client
        // mounts — NOT on a timer here.
        //
        // This used to be `setTimeout(…, 1500)`, which had no relationship to
        // whether the page had loaded. A live Duffel search routinely takes
        // longer than that, so the overlay lifted mid-navigation and revealed
        // whatever Next was rendering underneath — `(main)/loading.tsx`, which is
        // the LANDING PAGE skeleton. That is the "it goes back to the landing
        // page and then to the results" flash.
        //
        // SearchNavigationOverlay keeps its own long safety timeout so a
        // navigation that never completes cannot strand the overlay.

    }, [router, setIsSearching, setActiveDropdown, t]);

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
