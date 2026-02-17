import type { FlightSearchResponse } from '../types';
import type {
    IFlightProvider,
    SearchFlightsParams,
    GetFlightDetailsParams,
    RevalidatePriceParams,
    CreateBookingParams,
    IssueTicketParams,
    FlightDetails,
    RevalidatePriceResult,
    CreateBookingResult,
    IssueTicketResult,
} from './flightProvider.interface';
import { FlightProviderError } from './flightProvider.interface';

// ─── Config ──────────────────────────────────────────────────────────

const MYSTIFLY_API_KEY = process.env.MYSTIFLY_API_KEY || '';
const MYSTIFLY_ACCOUNT_ID = process.env.MYSTIFLY_ACCOUNT_ID || '';
const MYSTIFLY_BASE_URL = process.env.MYSTIFLY_BASE_URL || '';

// ─── Provider ────────────────────────────────────────────────────────

export class MystiflyProvider implements IFlightProvider {
    readonly name = 'mystifly';
    readonly displayName = 'Mystifly';
    readonly enabled: boolean;
    readonly priority = 2;

    constructor() {
        this.enabled = !!(MYSTIFLY_API_KEY && MYSTIFLY_ACCOUNT_ID);
    }

    // Search flights via Mystifly FareSearch API.
    // TODO: authenticate → POST /FareSearch → normalize into FlightOffer[]
    async searchFlights(params: SearchFlightsParams): Promise<FlightSearchResponse> {
        throw new FlightProviderError(
            'searchFlights not yet implemented for Mystifly',
            'mystifly',
            'PROVIDER_ERROR',
        );
    }

    // Retrieve detailed fare rules and baggage info for a specific offer.
    // TODO: POST /FareRules with the FareSourceCode from search results
    async getFlightDetails(params: GetFlightDetailsParams): Promise<FlightDetails> {
        throw new FlightProviderError(
            'getFlightDetails not yet implemented for Mystifly',
            'mystifly',
            'PROVIDER_ERROR',
        );
    }

    // Revalidate (reprice) an offer before booking.
    // TODO: POST /Revalidate with FareSourceCode
    async revalidateFlightPrice(params: RevalidatePriceParams): Promise<RevalidatePriceResult> {
        throw new FlightProviderError(
            'revalidateFlightPrice not yet implemented for Mystifly',
            'mystifly',
            'PROVIDER_ERROR',
        );
    }

    // Create a booking (PNR) using the validated fare.
    // TODO: POST /BookFlight with passenger details + FareSourceCode
    async createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
        throw new FlightProviderError(
            'createBooking not yet implemented for Mystifly',
            'mystifly',
            'BOOKING_FAILED',
        );
    }

    // Issue tickets for a confirmed Mystifly booking.
    // TODO: POST /TicketOrder with BookingID
    async issueTicket(params: IssueTicketParams): Promise<IssueTicketResult> {
        throw new FlightProviderError(
            'issueTicket not yet implemented for Mystifly',
            'mystifly',
            'TICKETING_FAILED',
        );
    }
}
