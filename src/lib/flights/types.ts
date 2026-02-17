/**
 * Normalized Flight Types
 * 
 * All flight providers MUST normalize their responses into these types.
 * No provider-specific data should leak beyond the provider adapter.
 */

// ─── Search Request ──────────────────────────────────────────────────

export interface FlightSearchRequest {
    /** Trip type */
    tripType: 'one-way' | 'round-trip' | 'multi-city';

    /** Flight segments (1 for one-way, 2 for round-trip, N for multi-city) */
    segments: FlightSearchSegment[];

    /** Passenger counts */
    passengers: FlightPassengers;

    /** Cabin class preference */
    cabinClass: CabinClass;

    /** Currency for pricing (ISO 4217) */
    currency?: string;

    /** Maximum number of offers to return per provider */
    maxOffers?: number;
}

export interface FlightSearchSegment {
    /** Origin airport IATA code */
    origin: string;
    /** Destination airport IATA code */
    destination: string;
    /** Departure date (ISO 8601 date string YYYY-MM-DD) */
    departureDate: string;
}

export interface FlightPassengers {
    adults: number;
    children: number;
    infants: number;
}

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

// ─── Search Response ─────────────────────────────────────────────────

export interface FlightSearchResponse {
    /** List of bookable flight offers */
    offers: FlightOffer[];

    /** Metadata about the search */
    metadata: {
        /** Which provider returned these results */
        provider: string;
        /** Unique search session ID (for repricing / booking) */
        searchId: string;
        /** When the search was performed */
        timestamp: string;
        /** Number of results before any filtering */
        totalResults: number;
    };
}

// ─── Flight Offer ────────────────────────────────────────────────────

export interface FlightOffer {
    /** Unique offer ID (prefixed with provider name, e.g. "mock_abc123") */
    offerId: string;

    /** Provider that returned this offer */
    provider: string;

    /** Price breakdown */
    price: FlightPrice;

    /** Ordered list of flight segments (legs) */
    segments: FlightSegmentDetail[];

    /** Total journey duration in minutes (all segments combined) */
    totalDuration: number;

    /** Number of stops (across all segments) */
    totalStops: number;

    /** Whether this offer is refundable */
    refundable: boolean;

    /** Baggage allowance summary */
    baggage?: {
        /** Checked bags included per passenger */
        checkedBags: number;
        /** Weight limit per bag in kg */
        weightPerBag?: number;
        /** Cabin baggage info */
        cabinBag?: string;
    };

    /** Seats remaining (if available from provider) */
    seatsRemaining?: number;

    /** Raw provider data for debugging (stripped in production) */
    _raw?: unknown;
}

// ─── Price ───────────────────────────────────────────────────────────

export interface FlightPrice {
    /** Total price for all passengers */
    total: number;
    /** Base fare before taxes */
    base: number;
    /** Total taxes and fees */
    taxes: number;
    /** ISO 4217 currency code */
    currency: string;
    /** Price per adult (for display) */
    pricePerAdult: number;
}

// ─── Segment Detail ──────────────────────────────────────────────────

export interface FlightSegmentDetail {
    /** Segment index within the offer */
    segmentIndex: number;

    /** Operating airline */
    airline: {
        code: string;   // IATA airline code (e.g. "KE")
        name: string;   // Full airline name (e.g. "Korean Air")
    };

    /** Flight number (e.g. "KE623") */
    flightNumber: string;

    /** Departure info */
    departure: {
        airport: string;    // IATA code
        terminal?: string;
        time: string;       // ISO 8601 datetime
    };

    /** Arrival info */
    arrival: {
        airport: string;    // IATA code
        terminal?: string;
        time: string;       // ISO 8601 datetime
    };

    /** Duration of this segment in minutes */
    duration: number;

    /** Number of stops within this segment */
    stops: number;

    /** Aircraft type (e.g. "Boeing 777-300ER") */
    aircraft?: string;

    /** Cabin class for this segment */
    cabinClass: CabinClass;
}

// ─── Booking ─────────────────────────────────────────────────────────

export interface FlightBookingRequest {
    /** Offer ID from search results */
    offerId: string;

    /** Provider name (extracted from offerId prefix) */
    provider: string;

    /** Passenger details */
    passengers: FlightBookingPassenger[];

    /** Contact information */
    contact: {
        email: string;
        phone: string;
        countryCode: string;
    };

