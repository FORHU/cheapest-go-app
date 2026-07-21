// Types for landing page sections

export interface Deal {
    id: string;
    title: string;
    subtitle: string;
    discount: string;
    originalPrice: number;
    salePrice: number;
    /** Currency the prices are stored in — defaults to 'USD'. Used for correct conversion. */
    currency?: string;
    image: string;
    endsIn: string;
    tag?: string;
    // Search routing fields (from flight_deals table)
    origin?: string;
    destination?: string;
    departure_date?: string;
    return_date?: string;
    /** Cabin class from flight_deals.cabin_class — 'economy' | 'premium_economy' | 'business' | 'first' */
    cabinClass?: string;
    // Live price metadata — set by cron job
    lastRefreshedAt?: string;
}

export interface WeekendDeal {
    id: string | number;
    name: string;
    location: string;
    rating: number;
    reviews: number;
    originalPrice: number;
    salePrice: number;
    /** ISO 4217 code the prices are stored in. Landing data is authored in PHP. */
    currency: string;
    image: string;
    badge?: string;
    /** Maximum guests the property/room sleeps. */
    guests?: number;
    /** Number of available bedrooms. */
    bedrooms?: number;
    /** Number of bathrooms. */
    bathrooms?: number;
    /** TravelgateX hotel code — used to build the property page deep-link. */
    hotelCode?: string;
    /** ISO date (YYYY-MM-DD) for the cached deal's check-in night. */
    checkIn?: string;
    /** ISO date (YYYY-MM-DD) for the cached deal's check-out night. */
    checkOut?: string;
}

export interface RecentSearch {
    id: string | number;
    destination: string;
    dates: string;
    travelers: string;
    rooms: string;
}

export interface VacationPackage {
    id: string | number;
    name: string;
    location: string;
    rating: number;
    reviews: number;
    originalPrice: number;
    salePrice: number;
    image: string;
    includes: string[];
    // Optional IATA city code for search routing
    destinationCode?: string;
}

export const packageTabs = [
    "All Places",
    "Ho Chi Minh City",
    "Bali",
    "Seoul",
    "Bangkok",
];

export const styleTabs = ['Beach', 'Kid-Friendly', 'Ski', 'Romantic', 'Wellness and Relaxation'];
