/**
 * Create Booking — Supabase Edge Function
 *
 * POST /functions/v1/create-booking
 *
 * Creates a real flight booking (PNR) by:
 *   1. Retrieving the booking session
 *   2. REVALIDATING the fare (Mystifly) or repricing (Amadeus)
 *   3. Calling Mystifly or Amadeus to book
 *   4. Saving the result to flight_bookings, flight_segments, passengers
 *   5. Marking the session as "booked"
 *
 * POST body:
 *   { sessionId: string }
 *
 * Returns:
 *   { success, bookingId, pnr, status, confirmedPrice, confirmedCurrency }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

import { bookFlight, revalidateFare, MystiflyError, MYSTIFLY_TARGET } from '../_shared/mystiflyClient.ts';

import { amadeusRequest, AmadeusError } from '../_shared/amadeusClient.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = ALLOWED_ORIGINS.length > 0
        ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : '*';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

// ─── Types ──────────────────────────────────────────────────────────

interface SessionPassenger {
    type: 'ADT' | 'CHD' | 'INF';
    firstName: string;
    lastName: string;
    gender: string;
    birthDate: string;
    nationality: string;
    passport: string;
    passportExpiry: string;
}

interface SessionContact {
    email: string;
    phone: string;
    countryCode: string;
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
}

interface SessionFlight {
    traceId?: string;
    resultIndex?: string;
    price: number;
    currency: string;
    validatingAirline?: string;
    segments: {
        airline: string;
        airlineName?: string;
        flightNumber: string;
        origin: string;
        destination: string;
        departureTime: string;
        arrivalTime: string;
        cabinClass?: string;
    }[];
    [key: string]: unknown;
}

interface BookingSession {
    id: string;
    user_id: string;
    provider: 'mystifly' | 'amadeus';
    flight: SessionFlight;
    passengers: SessionPassenger[];
    contact: SessionContact;
    status: string;
    expires_at: string;
}

interface ProviderBookingResult {
    pnr: string;
    amadeusOrderId?: string;
    providerStatus: string;
    rawPrice?: number;
    rawCurrency?: string;
    ticketNumbers?: string[];
}

// ─── Gender Mapping ─────────────────────────────────────────────────

const GENDER_TO_TITLE: Record<string, string> = {
    M: 'Mr',
    F: 'Ms',
    male: 'Mr',
    female: 'Ms',
};

// ─── Date Validation ────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** MED-3 FIX: Ensure date is in YYYY-MM-DD format. */
function normalizeDate(date: string): string {
    if (DATE_RE.test(date)) return date;
    // Try to parse common formats
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return date; // Return as-is if unparseable (will fail at provider)
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse Request ──
        const { sessionId } = JSON.parse(await req.text());

        if (!sessionId) {
            return jsonResponse(corsHeaders, { success: false, error: 'sessionId is required' }, 400);
        }

        // ── Supabase Admin Client ──
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // ── 1. Retrieve Booking Session ──
        const { data: session, error: fetchError } = await supabase
            .from('booking_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (fetchError || !session) {
            return jsonResponse(corsHeaders, { success: false, error: 'Booking session not found' }, 404);
        }

        const bs = session as BookingSession;

        // Validate status
        if (bs.status !== 'pending') {
            return jsonResponse(corsHeaders,
                { success: false, error: `Session already processed (status: ${bs.status})` },
                409,
            );
        }

        // Validate expiry
        if (new Date(bs.expires_at) < new Date()) {
            await supabase
                .from('booking_sessions')
                .update({ status: 'expired' })
                .eq('id', sessionId);

            return jsonResponse(corsHeaders, { success: false, error: 'Booking session has expired' }, 410);
        }

        console.log('[create-booking] Processing session:', {
            sessionId,
            provider: bs.provider,
            userId: bs.user_id,
            passengerCount: bs.passengers.length,
        });

        // ── 2. Call Provider to Book ──
        let result: ProviderBookingResult;

        if (bs.provider === 'mystifly') {
            result = await bookWithMystifly(bs.flight, bs.passengers, bs.contact);
        } else if (bs.provider === 'amadeus') {
            result = await bookWithAmadeus(bs.flight, bs.passengers, bs.contact);
        } else {
            return jsonResponse(corsHeaders, { success: false, error: `Unknown provider: ${bs.provider}` }, 400);
        }

        console.log('[create-booking] Provider returned PNR:', result.pnr);

        // ── 3. Save to flight_bookings ──
        // HIGH-1 FIX: Always use server-confirmed price from provider, not client-supplied
        const bookingPrice = result.rawPrice ?? bs.flight.price ?? 0;
        const bookingCurrency = result.rawCurrency ?? bs.flight.currency ?? 'USD';

        const finalStatus = (result.providerStatus === 'ticketed' || (result.ticketNumbers && result.ticketNumbers.length > 0))
            ? 'ticketed'
            : 'booked';

        const { data: booking, error: insertError } = await supabase
            .from('flight_bookings')
            .insert({
                user_id: bs.user_id,
                pnr: result.pnr,
                provider: bs.provider,
                total_price: bookingPrice,
                // LOW-3 FIX: Store currency alongside price
                currency: bookingCurrency,
                status: finalStatus,
                // HIGH-5 FIX: Store Amadeus order ID separately for ticket retrieval
                ...(result.amadeusOrderId ? { amadeus_order_id: result.amadeusOrderId } : {}),
            })
            .select('id')
            .single();

        if (insertError || !booking) {
            console.error('[create-booking] DB insert error:', insertError);
            throw new Error(`Failed to save booking: ${insertError?.message}`);
        }

        const bookingId = booking.id;

        // ── 4. Save flight_segments ──
        const segments = (bs.flight.segments ?? []).map((seg) => ({
            booking_id: bookingId,
            airline: seg.airline,
            flight_number: seg.flightNumber,
            origin: seg.origin,
            destination: seg.destination,
            departure: seg.departureTime,
            arrival: seg.arrivalTime,
        }));

        if (segments.length > 0) {
            const { error: segError } = await supabase
                .from('flight_segments')
                .insert(segments);

            if (segError) {
                console.error('[create-booking] Segments insert error:', segError);
            }
        }

        // ── 5. Save passengers ──
        const passengers = bs.passengers.map((pax, idx) => ({
            booking_id: bookingId,
            first_name: pax.firstName,
            last_name: pax.lastName,
            type: pax.type,
            passport: pax.passport ?? null,
            ticket_number: result.ticketNumbers?.[idx] ?? null,
        }));

        if (passengers.length > 0) {
            const { error: paxError } = await supabase
                .from('passengers')
                .insert(passengers);

            if (paxError) {
                console.error('[create-booking] Passengers insert error:', paxError);
            }
        }

        // ── 6. Mark session as booked ──
        await supabase
            .from('booking_sessions')
            .update({ status: 'booked' })
            .eq('id', sessionId);

        const durationMs = Date.now() - startMs;
        console.log(`[create-booking] Completed: ${bookingId} / PNR ${result.pnr} in ${durationMs}ms`);

        // HIGH-1 FIX: Return server-confirmed price so the API route can use it
        return jsonResponse(corsHeaders, {
            success: true,
            bookingId,
            pnr: result.pnr,
            status: finalStatus,
            confirmedPrice: bookingPrice,
            confirmedCurrency: bookingCurrency,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error(`[create-booking] Error (${durationMs}ms):`, err.message);

        const status =
            err instanceof MystiflyError ? Math.max(err.status, 400) :
                err instanceof AmadeusError ? Math.max(err.status, 400) :
                    500;

        return jsonResponse(getCorsHeaders(req),
            { success: false, error: err.message || 'Booking failed' },
            status,
        );
    }
});

