import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Destination {
    type: 'city' | 'airport' | 'history';
    title: string;
    subtitle: string;
    code?: string;
}

export interface DateRange {
    checkIn: Date | null;
    checkOut: Date | null;
    flexibility: 'exact' | '1day' | '2days' | '3days' | '7days';
}

export interface TravelersConfig {
    adults: number;
    children: number;
    rooms: number;
}

interface SearchState {
    // Destination
    destination: Destination | null;
    destinationQuery: string;

    // Dates
    dates: DateRange;

    // Travelers
    travelers: TravelersConfig;

    // Recent searches (persisted)
    recentSearches: Destination[];

    // UI Actions
    activeDropdown: 'destination' | 'dates' | 'travelers' | null;
    setActiveDropdown: (dropdown: 'destination' | 'dates' | 'travelers' | null) => void;

    // Actions
    setDestination: (destination: Destination | null) => void;
    setDestinationQuery: (query: string) => void;
    setDates: (dates: Partial<DateRange>) => void;
    setTravelers: (travelers: Partial<TravelersConfig>) => void;
    addRecentSearch: (destination: Destination) => void;
    removeRecentSearch: (title: string) => void;
    clearRecentSearches: () => void;
    reset: () => void;
}

const initialDates: DateRange = {
    checkIn: null,
    checkOut: null,
    flexibility: 'exact',
};

const initialTravelers: TravelersConfig = {
    adults: 2,
    children: 0,
    rooms: 1,
};

export const useSearchStore = create<SearchState>()(
    persist(
        (set) => ({
            destination: null,
            destinationQuery: '',
            dates: initialDates,
            travelers: initialTravelers,
            recentSearches: [],
            activeDropdown: null,

            setDestination: (destination) => set({ destination }),

            setDestinationQuery: (destinationQuery) => set({ destinationQuery }),

            setDates: (dates) => set((state) => ({
                dates: { ...state.dates, ...dates }
            })),

            setTravelers: (travelers) => set((state) => ({
                travelers: { ...state.travelers, ...travelers }
            })),

            addRecentSearch: (destination) => set((state) => {
                const filtered = state.recentSearches.filter(
                    (d) => d.title !== destination.title
                );
                return {
                    recentSearches: [destination, ...filtered].slice(0, 5),
                };
            }),

            removeRecentSearch: (title) => set((state) => ({
                recentSearches: state.recentSearches.filter((d) => d.title !== title),
            })),

            setActiveDropdown: (activeDropdown) => set({ activeDropdown }),

            clearRecentSearches: () => set({ recentSearches: [] }),

            reset: () => set({
                destination: null,
                destinationQuery: '',
                dates: initialDates,
                travelers: initialTravelers,
                activeDropdown: null,
            }),
        }),
        {
            name: 'aerovantage-search',
            partialize: (state) => ({ recentSearches: state.recentSearches }),
        }
    )
);

// Selector hooks for better performance
export const useDestination = () => useSearchStore((state) => state.destination);
export const useDestinationQuery = () => useSearchStore((state) => state.destinationQuery);
export const useDates = () => useSearchStore((state) => state.dates);
export const useTravelers = () => useSearchStore((state) => state.travelers);
export const useRecentSearches = () => useSearchStore((state) => state.recentSearches);
export const useActiveDropdown = () => useSearchStore((state) => state.activeDropdown);
