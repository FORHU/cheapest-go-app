export interface FlightSearchRequest {
    tripType: 'one-way' | 'round-trip' | 'multi-city';
    segments: FlightSearchSegment[];
    passengers: FlightPassengers;
    cabinClass: CabinClass;
    currency?: string;
    maxOffers?: number;
}

export interface FlightSearchSegment {
    origin: string;
    destination: string;
    departureDate: string;
}

export interface FlightPassengers {
    adults: number;
    children: number;
    infants: number;
}

export type FlightProvider = 'mystifly' | 'duffel';
export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

// ─── Search Response ─────────────────────────────────────────────────

export interface FlightSearchResponse {
    offers: FlightOffer[];

    metadata: {
        provider: string;
        searchId: string;
        timestamp: string;
        totalResults: number;
    };
}

// ─── Fare Policy ─────────────────────────────────────────────────────

/**
 * Normalized fare policy from the search or revalidation phase.
 *
 * Tristate badge logic:
 *   🟢 Free cancellation       → isRefundable && refundPenaltyAmount === 0
 *   🟡 Refundable (fees apply) → isRefundable && (refundPenaltyAmount > 0 || refundPenaltyAmount == null)
 *   🔴 Non-refundable          → !isRefundable
 *
 * IMPORTANT: null refundPenaltyAmount ≠ free refund.
 * null means "refundable but penalty amount unknown" → always show 🟡.
 */
export interface FarePolicy {
    isRefundable: boolean;
    isChangeable: boolean;
    refundPenaltyAmount?: number | null;
    refundPenaltyCurrency?: string | null;
    changePenaltyAmount?: number | null;
    changePenaltyCurrency?: string | null;
    /** 'search' = indicative only. 'revalidated' = locked before payment. */
    policyVersion: 'search' | 'revalidated';
    policySource: 'duffel' | 'mystifly_v1' | 'mystifly_v2';
}

// ─── Flight Offer ────────────────────────────────────────────────────

export interface FlightOffer {
    offerId: string;
    provider: string;
    price: FlightPrice;
    segments: FlightSegmentDetail[];
    totalDuration: number;
    totalStops: number;
    /** @deprecated Use farePolicy.isRefundable. Kept for backwards compat. */
    refundable: boolean;
    /** Normalized fare policy. policyVersion='search' from search results. */
    farePolicy?: FarePolicy;

    baggage?: {
        checkedBags: number;
        weightPerBag?: number;
        cabinBag?: string;
    };

    seatsRemaining?: number;

    brandedFare?: {
        brandName?: string;
        brandId?: string;
        brandTier?: number;
        fareType?: string;
    };

    validatingAirline?: string;
    lastTicketDate?: string;
    tripType?: 'one-way' | 'round-trip' | 'multi-city';
    _raw?: unknown;

    // ── Sorting & Normalization (Computed on server) ────────────────
    normalizedPriceUsd: number;
    bestScore: number;
    physicalFlightId: string;
    alternatives?: FlightOffer[];
}


// ─── Price ───────────────────────────────────────────────────────────

export interface FlightPrice {
    total: number;
    base: number;
    taxes: number;
    currency: string;
    pricePerAdult: number;
}

// ─── Segment Detail ──────────────────────────────────────────────────

export interface FlightSegmentDetail {
    segmentIndex: number;
    airline: {
        code: string;
        name: string;
    };
    origin: string;
    destination: string;
    flightNumber: string;

    departure: {
        airport: string;
        terminal?: string;
        time: string;
    };

    arrival: {
        airport: string;
        terminal?: string;
        time: string;
    };
    duration: number;
    stops: number;
    aircraft?: string;
    cabinClass: CabinClass;
    bookingClass?: string;
    fareBasis?: string;
}

// ─── Booking ─────────────────────────────────────────────────────────

export interface FlightBookingRequest {
    offerId: string;
    provider: string;
    passengers: FlightBookingPassenger[];
    contact: {
        email: string;
        phone: string;
        countryCode: string;
    };
    payment?: {
        method: 'credit_card';
        cardNumber: string;
        expiry: string;
        cvv: string;
        holderName: string;
    };
}

export interface FlightBookingPassenger {
    type: 'ADT' | 'CHD' | 'INF';
    title: 'Mr' | 'Mrs' | 'Ms' | 'Miss';
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    passport?: {
        number: string;
        expiryDate: string;
        issuingCountry: string;
    };
}

export interface FlightBookingResponse {
    success: boolean;
    data?: {
        bookingId: string;
        pnr: string;
        status: 'confirmed' | 'pending' | 'ticketed' | 'booked' | 'pnr_created' | 'awaiting_ticket' | 'failed' | 'cancel_requested' | 'cancelled' | 'cancel_failed' | 'refund_pending' | 'refund_failed' | 'refunded';
        ticketNumbers?: string[];
        totalPaid: number;
        currency: string;
    };
    error?: string;
}

// ─── Airline Database (for display) ──────────────────────────────────

export const AIRLINES: Record<string, string> = {
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
