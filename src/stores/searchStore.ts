import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Destination {
    type: 'city' | 'airport' | 'history';
    title: string;
    subtitle: string;
    code?: string;
    countryCode?: string;
    id?: string;
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

/** Filter state for search results */
export interface SearchFilters {
    hotelName: string;
    starRating: number[];
    minRating: number;
    minReviewsCount: number;
    facilities: number[];
    strictFacilityFiltering: boolean;
}

/** Destination suggestions state */
export interface SuggestionsState {
    items: Destination[];
    loading: boolean;
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

    // Loading state (reusable across components)
    isSearching: boolean;
    setIsSearching: (isSearching: boolean) => void;

    // Search Filters (moved from SearchFilters component useState)
    filters: SearchFilters;
    setFilters: (filters: Partial<SearchFilters>) => void;
    toggleStarRating: (star: number) => void;
    toggleFacility: (facilityId: number) => void;
    resetFilters: () => void;

    // Destination suggestions (moved from DestinationPicker useState)
    suggestions: SuggestionsState;
    setSuggestions: (items: Destination[]) => void;
    setSuggestionsLoading: (loading: boolean) => void;

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

const initialFilters: SearchFilters = {
    hotelName: '',
    starRating: [],
    minRating: 0,
    minReviewsCount: 0,
    facilities: [],
    strictFacilityFiltering: false,
};

const initialSuggestions: SuggestionsState = {
    items: [],
    loading: false,
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
            isSearching: false,
            filters: initialFilters,
            suggestions: initialSuggestions,

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

            setIsSearching: (isSearching) => set({ isSearching }),

            // Filter actions
            setFilters: (filters) => set((state) => ({
                filters: { ...state.filters, ...filters }
            })),

            toggleStarRating: (star) => set((state) => {
                const newRatings = state.filters.starRating.includes(star)
                    ? state.filters.starRating.filter(s => s !== star)
                    : [...state.filters.starRating, star].sort((a, b) => b - a);
                return { filters: { ...state.filters, starRating: newRatings } };
            }),

            toggleFacility: (facilityId) => set((state) => {
                const newFacilities = state.filters.facilities.includes(facilityId)
                    ? state.filters.facilities.filter(f => f !== facilityId)
                    : [...state.filters.facilities, facilityId];
                return { filters: { ...state.filters, facilities: newFacilities } };
            }),

            resetFilters: () => set({ filters: initialFilters }),

            // Suggestions actions
            setSuggestions: (items) => set((state) => ({
                suggestions: { ...state.suggestions, items }
            })),

            setSuggestionsLoading: (loading) => set((state) => ({
                suggestions: { ...state.suggestions, loading }
            })),

            clearRecentSearches: () => set({ recentSearches: [] }),

            reset: () => set({
                destination: null,
                destinationQuery: '',
                dates: initialDates,
                travelers: initialTravelers,
                activeDropdown: null,
                filters: initialFilters,
                suggestions: initialSuggestions,
            }),
        }),
        {
            name: 'aerovantage-search',
            // Persist destination info so placeId survives page navigation
            partialize: (state) => ({
                recentSearches: state.recentSearches,
                destination: state.destination,
                destinationQuery: state.destinationQuery
            }),
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
export const useIsSearching = () => useSearchStore((state) => state.isSearching);

// Filter selectors
export const useSearchFilters = () => useSearchStore((state) => state.filters);
export const useHotelNameFilter = () => useSearchStore((state) => state.filters.hotelName);
export const useStarRatingFilter = () => useSearchStore((state) => state.filters.starRating);
export const useMinRatingFilter = () => useSearchStore((state) => state.filters.minRating);
export const useMinReviewsFilter = () => useSearchStore((state) => state.filters.minReviewsCount);
export const useFacilitiesFilter = () => useSearchStore((state) => state.filters.facilities);
export const useStrictFacilityFilter = () => useSearchStore((state) => state.filters.strictFacilityFiltering);

// Suggestions selectors
export const useSuggestions = () => useSearchStore((state) => state.suggestions.items);
export const useSuggestionsLoading = () => useSearchStore((state) => state.suggestions.loading);

// Actions selector (for components that only need to update state)
export const useSearchActions = () => useSearchStore((state) => ({
    setDestination: state.setDestination,
    setDestinationQuery: state.setDestinationQuery,
    setDates: state.setDates,
    setTravelers: state.setTravelers,
    setActiveDropdown: state.setActiveDropdown,
    setFilters: state.setFilters,
    toggleStarRating: state.toggleStarRating,
    toggleFacility: state.toggleFacility,
    resetFilters: state.resetFilters,
    setSuggestions: state.setSuggestions,
    setSuggestionsLoading: state.setSuggestionsLoading,
    addRecentSearch: state.addRecentSearch,
    removeRecentSearch: state.removeRecentSearch,
    reset: state.reset,
}));
