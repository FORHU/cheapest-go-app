// ─── Enums & Primitives ─────────────────────────────────────────────

export enum FlightProvider {
    MYSTIFLY = 'mystifly',
    DUFFEL = 'duffel',
    MYSTIFLY_V2 = 'mystifly_v2'
}

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export type TripType = 'one-way' | 'round-trip' | 'multi-city';

export type BookingStatus =
    | 'pending'
    | 'held'
    | 'confirmed'
    | 'ticketed'
    | 'cancelled'
    | 'refunded'
    | 'failed'
    | 'expired';

export type ProviderErrorCode =
    | 'AUTH_FAILURE'
    | 'RATE_LIMIT'
    | 'TIMEOUT'
    | 'OFFER_EXPIRED'
    | 'VALIDATION_ERROR'
    | 'BOOKING_FAILED'
    | 'TICKETING_FAILED'
    | 'PROVIDER_ERROR'
    | 'NETWORK_ERROR';

// ═════════════════════════════════════════════════════════════════════
//  FARE POLICY — normalized cancellation/change policy model
// ═════════════════════════════════════════════════════════════════════

/**
 * Normalized fare policy returned by both search and revalidation.
 *
 * policyVersion:
 *   'search'      → indicative only, sourced during flight search
 *   'revalidated' → locked, confirmed just before payment
 *
 * Do NOT show "Free cancellation" when refundPenaltyAmount is null.
 * null means "refundable but penalty amount unknown" → show "Refundable (fees may apply)"
 */
export interface NormalizedFarePolicy {
    isRefundable: boolean;
    isChangeable: boolean;
    refundPenaltyAmount?: number | null;   // null = may apply, amount unknown
    refundPenaltyCurrency?: string | null;
    changePenaltyAmount?: number | null;
    changePenaltyCurrency?: string | null;
    /** 'search' = indicative only. 'revalidated' = locked before payment. */
    policyVersion: 'search' | 'revalidated';
    policySource: 'duffel' | 'mystifly_v1' | 'mystifly_v2';
    rawSupplierPolicy?: unknown;
}

// ═════════════════════════════════════════════════════════════════════
//  NORMALIZED FLIGHT — the unified model returned to the frontend
// ═════════════════════════════════════════════════════════════════════

export interface NormalizedSegment {
    airline: string;
    airlineName: string;
    flightNumber: string;

    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    duration: number;

    terminal?: string;
    arrivalTerminal?: string;
    aircraft?: string;
    cabinClass: CabinClass;
    bookingClass?: string; // RBD
    fareBasis?: string;
    itineraryIndex?: number;
}

export interface NormalizedFlight {
    id: string;
    provider: FlightProvider;

    // ── Summary (for list/card display) ─────────────────────────────

    airline: string;
    airlineName: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    durationMinutes: number;
    stops: number;

    // ── Pricing ─────────────────────────────────────────────────────

    price: number;
    currency: string;
    baseFare: number;
    taxes: number;
    pricePerAdult: number;

    // ── Segments (for detail view) ──────────────────────────────────

    segments: NormalizedSegment[];

    // ── Fare Attributes ─────────────────────────────────────────────

    cabinClass: CabinClass;
    /** @deprecated Use farePolicy.isRefundable instead. Kept for backwards compat. */
    refundable: boolean;
    /** Normalized fare policy with penalty details. policyVersion='search' at this stage. */
    farePolicy?: NormalizedFarePolicy;
    seatsRemaining?: number;
    validatingAirline?: string;
    lastTicketDate?: string;

    // ── Baggage ─────────────────────────────────────────────────────

    checkedBags?: number;
    weightPerBag?: number;
    cabinBag?: string;
    brandName?: string;
    brandId?: string;
    fareType?: string;
    traceId?: string;
    resultIndex?: string;

    /** Raw provider offer for booking (not displayed, passed through to booking API) */
    _rawOffer?: unknown;

    // ── Sorting & Normalization (Computed on server) ────────────────
    normalizedPriceUsd: number;
    bestScore: number;
    physicalFlightId: string;    // Stable ID shared by all brands of the same flight
}


// ═════════════════════════════════════════════════════════════════════
//  SEARCH
// ═════════════════════════════════════════════════════════════════════

export interface FlightSearchSegment {
    origin: string;
    destination: string;
    departureDate: string;      // YYYY-MM-DD
}

export interface FlightPassengers {
    adults: number;
    children: number;
    infants: number;
}

