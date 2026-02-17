import type {
    FlightSearchRequest,
    FlightSearchResponse,
    FlightOffer,
    FlightPrice,
    FlightBookingPassenger,
    CabinClass,
} from '../types';

// ─── Provider Metadata ───────────────────────────────────────────────

export interface FlightProviderConfig {
    /** Unique machine-readable identifier (e.g. "amadeus", "mystifly", "mock") */
    readonly name: string;

    /** Human-readable label for UI display (e.g. "Amadeus GDS") */
    readonly displayName: string;

    /**
     * Whether this provider is currently operational.
     * Should return false when credentials are missing, rate-limited, or API is down.
     */
    readonly enabled: boolean;

    /** Provider priority — lower number = queried first in the orchestrator */
    readonly priority?: number;
}

// ─── Method Parameter Types ──────────────────────────────────────────

/**
 * Parameters for `searchFlights`.
 * Extends the base `FlightSearchRequest` with provider-specific search options.
 */
export interface SearchFlightsParams extends FlightSearchRequest {
    /**
     * Whether to include non-stop flights only.
     * @default false — returns all stop counts
     */
    nonStopOnly?: boolean;

    /**
     * Maximum price filter (in the request currency).
     * Providers that support server-side price filtering should honor this.
     */
    maxPrice?: number;

    /**
     * Preferred airlines (IATA codes).
     * Hint to the provider — not guaranteed to be enforced.
     */
    preferredAirlines?: string[];
}

/**
 * Parameters for `getFlightDetails`.
 */
export interface GetFlightDetailsParams {
    /** The offer ID returned from a previous `searchFlights` call */
    offerId: string;

    /**
     * The search session ID from the search metadata.
     * Some providers (e.g. Amadeus) require this to look up cached offers.
     */
    searchId?: string;
}

/**
 * Parameters for `revalidateFlightPrice`.
 */
export interface RevalidatePriceParams {
    /** The offer ID to reprice */
    offerId: string;

    /**
     * The search session ID from the original search.
     * Required by most GDS providers to locate the offer.
     */
    searchId?: string;
}

/**
 * Parameters for `createBooking`.
 */
export interface CreateBookingParams {
    /** The offer ID to book (must have been revalidated first) */
    offerId: string;

    /** The search session ID from the original search */
    searchId?: string;

    /** Validated passenger list — at least 1 adult required */
    passengers: FlightBookingPassenger[];

    /** Primary contact for the booking */
    contact: {
        email: string;
        phone: string;
        /** ISO 3166-1 alpha-2 country code */
        countryCode: string;
    };

    /** Optional special requests (meal, wheelchair, etc.) */
    specialRequests?: string[];
}

/**
 * Parameters for `issueTicket`.
 */
export interface IssueTicketParams {
    /** Booking ID returned from `createBooking` */
    bookingId: string;

    /** PNR (Passenger Name Record) from the booking confirmation */
    pnr: string;

    /** Payment details — required at ticketing time */
    payment: {
        method: 'credit_card' | 'payment_link' | 'invoice';
        /** Required when method = 'credit_card' */
        card?: {
            number: string;
            expiry: string;     // MM/YY
            cvv: string;
            holderName: string;
        };
    };
}

// ─── Method Return Types ─────────────────────────────────────────────

/**
 * Detailed flight information returned by `getFlightDetails`.
 * Extends `FlightOffer` with fare rules, seat maps, and extra metadata.
 */
export interface FlightDetails extends FlightOffer {
    /** Detailed fare rules and conditions */
    fareRules?: {
        /** Whether changes are allowed and at what cost */
        changePolicy: {
            allowed: boolean;
            fee?: { amount: number; currency: string };
            deadline?: string; // ISO 8601 datetime
        };
        /** Whether cancellation is allowed and at what cost */
        cancellationPolicy: {
            allowed: boolean;
            fee?: { amount: number; currency: string };
            deadline?: string;
        };
        /** Whether the fare is refundable */
        refundable: boolean;
    };

    /** Minimum connection time in minutes (for multi-stop) */
    minConnectionTime?: number;

    /** Last time this offer was validated */
    lastValidated?: string; // ISO 8601 datetime

    /** Time-to-live in seconds before this offer expires */
    ttl?: number;
}

/**
 * Result of price revalidation.
 * The price may have changed since the original search.
 */
export interface RevalidatePriceResult {
    /** Whether the offer is still available */
    available: boolean;

    /** The offerId (may change after revalidation on some providers) */
    offerId: string;

    /** Updated price — compare with original to detect changes */
    price: FlightPrice;

    /** Whether the price changed since the original search */
    priceChanged: boolean;

    /** Original price for comparison (if changed) */
    originalPrice?: FlightPrice;

    /** How long this revalidated price is guaranteed (seconds) */
    ttl?: number;
}

/**
 * Result of `createBooking`.
 * At this stage the booking is held but NOT yet ticketed.
 */
export interface CreateBookingResult {
    /** Whether the booking was successfully created */
    success: boolean;

    /** Booking reference from the provider */
    bookingId: string;

    /** Passenger Name Record — the universal booking identifier */
    pnr: string;

    /** Current booking status */
    status: 'held' | 'confirmed' | 'pending_payment' | 'failed';

    /** Deadline to complete ticketing before the booking expires */
    ticketingDeadline?: string; // ISO 8601 datetime

    /** Confirmed price at booking time */
    price: FlightPrice;

    /** Error message if status = 'failed' */
    error?: string;
}

/**
 * Result of `issueTicket`.
 * At this stage the booking is fully ticketed and the passenger can travel.
 */
export interface IssueTicketResult {
    /** Whether ticketing was successful */
    success: boolean;

    /** Booking reference */
    bookingId: string;

    /** PNR (may differ from booking PNR on some providers) */
    pnr: string;

    /** Final booking status */
    status: 'ticketed' | 'failed' | 'pending';

    /** Issued e-ticket numbers — one per passenger */
    ticketNumbers: string[];

    /** Total amount charged */
    totalPaid: number;

    /** Currency of the charge */
    currency: string;

    /** Error message if ticketing failed */
    error?: string;
}

// ─── Error Type ──────────────────────────────────────────────────────

/**
 * Typed error for provider failures.
 * Allows the orchestrator to classify and handle errors differently
 * (e.g. retry on TIMEOUT, skip on AUTH_FAILURE, alert on RATE_LIMIT).
 */
export class FlightProviderError extends Error {
    constructor(
        message: string,
        public readonly provider: string,
        public readonly code: FlightProviderErrorCode,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false,
    ) {
        super(message);
        this.name = 'FlightProviderError';
    }
}

export type FlightProviderErrorCode =
    | 'AUTH_FAILURE'        // Credentials invalid or expired
    | 'RATE_LIMIT'          // Provider rate limit exceeded
    | 'TIMEOUT'             // Request timed out
    | 'OFFER_EXPIRED'       // Offer no longer available
    | 'VALIDATION_ERROR'    // Invalid request parameters
    | 'BOOKING_FAILED'      // Booking could not be completed
    | 'TICKETING_FAILED'    // Ticketing could not be completed
    | 'PROVIDER_ERROR'      // Generic provider-side error
    | 'NETWORK_ERROR';      // Connectivity issue

// ─── The Interface ───────────────────────────────────────────────────


export interface IFlightProvider extends FlightProviderConfig {
    searchFlights(params: SearchFlightsParams): Promise<FlightSearchResponse>;
    getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails>;
    revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult>;
    createBooking(params: CreateBookingParams): Promise<CreateBookingResult>;
    issueTicket(params: IssueTicketParams): Promise<IssueTicketResult>;
}