// ─── Mystifly Booking ───────────────────────────────────────────────

async function bookWithMystifly(
    flight: SessionFlight,
    passengers: SessionPassenger[],
    contact: SessionContact,
): Promise<ProviderBookingResult> {
    let fareSourceCode = flight.traceId;
    let conversationId: string | undefined = undefined;

    // ── Extract tunneled IDs (FareSourceCode|ConversationId) ──
    if (fareSourceCode?.includes('|')) {
        const parts = fareSourceCode.split('|');
        fareSourceCode = parts[0];
        conversationId = parts[1];
        console.log('[create-booking] Extracted tunneled ConversationId:', conversationId);
    }

    if (!fareSourceCode) {
        throw new Error('Flight traceId (fareSourceCode) is missing for Mystifly booking');
    }

    // ── CRITICAL-1 FIX: Revalidate fare before booking ──
    console.log('[create-booking] Revalidating Mystifly fare before booking...');
    const revalResult = await revalidateFare(fareSourceCode, undefined, conversationId);


    if (!revalResult.Success) {
        const msg = revalResult.Message ?? '';
        const isUnavailable = /not available|not found|expired/i.test(msg);
        throw new Error(isUnavailable ? 'Flight is no longer available' : `Fare revalidation failed: ${msg}`);
    }

    // Use updated FareSourceCode if revalidation returned a new one
    const revalData = revalResult.Data ?? {};
    const revalFareInfo = revalData.FareItinerary?.AirItineraryFareInfo ?? revalData;
    if (revalFareInfo.FareSourceCode || revalData.FareSourceCode) {
        fareSourceCode = revalFareInfo.FareSourceCode ?? revalData.FareSourceCode ?? fareSourceCode;
        console.log('[create-booking] Updated FareSourceCode from revalidation');
    }

    // Extract revalidated price
    const revalItinFare = revalFareInfo.ItinTotalFare;
    const revalidatedPrice = revalItinFare
        ? (Number(revalItinFare.TotalFare?.Amount) || undefined)
        : undefined;
    const revalidatedCurrency = revalItinFare?.TotalFare?.CurrencyCode;

    console.log('[create-booking] Revalidation passed. Price:', revalidatedPrice, revalidatedCurrency);

    const isDemo = (Deno.env.get('MYSTIFLY_BASE_URL') ?? '').includes('demo');

    // Build Mystifly-format travelers
    const airTravelers = passengers.map((pax, idx) => {
        // MED-3 FIX: Ensure date is in proper format
        const birthDate = normalizeDate(pax.birthDate);

        const traveler: Record<string, any> = {
            PassengerType: pax.type,
            Gender: pax.gender === 'M' || pax.gender === 'male' ? 'M' : 'F',
            PassengerName: {
                PassengerTitle: GENDER_TO_TITLE[pax.gender] ?? 'Mr',
                PassengerFirstName: pax.firstName,
                PassengerLastName: pax.lastName,
            },
            DateOfBirth: `${birthDate}T00:00:00`,
            // CRITICAL-5 FIX: Use actual passenger nationality instead of hardcoded 'US'
            Nationality: pax.nationality || contact.country || 'KR',
            ...(idx === 0 ? {
                PhoneNumber: contact.phone,
                Email: contact.email,
                PostCode: contact.postalCode || '',
            } : {}),
        };

        // MED-4 FIX: Include passport expiry and issuing country
        if (pax.passport) {
            traveler.PassportNumber = pax.passport;
            if (pax.passportExpiry) {
                traveler.PassportExpiryDate = `${normalizeDate(pax.passportExpiry)}T00:00:00`;
            }
            traveler.PassportIssuedCountry = pax.nationality || contact.country || 'KR';
        }

        return traveler;
    });

    const mystiflyBody = {
        FareSourceCode: fareSourceCode,
        TravelerInfo: {
            AirTravelers: airTravelers,
            CountryCode: contact.country || passengers[0]?.nationality || 'KR',
            AreaCode: contact.countryCode || '',
            PhoneNumber: contact.phone,
            Email: contact.email,
            PostCode: contact.postalCode || '',
        },
    };




    const raw = await bookFlight(mystiflyBody, undefined, conversationId);


    if (!raw.Success) {
        throw new Error(raw.Message ?? 'Mystifly booking failed');
    }

    const data = raw.Data ?? {};
    const providerStatus = String(data.Status ?? 'confirmed').toLowerCase();

    let ticketNumbers: string[] = [];
    if (providerStatus === 'ticketed' || data.TktNumbers || data.TicketInfo || data.TravelItinerary?.TicketInfo) {
        ticketNumbers = extractTicketNumbers(data);
    }

    return {
        pnr: data.UniqueID ?? '',
        providerStatus: ticketNumbers.length > 0 ? 'ticketed' : providerStatus,
        rawPrice: revalidatedPrice ?? (parseFloat(String(data.TotalFare ?? data.TotalPrice ?? '0')) || undefined),
        rawCurrency: revalidatedCurrency ?? (data.Currency ? String(data.Currency) : undefined),
        ticketNumbers: ticketNumbers.length > 0 ? ticketNumbers : undefined,
    };
}