export interface FlightSearchRequest {
    tripType: TripType;
    segments: FlightSearchSegment[];
    passengers: FlightPassengers;
    cabinClass: CabinClass;
    currency?: string;
    maxOffers?: number;
    nonStopOnly?: boolean;
    maxPrice?: number;
    preferredAirlines?: string[];
}

export interface ProviderSearchResult {
    provider: FlightProvider;
    offers: NormalizedFlight[];
    searchId: string;
    totalResults: number;
    durationMs: number;
    error?: string;
}

export interface UnifiedSearchResponse {
    success: boolean;
    offers: NormalizedFlight[];
    providers: {
        name: FlightProvider;
        count: number;
        durationMs: number;
        error?: string;
    }[];
    totalResults: number;
    searchTimestamp: string;
    searchDurationMs: number;
}

// ═════════════════════════════════════════════════════════════════════
//  REVALIDATION
// ═════════════════════════════════════════════════════════════════════

export interface RevalidateRequest {
    traceId: string;
    provider: FlightProvider;
}

export interface RevalidateResponse {
    success: boolean;
    available: boolean;
    price: number;
    currency: string;
    baseFare: number;
    taxes: number;
    priceChanged: boolean;
    traceId?: string;
    normalizedPriceUsd: number;  // Price in USD using fixed conversion rates
    bestScore: number;           // Weighted score for "Recommended" sorting
    physicalFlightId: string;    // Stable ID shared by all brands of the same flight
    farePolicy?: NormalizedFarePolicy;
    revalidatedAt?: string; // ISO string representing exact time of snapshot
    error?: string;
}

// ═════════════════════════════════════════════════════════════════════
//  BOOKING
// ═════════════════════════════════════════════════════════════════════

export interface BookingPassenger {
    type: 'adult' | 'child' | 'infant';
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

export interface BookingContact {
    email: string;
    phone: string;
    countryCode: string;
}

export interface CreateBookingRequest {
    traceId: string;
    provider: FlightProvider;
    passengers: BookingPassenger[];
    contact: BookingContact;
}

export interface CreateBookingResponse {
    success: boolean;
    bookingId: string;
    pnr: string;
    status: BookingStatus;
    ticketingDeadline?: string;
    price: number;
    currency: string;
    error?: string;
}

// ═════════════════════════════════════════════════════════════════════
//  DATABASE PERSISTENCE
// ═════════════════════════════════════════════════════════════════════

export interface SaveBookingRequest {
    userId: string;
    provider: FlightProvider;
    externalId: string;
    status: BookingStatus;
    totalPrice: number;
    currency: string;
    metadata: {
        pnr?: string;
        offerId?: string;
        passengers?: BookingPassenger[];
        contact?: BookingContact;
        segments?: NormalizedSegment[];
        traceId?: string;
        ticketNumbers?: string[];
        [key: string]: unknown;
    };
}

export interface SaveBookingResponse {
    success: boolean;
    bookingId: string;
    error?: string;
}

// ═════════════════════════════════════════════════════════════════════
//  PROVIDER RAW RESPONSE TYPES (internal — not exposed to frontend)
// ═════════════════════════════════════════════════════════════════════

// ── Mystifly ────────────────────────────────────────────────────────

export interface MystiflySessionResponse {
    Success: boolean;
    Message?: string;
    Data?: { SessionId: string };
}

export interface MystiflySearchResponse {
    Success: boolean;
    Message?: string;
    Data?: { FareItineraries?: unknown[] };
}

export interface MystiflyRevalidateResponse {
    Success: boolean;
    Message?: string;
    Data?: {
        PriceChanged?: boolean;
        FareItinerary?: unknown;
        FareSourceCode?: string;
        [key: string]: unknown;
    };
}

export interface MystiflyBookResponse {
    Success: boolean;
    Message?: string;
    Data?: {
        UniqueID?: string;
        Status?: string;
        [key: string]: unknown;
    };
}


// ═════════════════════════════════════════════════════════════════════
//  ERROR
// ═════════════════════════════════════════════════════════════════════

export class FlightProviderError extends Error {
    constructor(
        message: string,
        public readonly provider: FlightProvider,
        public readonly code: ProviderErrorCode,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false,
    ) {
        super(message);
        this.name = 'FlightProviderError';
    }
}

// ═════════════════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════════════════

export function formatDuration(minutes: number): string {
    if (minutes <= 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} m`;
    if (m === 0) return `${h} h`;
    return `${h}h ${m} m`;
}
