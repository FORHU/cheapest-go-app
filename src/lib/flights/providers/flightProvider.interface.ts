/**
 * FlightProvider Interface
 *
 * The canonical contract that ALL flight providers (Amadeus, Mystifly, mock, etc.)
 * MUST implement. This ensures every provider is interchangeable at the orchestrator
 * level — the system never depends on provider-specific shapes.
 *
 * Lifecycle:
 *   searchFlights → getFlightDetails → revalidateFlightPrice → createBooking → issueTicket
 *
 * Rules for implementors:
 *   1. Normalize ALL responses into the types defined here — no raw provider data in returns.
 *   2. Throw `FlightProviderError` (not generic Error) so the orchestrator can classify failures.
 *   3. Set `enabled` to false when required credentials/config are missing.
 */

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

/**
 * IFlightProvider — the contract every flight data source must implement.
 *
 * @example
 * ```ts
 * class AmadeusProvider implements IFlightProvider {
 *     readonly name = 'amadeus';
 *     readonly displayName = 'Amadeus GDS';
 *     readonly enabled = !!process.env.AMADEUS_API_KEY;
 *     // ... implement all methods
 * }
 * ```
 */
export interface IFlightProvider extends FlightProviderConfig {

    /**
     * Search for available flights matching the given criteria.
     *
     * This is the entry point of the booking flow. The orchestrator calls this
     * on all enabled providers in parallel and merges the results.
     *
     * @param params - Search criteria including route, dates, passengers, cabin class
     * @returns Normalized list of flight offers with pricing and segment details
     * @throws FlightProviderError with code AUTH_FAILURE, RATE_LIMIT, TIMEOUT, or VALIDATION_ERROR
     *
     * @example
     * const results = await provider.searchFlights({
     *     tripType: 'round-trip',
     *     segments: [
     *         { origin: 'MNL', destination: 'ICN', departureDate: '2026-03-15' },
     *         { origin: 'ICN', destination: 'MNL', departureDate: '2026-03-22' },
     *     ],
     *     passengers: { adults: 1, children: 0, infants: 0 },
     *     cabinClass: 'economy',
     * });
     */
    searchFlights(params: SearchFlightsParams): Promise<FlightSearchResponse>;

    /**
     * Get full details for a specific flight offer.
     *
     * Called when a user clicks on a search result to view detailed information
     * including fare rules, baggage policy, seat availability, and change/cancel conditions.
     * This is a read-only operation — it does NOT hold or reserve the offer.
     *
     * @param params - The offer ID and optional search session ID
     * @returns Detailed flight information including fare rules
     * @throws FlightProviderError with code OFFER_EXPIRED if the offer is no longer available
     *
     * @example
     * const details = await provider.getFlightDetails({
     *     offerId: 'amadeus_abc123',
     *     searchId: 'amadeus_search_xyz',
     * });
     * console.log(details.fareRules?.cancellationPolicy);
     */
    getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails>;

    /**
     * Revalidate (reprice) a flight offer before booking.
     *
     * Flight prices are volatile — they can change between search and booking.
     * This method confirms the current price and availability. MUST be called
     * before `createBooking` to avoid price surprises.
     *
     * The returned `priceChanged` flag indicates whether the price differs
     * from the original search. The UI should prompt the user to accept
     * the new price before proceeding.
     *
     * @param params - The offer to reprice
     * @returns Current price and availability status
     * @throws FlightProviderError with code OFFER_EXPIRED if no longer bookable
     *
     * @example
     * const revalidated = await provider.revalidateFlightPrice({
     *     offerId: 'amadeus_abc123',
     *     searchId: 'amadeus_search_xyz',
     * });
     * if (revalidated.priceChanged) {
     *     // Show user: "Price changed from $500 to $520. Continue?"
     * }
     */
    revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult>;

    /**
     * Create a booking (PNR) for the given offer and passengers.
     *
     * This creates a held reservation but does NOT issue tickets or charge payment.
     * The booking typically has a ticketing deadline (TTL) after which it auto-cancels.
     * Call `issueTicket` to finalize the booking with payment.
     *
     * Prerequisites:
     *   1. Offer must have been revalidated via `revalidateFlightPrice`
     *   2. At least 1 adult passenger is required
     *   3. Contact email and phone are required
     *
     * @param params - Offer ID, passenger details, and contact information
     * @returns Booking confirmation with PNR and ticketing deadline
     * @throws FlightProviderError with code BOOKING_FAILED or OFFER_EXPIRED
     *
     * @example
     * const booking = await provider.createBooking({
     *     offerId: 'amadeus_abc123',
     *     passengers: [{ type: 'adult', title: 'Mr', firstName: 'John', ... }],
     *     contact: { email: 'john@example.com', phone: '+1234567890', countryCode: 'US' },
     * });
     * console.log(`PNR: ${booking.pnr}, deadline: ${booking.ticketingDeadline}`);
     */
    createBooking(params: CreateBookingParams): Promise<CreateBookingResult>;

    /**
     * Issue tickets for an existing booking.
     *
     * This is the final step in the booking flow. It charges the payment method
     * and issues e-tickets. Once ticketed, the booking is non-reversible
     * (cancellation policies from fare rules apply).
     *
     * Prerequisites:
     *   1. Booking must exist and be in 'held' or 'confirmed' status
     *   2. Must be called before the ticketing deadline
     *   3. Valid payment details are required
     *
     * @param params - Booking ID, PNR, and payment details
     * @returns Ticketing result with e-ticket numbers
     * @throws FlightProviderError with code TICKETING_FAILED or OFFER_EXPIRED
     *
     * @example
     * const ticket = await provider.issueTicket({
     *     bookingId: 'BK123456',
     *     pnr: 'ABC123',
     *     payment: {
     *         method: 'credit_card',
     *         card: { number: '4111...', expiry: '12/28', cvv: '123', holderName: 'John Doe' },
     *     },
     * });
     * console.log(`Tickets issued: ${ticket.ticketNumbers.join(', ')}`);
     */
    issueTicket(params: IssueTicketParams): Promise<IssueTicketResult>;
}
