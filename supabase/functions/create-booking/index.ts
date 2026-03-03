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

import { bookFlight, revalidateFare, MystiflyError } from '../_shared/mystiflyClient.ts';
import { createDuffelOrder } from '../_shared/duffelClient.ts';

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
        bookingClass?: string;
        fareBasis?: string;
        itineraryIndex?: number;
    }[];
    [key: string]: unknown;
}

interface BookingSession {
    id: string;
    user_id: string;
    provider: 'mystifly' | 'amadeus' | 'duffel' | 'mystifly_v2';
    flight: SessionFlight;
    passengers: SessionPassenger[];
    contact: SessionContact;
    status: string;
    expires_at: string;
}

interface ProviderBookingResult {
    pnr: string;
    providerOrderId?: string;
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
            hasRawOffer: !!bs.flight._rawOffer,
            rawOfferType: typeof bs.flight._rawOffer,
        });

        // ── 2. Call Provider to Book ──
        let result: ProviderBookingResult;

        if (bs.provider === 'mystifly' || bs.provider === 'mystifly_v2') {
            result = await bookWithMystifly(bs.flight, bs.passengers, bs.contact);
        } else if (bs.provider === 'duffel') {
            result = await bookWithDuffel(bs.flight, bs.passengers, bs.contact);
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
                // Store Duffel order ID separately for ticket/order retrieval
                ...(result.providerOrderId ? { amadeus_order_id: result.providerOrderId } : {}),
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
    let sessionId: string | undefined = undefined;

    // ── Extract tunneled IDs (FareSourceCode|ConversationId|SessionId) ──
    if (fareSourceCode?.includes('|')) {
        const parts = fareSourceCode.split('|');
        fareSourceCode = parts[0];
        conversationId = parts[1];
        sessionId = parts[2];
        console.log('[create-booking] Extracted tunneled IDs:', { conversationId, hasSessionId: !!sessionId });
    }

    if (!fareSourceCode) {
        throw new Error('Flight traceId (fareSourceCode) is missing for Mystifly booking');
    }

    // ── CRITICAL-1 FIX: Revalidate fare before booking ──
    console.log('[create-booking] Revalidating Mystifly fare before booking...');
    const revalResult = await revalidateFare(fareSourceCode, sessionId, conversationId);


    if (!revalResult.Success) {
        console.error('[create-booking] Mystifly Revalidation FAILED:', JSON.stringify(revalResult));
        const msg = revalResult.Message ?? '';
        const isUnavailable = /not available|not found|expired/i.test(msg);
        throw new Error(isUnavailable ? 'Flight is no longer available' : `Fare revalidation failed: ${msg}`);
    }

    // Use updated FareSourceCode if revalidation returned a new one
    const revalData = revalResult.Data ?? {};
    const revalFareInfo = revalData.FareItinerary?.AirItineraryFareInfo ?? revalData;
    if (revalFareInfo.FareSourceCode || revalData.FareSourceCode) {
        fareSourceCode = revalFareInfo.FareSourceCode ?? revalData.FareSourceCode ?? (fareSourceCode as string);
        console.log('[create-booking] Updated FareSourceCode from revalidation:', fareSourceCode.slice(0, 50) + '...');
    }

    // ── Support V2 Summarized vs V1 Nested ──
    // V2 (Summarized) always has FlightFaresList. V1 (Legacy) has FareItinerary or PricedItineraries.
    const isV2 = revalData.FlightFaresList !== undefined;
    console.log('[create-booking] Revalidation structure:', isV2 ? 'Summarized (V2)' : (revalData.PricedItineraries ? 'List (V1)' : 'Legacy (V1)'));

    let revalidatedPrice: number | undefined;
    let revalidatedCurrency: string | undefined;

    if (isV2 && revalData.FlightFaresList) {
        // V2 Summarized Path
        const fare = revalData.FlightFaresList[0];
        if (fare) {
            let total = 0;
            const passengerFares: any[] = fare.PassengerFare ?? [];
            for (const pf of passengerFares) {
                total += (pf.TotalFare || 0) * (pf.Quantity || 1);
                revalidatedCurrency = pf.Currency;
            }
            revalidatedPrice = total;
        }
    } else if (revalData.PricedItineraries) {
        // V1 List Path (Standard ASHR 1.0 Revalidate)
        const pricedItin = revalData.PricedItineraries[0];
        if (pricedItin) {
            const pricingInfo = pricedItin.AirItineraryPricingInfo;
            const itinFare = pricingInfo?.ItinTotalFare;
            if (itinFare) {
                const amount = itinFare.TotalFare?.Amount ?? itinFare.TotalFare?.Value;
                revalidatedPrice = amount ? Number(amount) : undefined;
                revalidatedCurrency = itinFare.TotalFare?.CurrencyCode ?? itinFare.TotalFare?.Currency;
            }
            // CRITICAL: Update FareSourceCode for Booking!
            const newCode = pricingInfo?.FareSourceCode || pricedItin.FareSourceCode;
            if (newCode) {
                fareSourceCode = newCode;
                console.log('[create-booking] Refreshed FareSourceCode from PricedItineraries:', fareSourceCode.slice(0, 50) + '...');
            }
        }
    } else {
        // V1 Nested Path (Legacy fallback)
        const itin = revalData.FareItinerary ?? revalData;
        const itinFare = itin.AirItineraryFareInfo?.ItinTotalFare ?? itin.ItinTotalFare;

        if (itinFare) {
            const amount = itinFare.TotalFare?.Amount ?? itinFare.TotalFare?.Value;
            revalidatedPrice = amount ? Number(amount) : undefined;
            revalidatedCurrency = itinFare.TotalFare?.CurrencyCode ?? itinFare.TotalFare?.Currency;

            // Check for refreshed code here too
            const newCode = itin.FareSourceCode || (itin.AirItineraryFareInfo as any)?.FareSourceCode;
            if (newCode) {
                fareSourceCode = newCode;
                console.log('[create-booking] Refreshed FareSourceCode from FareItinerary:', fareSourceCode.slice(0, 50) + '...');
            }
        } else {
            console.warn('[create-booking] V1 Revalidation structure unexpected. Keys:', Object.keys(itin));
        }
    }

    console.log('[create-booking] Revalidation parsed. Price:', revalidatedPrice, revalidatedCurrency);

    const isDemo = (Deno.env.get('MYSTIFLY_BASE_URL') ?? '').includes('demo');

    // Build Mystifly-format travelers (ASHR 1.0 compliant)
    // Build Mystifly-format travelers (ASHR 1.0 compliant)
    const airTravelers = passengers.map((pax: any) => {
        const birthDate = normalizeDate(pax.birthDate);
        const passportExpiry = pax.passportExpiry ? normalizeDate(pax.passportExpiry) : '2030-01-01';

        // ASHR 1.0 requires specific codes: ADT, CHD, INF
        let paxType = 'ADT';
        const typeStr = (pax.type || '').toLowerCase();
        if (typeStr.includes('child') || typeStr === 'chd') paxType = 'CHD';
        if (typeStr.includes('infant') || typeStr === 'inf') paxType = 'INF';

        return {
            PassengerType: paxType,
            Gender: pax.gender === 'M' || pax.gender === 'male' ? 'M' : 'F',
            PassengerName: {
                PassengerTitle: (GENDER_TO_TITLE[pax.gender] ?? 'Mr').toUpperCase(),
                PassengerFirstName: pax.firstName,
                PassengerLastName: pax.lastName,
            },
            DateOfBirth: `${birthDate}T00:00:00`,
            // ASHR 1.0 (v1) often expects flat passport fields
            PassportNumber: pax.passport || 'NOSPPT',
            ExpiryDate: `${passportExpiry}T00:00:00`,
            Country: pax.nationality || contact.country || 'KR',
            Nationality: pax.nationality || contact.country || 'KR',
            PassengerNationality: pax.nationality || contact.country || 'KR',
        };
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

    console.log('[create-booking] EXTREME LOG - FareSourceCode Metadata:', {
        length: (fareSourceCode as string).length,
        prefix: (fareSourceCode as string).slice(0, 10),
        isV2Style: (fareSourceCode as string).length < 200 && !(fareSourceCode as string).includes('+') && !(fareSourceCode as string).includes('/')
    });

    console.log('[create-booking] EXTREME LOG - Mystifly Body Keys:', Object.keys(mystiflyBody));

    // Log a snippet of the traveler to verify names/codes
    const firstPax = mystiflyBody.TravelerInfo?.AirTravelers?.[0];
    if (firstPax) {
        console.log('[create-booking] EXTREME LOG - First Traveler:', JSON.stringify({
            ...firstPax,
            PassengerFirstName: firstPax.PassengerName?.PassengerFirstName,
            PassengerLastName: firstPax.PassengerName?.PassengerLastName
        }));
    }


    const raw = await bookFlight(mystiflyBody, sessionId, conversationId);


    if (!raw.Success) {
        console.error('[create-booking] Mystifly Booking FAILED:', JSON.stringify(raw));
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

// ─── Duffel Booking ──────────────────────────────────────────────────

async function bookWithDuffel(
    flight: SessionFlight,
    passengers: SessionPassenger[],
    contact: SessionContact,
): Promise<ProviderBookingResult> {
    const rawOffer = flight._rawOffer as any;
    if (!rawOffer || !rawOffer.id) {
        throw new Error('Duffel offer missing or expired from session');
    }

    const offerId = rawOffer.id;
    const duffelPassengers = rawOffer.passengers || [];

    // Ensure we have matching passengers
    if (passengers.length > duffelPassengers.length) {
        throw new Error(`Passenger count mismatch: provided ${passengers.length}, offer requires ${duffelPassengers.length}`);
    }

    // Duffel strictly validates E.164 phone numbers (e.g. +821012345678)
    const countryCallingCode = contact.countryCode ? contact.countryCode.replace(/\D/g, '') : '82';
    // Remove all non-digits, and also strip any leading '0' which is common but invalid in E.164
    const phoneNumber = contact.phone.replace(/\D/g, '').replace(/^0+/, '');

    const formattedPhone = `+${countryCallingCode}${phoneNumber}`;

    const orderPassengers = passengers.map((pax, idx) => {
        const duffelPax = duffelPassengers[idx];
        const birthDate = normalizeDate(pax.birthDate);

        return {
            id: duffelPax.id,
            title: GENDER_TO_TITLE[pax.gender]?.toLowerCase() || 'mr',
            given_name: pax.firstName.toUpperCase(),
            family_name: pax.lastName.toUpperCase(),
            born_on: birthDate,
            email: contact.email,
            phone_number: formattedPhone,
            gender: pax.gender === 'M' || pax.gender === 'male' ? 'm' : 'f',
        };
    });

    try {
        console.log('[create-booking] Creating Duffel Order for offer:', offerId);
        const orderResponse = await createDuffelOrder({
            type: 'instant',
            selected_offers: [offerId],
            passengers: orderPassengers,
            payments: [
                {
                    type: 'balance',
                    amount: rawOffer.total_amount,
                    currency: rawOffer.total_currency,
                }
            ],
        });

        const order = orderResponse.data;
        if (!order || !order.id) {
            throw new Error('Duffel booking failed: no order ID returned');
        }

        const airlinePnr = order.booking_reference ?? order.id;

        // Extract Duffel tickets
        const documents = order.documents || [];
        const ticketNumbers = documents
            .filter((doc: any) => doc.type === 'electronic_ticket')
            .map((doc: any) => doc.unique_identifier);

        const isTicketed = ticketNumbers.length > 0 || !!order.booking_reference;

        return {
            pnr: airlinePnr,
            providerOrderId: order.id,
            providerStatus: isTicketed ? 'ticketed' : 'confirmed',
            rawPrice: parseFloat(order.total_amount ?? '0') || undefined,
            rawCurrency: order.total_currency ?? undefined,
            ticketNumbers: ticketNumbers.length > 0 ? ticketNumbers : undefined,
        };
    } catch (e: any) {
        console.error('[create-booking] Duffel Order Error:', e);
        throw e;
    }
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
