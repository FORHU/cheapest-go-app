/**
 * Mystifly Book Flight — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-book
 *
 * Books a flight using a revalidated FareSourceCode (traceId).
 * Transforms our CreateBookingRequest into Mystifly's BookFlight
 * body format, calls the API, and returns a normalized response.
 *
 * POST body: CreateBookingRequest
 *   { traceId, provider, passengers, contact }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type {
    CreateBookingRequest,
    BookingPassenger,
    BookingContact,
    BookingStatus,
    MystiflyBookResponse,
} from '../_shared/types.ts';
import { bookFlight, MystiflyError, getMystiflyTarget } from '../_shared/mystiflyClient.ts';



// ─── Mystifly Passenger Type Codes ──────────────────────────────────

const PASSENGER_TYPE_MAP: Record<BookingPassenger['type'], string> = {
    adult: 'ADT',
    child: 'CHD',
    infant: 'INF',
};

const GENDER_MAP: Record<BookingPassenger['title'], string> = {
    Mr: 'M',
    Mrs: 'F',
    Ms: 'F',
    Miss: 'F',
};

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse Request ──
        const body: CreateBookingRequest = JSON.parse(await req.text());

        // ── Validate ──
        if (!body.traceId) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'traceId (fareSourceCode) is required' },
                400,
            );
        }
        if (!body.passengers?.length) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'At least one passenger is required' },
                400,
            );
        }
        if (!body.contact?.email || !body.contact?.phone) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'Contact email and phone are required' },
                400,
            );
        }

        // Validate each passenger has required fields
        for (let i = 0; i < body.passengers.length; i++) {
            const pax = body.passengers[i];
            if (!pax.firstName || !pax.lastName || !pax.dateOfBirth) {
                return jsonResponse(corsHeaders,
                    { success: false, error: `Passenger ${i + 1}: firstName, lastName, and dateOfBirth are required` },
                    400,
                );
            }
        }

        console.log('[mystifly-book] Booking flight:', {
            traceId: body.traceId.slice(0, 20) + '…',
            passengerCount: body.passengers.length,
            contactEmail: body.contact.email,
        });

        // ── Build Mystifly BookFlight Request ──
        const isDemo = (Deno.env.get('MYSTIFLY_BASE_URL') ?? '').includes('demo');

        const mystiflyBody = buildMystiflyBookRequest(
            body.traceId,
            body.passengers,
            body.contact,
            isDemo,
        );

        // ── Call Mystifly BookFlight API ──
        const raw: MystiflyBookResponse = await bookFlight(mystiflyBody);

        // ── Parse Response ──
        if (!raw.Success) {
            const message = raw.Message ?? 'Booking failed';
            console.error('[mystifly-book] Mystifly booking failed:', message);

            return jsonResponse(corsHeaders, {
                success: false,
                bookingId: '',
                pnr: '',
                status: 'failed',
                price: 0,
                currency: 'USD',
                error: message,
            });
        }

        const data = raw.Data ?? {};
        const uniqueId = data.UniqueID ?? '';
        const mystiflyStatus = (data.Status ?? '').toString().toLowerCase();

        // Map Mystifly status to our BookingStatus
        const status = mapMystiflyStatus(mystiflyStatus);

        // Extract pricing if available
        const totalPrice = parseFloat(String(data.TotalFare ?? data.TotalPrice ?? '0')) || 0;
        const currency = String(data.Currency ?? 'USD');

        // Extract ticketing deadline if present
        const rawDeadline = data.TicketingDeadline ?? data.LastTicketDate;
        const ticketingDeadline: string | undefined = rawDeadline
            ? String(rawDeadline)
            : undefined;

        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-book] Booked: ${uniqueId} (${status}) in ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            bookingId: uniqueId,
            pnr: uniqueId,
            status,
            price: totalPrice,
            currency,
            ...(ticketingDeadline ? { ticketingDeadline } : {}),
            durationMs,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error(`[mystifly-book] Error (${durationMs}ms):`, err.message);

        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;

        return jsonResponse(corsHeaders,
            {
                success: false,
                bookingId: '',
                pnr: '',
                status: 'failed',
                price: 0,
                currency: 'USD',
                error: err.message || 'Booking failed',
            },
            status,
        );
    }
});

// ─── Build Mystifly Request Body ────────────────────────────────────

/**
 * Transform our CreateBookingRequest into Mystifly's BookFlight format.
 *
 * Mystifly expects TravelerInfo with PersonName, DateOfBirth, Gender,
 * PassengerType, PassportNumber, ExpiryDate, Country, and Nationality.
 */
function buildMystiflyBookRequest(
    fareSourceCode: string,
    passengers: BookingPassenger[],
    contact: BookingContact,
    isDemo: boolean,
): Record<string, any> {
    const airTravelers = passengers.map((pax, idx) => {
        const traveler: Record<string, any> = {
            PassengerType: PASSENGER_TYPE_MAP[pax.type] ?? 'ADT',
            Gender: GENDER_MAP[pax.title] ?? 'M',
            PassengerName: {
                PassengerTitle: pax.title,
                PassengerFirstName: pax.firstName,
                PassengerLastName: pax.lastName,
            },
            DateOfBirth: formatDateForMystifly(pax.dateOfBirth),
            Nationality: pax.nationality ?? 'US',
            // First passenger gets the contact info
            ...(idx === 0 ? {
                PhoneNumber: contact.phone,
                Email: contact.email,
                PostCode: '',
            } : {}),
        };

        // Add passport info if provided
        if (pax.passport) {
            traveler.PassportNumber = pax.passport.number;
            traveler.ExpiryDate = formatDateForMystifly(pax.passport.expiryDate);
            traveler.Country = pax.passport.issuingCountry ?? pax.nationality ?? 'US';
        }

        return traveler;
    });

    return {
        FareSourceCode: fareSourceCode,
        TravelerInfo: {
            AirTravelers: airTravelers,
            CountryCode: contact.countryCode ?? 'US',
            AreaCode: '',
            PhoneNumber: contact.phone,
            Email: contact.email,
        },
    };
}



// ─── Status Mapping ─────────────────────────────────────────────────

/**
 * Map Mystifly booking status strings to our BookingStatus enum.
 */
function mapMystiflyStatus(mystiflyStatus: string): BookingStatus {
    switch (mystiflyStatus) {
        case 'confirmed':
        case 'success':
        case 'booked':
            return 'confirmed';
        case 'ticketed':
            return 'ticketed';
        case 'held':
        case 'on_hold':
        case 'onhold':
            return 'held';
        case 'pending':
        case 'in_progress':
        case 'processing':
            return 'pending';
        case 'cancelled':
        case 'canceled':
            return 'cancelled';
        case 'failed':
        case 'rejected':
        case 'error':
            return 'failed';
        case 'expired':
            return 'expired';
        default:
            // If Mystifly returns Success=true, treat unknown statuses as confirmed
            return 'confirmed';
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Convert YYYY-MM-DD to Mystifly's expected date format.
 * Mystifly typically accepts YYYY-MM-DDT00:00:00 or YYYY-MM-DD.
 */
function formatDateForMystifly(date: string): string {
    // If already in ISO format, return as-is
    if (date.includes('T')) return date;
    // Append time component
    return `${date}T00:00:00`;
}

function jsonResponse(headers: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
}