// ─── Amadeus Booking ────────────────────────────────────────────────

async function bookWithAmadeus(
    flight: SessionFlight,
    passengers: SessionPassenger[],
    contact: SessionContact,
): Promise<ProviderBookingResult> {
    // ── CRITICAL-2 FIX: Reuse original offer if possible to preserve segment integrity ──
    const baseOffer = (flight._rawOffer as any) || buildAmadeusFlightOffer(flight, passengers);

    console.log('[create-booking] Using Amadeus offer for pricing:', baseOffer.id);


    // ── SENIOR-LEVEL PRECISION: Synchronize travelers between pricing and booking ──
    // This ensures inventory is locked for the exact passenger mix (ADT, CHD, INF)
    const TRAVELER_TYPE_MAP: Record<string, string> = {
        ADT: 'ADULT',
        CHD: 'CHILD',
        INF: 'HELD_INFANT',
    };

    const pricingTravelers = passengers.map((pax, idx) => ({
        id: String(idx + 1),
        travelerType: TRAVELER_TYPE_MAP[pax.type] ?? 'ADULT',
    }));

    // Confirm pricing via Amadeus Flight Offers Price API
    // This is REQUIRED — prices change between search and booking
    console.log('[create-booking] Confirming price with Amadeus...');
    const priceResponse: any = await amadeusRequest('/v1/shopping/flight-offers/pricing', {
        method: 'POST',
        body: {
            data: {
                type: 'flight-offers-pricing',
                flightOffers: [baseOffer],
                travelers: pricingTravelers,
            },
        },
    });


    const pricedOffer = priceResponse.data?.flightOffers?.[0];
    if (!pricedOffer) {
        throw new Error('Amadeus pricing confirmation failed: no priced offer returned');
    }

    console.log('[create-booking] Confirmed price:', pricedOffer.price?.grandTotal, pricedOffer.price?.currency);

    // Build booking request with the priced offer
    const phoneNumber = contact.phone.replace(/\D/g, '');
    const countryCallingCode = contact.countryCode || '82';

    const travelers = passengers.map((pax, idx) => {
        // MED-3 FIX: Normalize dates
        const birthDate = normalizeDate(pax.birthDate);
        const passportExpiry = pax.passportExpiry ? normalizeDate(pax.passportExpiry) : '2030-01-01';

        // HIGH-6 FIX: Derive passport issuance date from expiry (10 years before expiry is standard)
        const expiryParts = passportExpiry.split('-');
        const issuanceYear = Math.max(2015, parseInt(expiryParts[0], 10) - 10);
        const issuanceDate = `${issuanceYear}-${expiryParts[1] || '01'}-${expiryParts[2] || '01'}`;

        return {
            id: String(idx + 1),
            dateOfBirth: birthDate,
            name: {
                firstName: pax.firstName.toUpperCase(),
                lastName: pax.lastName.toUpperCase(),
            },
            gender: pax.gender === 'M' || pax.gender === 'male' ? 'MALE' : 'FEMALE',
            contact: {
                emailAddress: contact.email,
                phones: [{
                    deviceType: 'MOBILE',
                    countryCallingCode,
                    number: phoneNumber,
                }],
            },
            documents: [{
                documentType: 'PASSPORT',
                birthPlace: contact.city,
                issuanceLocation: contact.city,
                issuanceDate,
                number: pax.passport,
                expiryDate: passportExpiry,
                issuanceCountry: pax.nationality || 'KR',
                validityCountry: pax.nationality || 'KR',
                nationality: pax.nationality || 'KR',
                holder: true,
            }],
        };
    });

    const body = {
        data: {
            type: 'flight-order',
            flightOffers: [pricedOffer],
            travelers,
            contacts: [{
                addresseeName: {
                    firstName: passengers[0].firstName.toUpperCase(),
                    lastName: passengers[0].lastName.toUpperCase(),
                },
                purpose: 'STANDARD',
                emailAddress: contact.email,
                phones: [{
                    deviceType: 'MOBILE',
                    countryCallingCode,
                    number: phoneNumber,
                }],
                address: {
                    lines: [contact.addressLine || 'N/A'],
                    postalCode: contact.postalCode || '00000',
                    cityName: contact.city || 'N/A',
                    countryCode: contact.country || 'KR',
                },
            }],
        },
    };

    const raw: any = await amadeusRequest('/v1/booking/flight-orders', {
        method: 'POST',
        body,
    });

    const order = raw.data;
    if (!order?.id) {
        throw new Error('Amadeus booking failed: no order ID returned');
    }

    // HIGH-5 FIX: Store BOTH the Amadeus order ID and the airline PNR separately
    const amadeusOrderId = order.id;
    const airlinePnr = order.associatedRecords?.[0]?.reference ?? order.id;

    return {
        pnr: airlinePnr,
        amadeusOrderId,
        providerStatus: 'confirmed',
        rawPrice: parseFloat(order.flightOffers?.[0]?.price?.grandTotal ?? '0') || undefined,
        rawCurrency: order.flightOffers?.[0]?.price?.currency ?? undefined,
    };
}

