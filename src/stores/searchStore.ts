import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

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

/** Per-room occupancy configuration */
export interface RoomOccupancy {
    adults: number;
    childrenAges: number[]; // Array of children ages (0-17)
}

export interface TravelersConfig {
    adults: number;
    children: number;
    rooms: number;
    /** Per-room configuration for LiteAPI (optional, derived from above if not set) */
    occupancies?: RoomOccupancy[];
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

export interface FlightSegment {
    id: string;
    origin: Destination | null;
    destination: Destination | null;
    date: Date | null;
}

export interface FlightState {
    tripType: 'one-way' | 'round-trip' | 'multi-city';
    cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
    flights: FlightSegment[];
    passengers: {
        adults: number;
        children: number;
        infants: number;
    };
}

interface SearchState {
    // Destination
    destination: Destination | null;
    destinationQuery: string;

    // Dates
    dates: DateRange;

    // Travelers
    travelers: TravelersConfig;

    // User locale preferences (persisted)
    userCurrency: string; // ISO currency code (e.g., 'PHP', 'KRW', 'USD')
    userCountry: string;  // ISO country code (e.g., 'PH', 'KR', 'US')
    setUserCurrency: (currency: string) => void;
    setUserCountry: (country: string) => void;

    // Recent searches (persisted)
    recentSearches: Destination[];

    // UI Actions
    activeDropdown: string | null;
    setActiveDropdown: (dropdown: SearchState['activeDropdown']) => void;

    // Loading state (reusable across components)
    isSearching: boolean;
    setIsSearching: (isSearching: boolean) => void;

    // Search Filters (moved from SearchFilters component useState)
    filters: SearchFilters;
    isMobileFiltersOpen: boolean;
    setIsMobileFiltersOpen: (isOpen: boolean) => void;
    setFilters: (filters: Partial<SearchFilters>) => void;
    toggleStarRating: (star: number) => void;
    toggleFacility: (facilityId: number) => void;
    resetFilters: () => void;

    // Destination suggestions (moved from DestinationPicker useState)
    suggestions: SuggestionsState;
    setSuggestions: (items: Destination[]) => void;
    setSuggestionsLoading: (loading: boolean) => void;

    // Search Mode
    searchMode: 'hotels' | 'flights' | 'ai';
    flightState: FlightState;

    // Actions
    setDestination: (destination: Destination | null) => void;
    setDestinationQuery: (query: string) => void;
    setDates: (dates: Partial<DateRange>) => void;
    setTravelers: (travelers: Partial<TravelersConfig>) => void;
    addRecentSearch: (destination: Destination) => void;
    removeRecentSearch: (title: string) => void;
    clearRecentSearches: () => void;
    reset: () => void;

