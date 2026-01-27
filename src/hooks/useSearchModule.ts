"use client";

import { useEffect, useCallback } from 'react';
import { useSearchStore, Destination } from '@/stores/searchStore';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Custom hook for search module logic
 * Provides all state and actions needed for search functionality
 * Follows React best practices with proper memoization
 */
export interface UseSearchModuleReturn {
    // State
    destinationQuery: string;
    destination: Destination | null;
    checkIn: Date | null;
    checkOut: Date | null;
    flexibility: string;
    adults: number;
    children: number;
    rooms: number;
    totalTravelers: number;
    recentSearches: Destination[];
    isSearching: boolean;

    // Derived
    activeDropdown: 'destination' | 'dates' | 'travelers' | null;

    // Actions
    setDestinationQuery: (query: string) => void;
    selectDestination: (destination: Destination) => void;
    setCheckIn: (date: Date | null) => void;
    setCheckOut: (date: Date | null) => void;
    setFlexibility: (flex: string) => void;
    setAdults: (count: number) => void;
    setChildren: (count: number) => void;
    setRooms: (count: number) => void;
    setActiveDropdown: (dropdown: 'destination' | 'dates' | 'travelers' | null) => void;

    // Search Action
    handleSearch: () => void;
    clearRecentSearch: (title: string) => void;
}

/**
 * useSearchModule - Centralized search logic hook
 * 
 * Features:
 * - Syncs URL params to Zustand store on mount
 * - Properly preserves placeId and countryCode for LiteAPI
 * - Manages loading state across components
 * - Provides memoized actions for performance
 */
export const useSearchModule = (): UseSearchModuleReturn => {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Zustand store - single source of truth
    const {
        destination,
        destinationQuery,
        dates,
        travelers,
        recentSearches,
        activeDropdown,
        isSearching,
        setDestination,
        setDestinationQuery,
        setDates,
        setTravelers,
        setActiveDropdown,
        setIsSearching,
        addRecentSearch,
        removeRecentSearch,
    } = useSearchStore();

    // Derived values
    const totalTravelers = travelers.adults + travelers.children;

    /**
     * Sync URL params to Store on mount
     * This handles page reloads and shared URLs
     */
    useEffect(() => {
        // Reset loading state when navigation completes
        setIsSearching(false);

        const destParam = searchParams.get('destination');
        const checkInParam = searchParams.get('checkIn');
        const checkOutParam = searchParams.get('checkOut');
        const adultsParam = searchParams.get('adults');
        const childrenParam = searchParams.get('children');
        const roomsParam = searchParams.get('rooms');
        const countryCodeParam = searchParams.get('countryCode');
        const placeIdParam = searchParams.get('placeId');

        if (destParam) {
            setDestinationQuery(destParam);
            // IMPORTANT: Preserve placeId and countryCode for LiteAPI searches
            setDestination({
                type: 'city',
                title: destParam,
                subtitle: 'Selected destination',
                id: placeIdParam || undefined,
                countryCode: countryCodeParam || undefined
            });
        }

        if (checkInParam || checkOutParam) {
            setDates({
                checkIn: checkInParam ? new Date(checkInParam) : null,
                checkOut: checkOutParam ? new Date(checkOutParam) : null
            });
        }

        if (adultsParam || childrenParam || roomsParam) {
            setTravelers({
                adults: adultsParam ? parseInt(adultsParam) : 2,
                children: childrenParam ? parseInt(childrenParam) : 0,
                rooms: roomsParam ? parseInt(roomsParam) : 1
            });
        }
    }, [searchParams, setDestination, setDestinationQuery, setDates, setTravelers, setIsSearching]);

    // Destination actions
    const selectDestination = useCallback((dest: Destination) => {
        setDestination(dest);
        setDestinationQuery(dest.title);
        addRecentSearch(dest);
        setActiveDropdown(null);
    }, [setDestination, setDestinationQuery, addRecentSearch, setActiveDropdown]);

    // Date actions
    const setCheckIn = useCallback((date: Date | null) => {
        setDates({ checkIn: date });
    }, [setDates]);

    const setCheckOut = useCallback((date: Date | null) => {
        setDates({ checkOut: date });
    }, [setDates]);

    const setFlexibility = useCallback((flexibility: string) => {
        setDates({ flexibility: flexibility as 'exact' | '1day' | '2days' | '3days' | '7days' });
    }, [setDates]);

    // Traveler actions
    const setAdults = useCallback((count: number) => {
        setTravelers({ adults: Math.max(1, count) });
    }, [setTravelers]);

    const setChildren = useCallback((count: number) => {
        setTravelers({ children: Math.max(0, count) });
    }, [setTravelers]);

    const setRooms = useCallback((count: number) => {
        setTravelers({ rooms: Math.max(1, count) });
    }, [setTravelers]);

    /**
     * handleSearch - Navigate to search results
     * Builds URL params with all necessary data including placeId
     */
    const handleSearch = useCallback(() => {
        setIsSearching(true);
        setActiveDropdown(null);

        // Get fresh state for building params
        const state = useSearchStore.getState();
        const params = new URLSearchParams();

        // Destination - use query if object is missing
        const destValue = state.destination?.title || state.destinationQuery;
        if (destValue) {
            params.set('destination', destValue);
            // Include placeId and countryCode for accurate API results
            if (state.destination?.countryCode) {
                params.set('countryCode', state.destination.countryCode);
            }
            if (state.destination?.id) {
                params.set('placeId', state.destination.id);
            }
        }

        // Dates
        if (state.dates.checkIn) {
            params.set('checkIn', state.dates.checkIn.toISOString());
        }
        if (state.dates.checkOut) {
            params.set('checkOut', state.dates.checkOut.toISOString());
        }

        // Travelers
        params.set('adults', state.travelers.adults.toString());
        params.set('children', state.travelers.children.toString());
        params.set('rooms', state.travelers.rooms.toString());

        router.push(`/search?${params.toString()}`);
    }, [router, setIsSearching, setActiveDropdown]);

    // Clear specific recent search
    const clearRecentSearch = useCallback((title: string) => {
        removeRecentSearch(title);
    }, [removeRecentSearch]);

    return {
        // State
        destinationQuery,
        destination,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        flexibility: dates.flexibility,
        adults: travelers.adults,
        children: travelers.children,
        rooms: travelers.rooms,
        totalTravelers,
        recentSearches,
        isSearching,

        // Derived
        activeDropdown,

        // Actions
        setDestinationQuery,
        selectDestination,
        setCheckIn,
        setCheckOut,
        setFlexibility,
        setAdults,
        setChildren,
        setRooms,
        setActiveDropdown,

        // Search
        handleSearch,
        clearRecentSearch,
    };
};

export default useSearchModule;