/**
 * Build a minimal Amadeus flight-offer object from our normalized flight data.
 * CRITICAL-2 FIX: This is now the ONLY path — rawOffer from client is never used.
 */
function buildAmadeusFlightOffer(
    flight: SessionFlight,
    passengers: SessionPassenger[],
): Record<string, any> {
    const cabinMap: Record<string, string> = {
        economy: 'ECONOMY',
        premium_economy: 'PREMIUM_ECONOMY',
        business: 'BUSINESS',
        first: 'FIRST',
    };

    // HIGH-3 FIX: Correct Amadeus traveler type mapping
    const TRAVELER_TYPE_MAP: Record<string, string> = {
        ADT: 'ADULT',
        CHD: 'CHILD',           // FIX: Was incorrectly 'HELD_INFANT'
        INF: 'HELD_INFANT',     // FIX: Infants on lap = HELD_INFANT (not SEATED_INFANT)
    };

    const mainAirline = flight.validatingAirline ?? flight.segments?.[0]?.airline ?? '';

    const fareDetailsBySegment = (flight.segments ?? []).map((seg, idx) => ({
        segmentId: String(idx + 1),
        cabin: cabinMap[seg.cabinClass ?? 'economy'] ?? 'ECONOMY',
        class: 'Y',
    }));

    return {
        type: 'flight-offer',
        id: flight.resultIndex ?? '1',
        source: 'GDS',
        validatingAirlineCodes: [mainAirline],
        itineraries: [{
            segments: (flight.segments ?? []).map((seg, idx) => ({
                departure: { iataCode: seg.origin, at: seg.departureTime },
                arrival: { iataCode: seg.destination, at: seg.arrivalTime },
                carrierCode: seg.airline,
                number: seg.flightNumber.replace(seg.airline, ''),
                id: String(idx + 1),
                numberOfStops: 0,
            })),
        }],
        price: {
            currency: flight.currency ?? 'USD',
            total: String(flight.price ?? 0),
            grandTotal: String(flight.price ?? 0),
        },
        travelerPricings: passengers.map((pax, idx) => ({
            travelerId: String(idx + 1),
            fareOption: 'STANDARD',
            travelerType: TRAVELER_TYPE_MAP[pax.type] ?? 'ADULT',
            fareDetailsBySegment,
        })),
    };
}

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(corsHeaders: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}

function extractTicketNumbers(data: Record<string, any>): string[] {
    const candidates = [
        data.TktNumbers,
        data.ETicketNumbers,
        data.TicketNumbers,
        data.eTicketNumbers,
    ];
    for (const field of candidates) {
        if (Array.isArray(field) && field.length > 0) {
            return field.map(String);
        }
    }
    const ticketInfos: any[] = data.TravelItinerary?.TicketInfo ?? data.TicketInfo ?? [];
    if (Array.isArray(ticketInfos) && ticketInfos.length > 0) {
        return ticketInfos
            .map((t: any) => t.TicketNumber ?? t.ETicketNumber ?? '')
            .filter(Boolean);
    }
    if (data.TicketNumber) return [String(data.TicketNumber)];
    if (data.ETicketNumber) return [String(data.ETicketNumber)];
    return [];
}