    // Flight Actions
    setSearchMode: (mode: 'hotels' | 'flights' | 'ai') => void;
    setFlightType: (type: FlightState['tripType']) => void;
    setFlightCabin: (cabin: FlightState['cabinClass']) => void;
    setFlightSegment: (index: number, segment: Partial<FlightSegment>) => void;
    addFlightSegment: () => void;
    removeFlightSegment: (index: number) => void;
    setFlightPassengers: (passengers: Partial<FlightState['passengers']>) => void;
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

const initialFlightState: FlightState = {
    tripType: 'round-trip',
    cabinClass: 'economy',
    flights: [
        { id: '1', origin: null, destination: null, date: null },
        { id: '2', origin: null, destination: null, date: null }
    ],
    passengers: {
        adults: 1,
        children: 0,
        infants: 0
    }
};

export const useSearchStore = create<SearchState>()(
    persist(
        (set) => ({
            destination: null,
            destinationQuery: '',
            dates: initialDates,
            travelers: initialTravelers,
            userCurrency: 'PHP',
            userCountry: 'PH',
            recentSearches: [],
            activeDropdown: null,
            isSearching: false,
            filters: initialFilters,
            isMobileFiltersOpen: false,
            suggestions: initialSuggestions,

            // Flight Initial State
            searchMode: 'hotels',
            flightState: initialFlightState,

            setDestination: (destination) => set({ destination }),
            setUserCurrency: (userCurrency) => set({ userCurrency }),
            setUserCountry: (userCountry) => set({ userCountry }),

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
            setIsMobileFiltersOpen: (isMobileFiltersOpen) => set({ isMobileFiltersOpen }),
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
                isMobileFiltersOpen: false,
                suggestions: initialSuggestions,
            }),

            // Flight Actions Implementation
            setSearchMode: (mode) => set({ searchMode: mode }),
            setFlightType: (type) => set((state) => ({
                flightState: { ...state.flightState, tripType: type }
            })),
            setFlightCabin: (cabin) => set((state) => ({
                flightState: { ...state.flightState, cabinClass: cabin }
            })),
            setFlightSegment: (index, segment) => set((state) => {
                const newFlights = [...state.flightState.flights];
                if (newFlights[index]) {
                    newFlights[index] = { ...newFlights[index], ...segment };

                    // Date order auto-validation: enforce chronological order
                    if (segment.date) {
                        for (let i = index + 1; i < newFlights.length; i++) {
                            if (newFlights[i].date && newFlights[i].date! < segment.date!) {
                                newFlights[i].date = segment.date;
                            }
                        }
                        for (let i = index - 1; i >= 0; i--) {
                            if (newFlights[i].date && newFlights[i].date! > segment.date!) {
                                newFlights[i].date = segment.date;
                            }
                        }
                    }
                }
                return { flightState: { ...state.flightState, flights: newFlights } };
            }),
            addFlightSegment: () => set((state) => {
                if (state.flightState.flights.length >= 4) return state;
                const lastDate = state.flightState.flights[state.flightState.flights.length - 1]?.date;
                return {
                    flightState: {
                        ...state.flightState,
                        flights: [
                            ...state.flightState.flights,
                            { id: Math.random().toString(), origin: null, destination: null, date: lastDate || null }
                        ]
                    }
                };
            }),
            removeFlightSegment: (index) => set((state) => {
                if (state.flightState.flights.length <= 1) return state;
                return {
                    flightState: {
                        ...state.flightState,
                        flights: state.flightState.flights.filter((_, i) => i !== index)
                    }
                };
            }),
            setFlightPassengers: (passengers) => set((state) => ({
                flightState: {
                    ...state.flightState,
                    passengers: { ...state.flightState.passengers, ...passengers }
                }
            })),
        }),
        {
            name: 'cheapestgo-search',
            storage: {
                getItem: (name) => {
                    if (typeof window === 'undefined') return null;
                    const str = localStorage.getItem(name);
                    return str ? JSON.parse(str) : null;
                },
                setItem: (name, value) => {
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(name, JSON.stringify(value));
                    }
                },
                removeItem: (name) => {
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem(name);
                    }
                },
            },
            // Persist destination info so placeId survives page navigation
            partialize: (state) => ({
                recentSearches: state.recentSearches,
                destination: state.destination,
                destinationQuery: state.destinationQuery,
                userCurrency: state.userCurrency,
                userCountry: state.userCountry,
                searchMode: state.searchMode,
            }) as SearchState,
        }
    )
);

// Selector hooks for better performance
export const useDestination = () => useSearchStore((state) => state.destination);
export const useDestinationQuery = () => useSearchStore((state) => state.destinationQuery);
export const useUserCurrency = () => useSearchStore((state) => state.userCurrency);
export const useUserCountry = () => useSearchStore((state) => state.userCountry);
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

// Flight Selectors
export const useSearchMode = () => useSearchStore((state) => state.searchMode);
export const useFlightState = () => useSearchStore((state) => state.flightState);

// Actions selector (for components that only need to update state)
export const useSearchActions = () =>
    useSearchStore(
        useShallow((state) => ({
            setDestination: state.setDestination,
            setDestinationQuery: state.setDestinationQuery,
            setDates: state.setDates,
            setTravelers: state.setTravelers,
            setUserCurrency: state.setUserCurrency,
            setUserCountry: state.setUserCountry,
            setActiveDropdown: state.setActiveDropdown,
            setFilters: state.setFilters,
            setIsMobileFiltersOpen: state.setIsMobileFiltersOpen,
            toggleStarRating: state.toggleStarRating,
            toggleFacility: state.toggleFacility,
            resetFilters: state.resetFilters,
            setSuggestions: state.setSuggestions,
            setSuggestionsLoading: state.setSuggestionsLoading,
            addRecentSearch: state.addRecentSearch,
            removeRecentSearch: state.removeRecentSearch,
            reset: state.reset,
            // Flight Actions
            setSearchMode: state.setSearchMode,
            setFlightType: state.setFlightType,
            setFlightCabin: state.setFlightCabin,
            setFlightSegment: state.setFlightSegment,
            addFlightSegment: state.addFlightSegment,
            removeFlightSegment: state.removeFlightSegment,
            setFlightPassengers: state.setFlightPassengers,
        }))
    );
