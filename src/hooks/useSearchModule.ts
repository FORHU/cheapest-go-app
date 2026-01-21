import { useState, useCallback } from 'react';
import { useSearchStore, Destination } from '@/stores/searchStore';
import { useRouter } from 'next/navigation';

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

    // UI State
    isDestinationOpen: boolean;
    isDatePickerOpen: boolean;
    isTravelersOpen: boolean;

    // Actions
    setDestinationQuery: (query: string) => void;
    selectDestination: (destination: Destination) => void;
    setCheckIn: (date: Date | null) => void;
    setCheckOut: (date: Date | null) => void;
    setFlexibility: (flex: string) => void;
    setAdults: (count: number) => void;
    setChildren: (count: number) => void;
    setRooms: (count: number) => void;

    // UI Actions
    openDestination: () => void;
    closeDestination: () => void;
    openDatePicker: () => void;
    closeDatePicker: () => void;
    openTravelers: () => void;
    closeTravelers: () => void;
    closeAll: () => void;

    // Search Action
    handleSearch: () => void;
    clearRecentSearch: (title: string) => void;
}

export const useSearchModule = (): UseSearchModuleReturn => {
    const router = useRouter();

    // Zustand store
    const store = useSearchStore();

    // Local UI state for dropdowns
    const [isDestinationOpen, setIsDestinationOpen] = useState(false);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [isTravelersOpen, setIsTravelersOpen] = useState(false);

    // Derived values
    const totalTravelers = store.travelers.adults + store.travelers.children;

    // Destination actions
    const selectDestination = useCallback((destination: Destination) => {
        store.setDestination(destination);
        store.setDestinationQuery(destination.title);
        store.addRecentSearch(destination);
        setIsDestinationOpen(false);
    }, [store]);

    // Date actions
    const setCheckIn = useCallback((date: Date | null) => {
        store.setDates({ checkIn: date });
    }, [store]);

    const setCheckOut = useCallback((date: Date | null) => {
        store.setDates({ checkOut: date });
    }, [store]);

    const setFlexibility = useCallback((flexibility: string) => {
        store.setDates({ flexibility: flexibility as 'exact' | '1day' | '2days' | '3days' | '7days' });
    }, [store]);

    // Traveler actions
    const setAdults = useCallback((count: number) => {
        store.setTravelers({ adults: Math.max(1, count) });
    }, [store]);

    const setChildren = useCallback((count: number) => {
        store.setTravelers({ children: Math.max(0, count) });
    }, [store]);

    const setRooms = useCallback((count: number) => {
        store.setTravelers({ rooms: Math.max(1, count) });
    }, [store]);

    // UI toggle actions
    const openDestination = useCallback(() => {
        setIsDestinationOpen(true);
        setIsDatePickerOpen(false);
        setIsTravelersOpen(false);
    }, []);

    const closeDestination = useCallback(() => setIsDestinationOpen(false), []);

    const openDatePicker = useCallback(() => {
        setIsDatePickerOpen(true);
        setIsDestinationOpen(false);
        setIsTravelersOpen(false);
    }, []);

    const closeDatePicker = useCallback(() => setIsDatePickerOpen(false), []);

    const openTravelers = useCallback(() => {
        setIsTravelersOpen(true);
        setIsDestinationOpen(false);
        setIsDatePickerOpen(false);
    }, []);

    const closeTravelers = useCallback(() => setIsTravelersOpen(false), []);

    const closeAll = useCallback(() => {
        setIsDestinationOpen(false);
        setIsDatePickerOpen(false);
        setIsTravelersOpen(false);
    }, []);

    // Search action
    const handleSearch = useCallback(() => {
        closeAll();
        // Build search params and navigate
        const params = new URLSearchParams();
        if (store.destination) {
            params.set('destination', store.destination.title);
        }
        if (store.dates.checkIn) {
            params.set('checkIn', store.dates.checkIn.toISOString());
        }
        if (store.dates.checkOut) {
            params.set('checkOut', store.dates.checkOut.toISOString());
        }
        params.set('adults', store.travelers.adults.toString());
        params.set('children', store.travelers.children.toString());
        params.set('rooms', store.travelers.rooms.toString());

        router.push(`/search?${params.toString()}`);
    }, [store, closeAll, router]);

    const clearRecentSearch = useCallback((title: string) => {
        // Filter out the specific search from recent
        const filtered = store.recentSearches.filter(s => s.title !== title);
        // This would need a custom action - for now just clear all if needed
    }, [store.recentSearches]);

    return {
        // State
        destinationQuery: store.destinationQuery,
        destination: store.destination,
        checkIn: store.dates.checkIn,
        checkOut: store.dates.checkOut,
        flexibility: store.dates.flexibility,
        adults: store.travelers.adults,
        children: store.travelers.children,
        rooms: store.travelers.rooms,
        totalTravelers,
        recentSearches: store.recentSearches,

        // UI State
        isDestinationOpen,
        isDatePickerOpen,
        isTravelersOpen,

        // Actions
        setDestinationQuery: store.setDestinationQuery,
        selectDestination,
        setCheckIn,
        setCheckOut,
        setFlexibility,
        setAdults,
        setChildren,
        setRooms,

        // UI Actions
        openDestination,
        closeDestination,
        openDatePicker,
        closeDatePicker,
        openTravelers,
        closeTravelers,
        closeAll,

        // Search
        handleSearch,
        clearRecentSearch,
    };
};