    /** Payment details */
    payment?: {
        method: 'credit_card';
        cardNumber: string;
        expiry: string;
        cvv: string;
        holderName: string;
    };
}

export interface FlightBookingPassenger {
    type: 'adult' | 'child' | 'infant';
    title: 'Mr' | 'Mrs' | 'Ms' | 'Miss';
    firstName: string;
    lastName: string;
    dateOfBirth: string;    // YYYY-MM-DD
    nationality: string;    // ISO country code
    passport?: {
        number: string;
        expiryDate: string; // YYYY-MM-DD
        issuingCountry: string;
    };
}

export interface FlightBookingResponse {
    success: boolean;
    data?: {
        bookingId: string;
        pnr: string;              // Passenger Name Record
        status: 'confirmed' | 'pending' | 'ticketed' | 'failed';
        ticketNumbers?: string[];
        totalPaid: number;
        currency: string;
    };
    error?: string;
}

// ─── Airline Database (for display) ──────────────────────────────────

export const AIRLINES: Record<string, string> = {
    // Asia-Pacific
    'KE': 'Korean Air', 'OZ': 'Asiana Airlines', '7C': 'Jeju Air', 'TW': 'T\'way Air',
    'LJ': 'Jin Air', 'ZE': 'Eastar Jet', 'BX': 'Air Busan', 'RS': 'Air Seoul',
    'PR': 'Philippine Airlines', '5J': 'Cebu Pacific', 'Z2': 'AirAsia Philippines',
    'JL': 'Japan Airlines', 'NH': 'ANA', 'MM': 'Peach Aviation', 'JW': 'Vanilla Air',
    'SQ': 'Singapore Airlines', 'TR': 'Scoot', 'MH': 'Malaysia Airlines', 'AK': 'AirAsia',
    'TG': 'Thai Airways', 'FD': 'Thai AirAsia', 'VN': 'Vietnam Airlines', 'VJ': 'VietJet',
    'GA': 'Garuda Indonesia', 'QZ': 'AirAsia Indonesia', 'QR': 'Qatar Airways',
    'CX': 'Cathay Pacific', 'HX': 'Hong Kong Airlines',
    'CA': 'Air China', 'MU': 'China Eastern', 'CZ': 'China Southern', 'HU': 'Hainan Airlines',
    'CI': 'China Airlines', 'BR': 'EVA Air',
    'EK': 'Emirates', 'EY': 'Etihad Airways', 'WY': 'Oman Air',
    'SV': 'Saudia', 'GF': 'Gulf Air', 'KU': 'Kuwait Airways',
    'AI': 'Air India', '6E': 'IndiGo', 'UL': 'SriLankan Airlines',
    'QF': 'Qantas', 'JQ': 'Jetstar', 'NZ': 'Air New Zealand', 'FJ': 'Fiji Airways',
    // Americas
    'AA': 'American Airlines', 'DL': 'Delta Air Lines', 'UA': 'United Airlines',
    'WN': 'Southwest Airlines', 'B6': 'JetBlue', 'AS': 'Alaska Airlines',
    'NK': 'Spirit Airlines', 'F9': 'Frontier Airlines', 'HA': 'Hawaiian Airlines',
    'AC': 'Air Canada', 'WS': 'WestJet',
    'LA': 'LATAM Airlines', 'AV': 'Avianca', 'CM': 'Copa Airlines', 'AM': 'Aeromexico',
    // Europe
    'BA': 'British Airways', 'LH': 'Lufthansa', 'AF': 'Air France', 'KL': 'KLM',
    'IB': 'Iberia', 'AZ': 'ITA Airways', 'LX': 'SWISS', 'OS': 'Austrian Airlines',
    'SK': 'SAS', 'AY': 'Finnair', 'TP': 'TAP Portugal', 'TK': 'Turkish Airlines',
    'LO': 'LOT Polish', 'SN': 'Brussels Airlines', 'EI': 'Aer Lingus',
    'FR': 'Ryanair', 'U2': 'easyJet', 'W6': 'Wizz Air', 'VY': 'Vueling',
    // Africa
    'ET': 'Ethiopian Airlines', 'SA': 'South African Airways', 'KQ': 'Kenya Airways',
    'AT': 'Royal Air Maroc', 'MS': 'EgyptAir',
};

/**
 * Get airline name from IATA code, with fallback
 */
export function getAirlineName(code: string): string {
    return AIRLINES[code] || code;
}
