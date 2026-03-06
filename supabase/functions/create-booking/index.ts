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

import { bookFlight, bookFlightV2, revalidateFare, revalidateFareV2, MystiflyError } from '../_shared/mystiflyClient.ts';
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
    tripType?: string;
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
    provider: 'mystifly' | 'duffel' | 'mystifly_v2';
    flight: SessionFlight;
    passengers: SessionPassenger[];
    contact: SessionContact;
    status: string;
    expires_at: string;
    payment_intent_id?: string | null;  // Set by /api/flights/book after PaymentIntent creation
    capture_method?: string;
    fare_policy?: Record<string, unknown> | null;
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

        // ── Atomic status claim — prevents double-booking when webhook and
        //    /api/flights/confirm race each other. Only one UPDATE will succeed.
        //
        //    Strategy: use the already-read bs.status as the optimistic lock value.
        //    If another process changed the status between our SELECT and this UPDATE,
        //    the WHERE clause won't match → 0 rows returned → we lost the race.
        //
        //    Claimable statuses:
        //      'pending'            — Duffel: session untouched
        //      'initiated'          — Mystifly: /book updated session after PaymentIntent created
        //      'payment_authorized' — Mystifly: Stripe webhook set before calling us
        const claimableStatuses = ['pending', 'initiated', 'payment_authorized'];

        if (!claimableStatuses.includes(bs.status)) {
            // Fast-path: session is already terminal — no point trying to UPDATE
            const { data: existingBooking } = await supabase
                .from('flight_bookings')
                .select('id, pnr, status')
                .eq('session_id', sessionId)
                .maybeSingle();

            if (existingBooking) {
                return jsonResponse(corsHeaders, {
                    success: true,
                    bookingId: existingBooking.id,
                    pnr: existingBooking.pnr,
                    status: existingBooking.status,
                    alreadyBooked: true,
                });
            }

            return jsonResponse(corsHeaders,
                { success: false, error: `Session already processed (status: ${bs.status})` },
                409,
            );
        }

        // Optimistic-lock UPDATE: only succeeds if status hasn't changed since our SELECT
        const { data: claimedRows, error: claimError } = await supabase
            .from('booking_sessions')
            .update({ status: 'processing' })
            .eq('id', sessionId)
            .eq('status', bs.status)   // ← optimistic lock on the exact status we read
            .select('id');

        console.log('[create-booking] Claim result:', { claimed: claimedRows?.length, sessionStatus: bs.status, claimError });

        if (!claimedRows || claimedRows.length === 0) {
            // Race condition: another call already claimed this session
            const { data: existingBooking } = await supabase
                .from('flight_bookings')
                .select('id, pnr, status')
                .eq('session_id', sessionId)
                .maybeSingle();

            if (existingBooking) {
                return jsonResponse(corsHeaders, {
                    success: true,
                    bookingId: existingBooking.id,
                    pnr: existingBooking.pnr,
                    status: existingBooking.status,
                    alreadyBooked: true,
                });
            }

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

        const isMystifly = bs.provider === 'mystifly' || bs.provider === 'mystifly_v2';

        // ── 2. Call Provider to Book ──
        let result: ProviderBookingResult;
        let mystiflyRawData: any = null;

        if (isMystifly) {
            try {
                result = await bookWithMystifly(bs.flight, bs.passengers, bs.contact, bs.provider, (raw) => { mystiflyRawData = raw; });
            } catch (mystiflyErr: any) {
                // Mystifly booking failed — immediately cancel the authorized PaymentIntent.
                // The card was only held (requires_capture), never charged. Release the hold.
                const paymentIntentId = bs.payment_intent_id;
                if (paymentIntentId) {
                    try {
                        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
                        const cancelRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Basic ${btoa(stripeKey + ':')}`,
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                        });
                        const cancelData = await cancelRes.json();
                        console.log('[create-booking] PaymentIntent cancelled after Mystifly error:', cancelData.status);
                    } catch (cancelErr) {
                        console.error('[create-booking] Failed to cancel PaymentIntent after Mystifly error:', cancelErr);
                    }
                }

                // Mark session as failed so retries don't attempt the booking again
                await supabase.from('booking_sessions').update({ status: 'failed' }).eq('id', sessionId);

                console.error('[create-booking] Mystifly booking error — PaymentIntent cancelled, session marked failed:', mystiflyErr.message);
                return jsonResponse(corsHeaders, {
                    success: false,
                    error: mystiflyErr.message || 'Mystifly booking failed. Your card has not been charged.',
                }, 502);
            }
        } else if (bs.provider === 'duffel') {
            result = await bookWithDuffel(bs.flight, bs.passengers, bs.contact);
        } else {
            return jsonResponse(corsHeaders, { success: false, error: `Unknown provider: ${bs.provider}` }, 400);
        }

        // ── 3. Mystifly: check PNR and handle payment capture / cancel ──
        // STEP 6: PNR received from Mystifly → safe to capture Stripe payment now
        if (isMystifly) {
            const paymentIntentId = bs.payment_intent_id;

            if (!result.pnr) {
                // Case A: No PNR returned — booking failed
                // NEVER charge the user for a failed booking.
                console.error('[create-booking] Mystifly returned no PNR — cancelling PaymentIntent');

                if (paymentIntentId) {
                    try {
                        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
                        const cancelRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Basic ${btoa(stripeSecretKey + ':')}`,
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                        });
                        const cancelData = await cancelRes.json();
                        console.log('[create-booking] PaymentIntent cancelled:', cancelData.status);
                    } catch (cancelErr) {
                        console.error('[create-booking] Failed to cancel PaymentIntent:', cancelErr);
                    }
                }

                // Mark session as failed
                await supabase
                    .from('booking_sessions')
                    .update({ status: 'failed' })
                    .eq('id', sessionId);

                return jsonResponse(corsHeaders, {
                    success: false,
                    error: 'Mystifly did not return a PNR. Booking failed. Your card has not been charged.',
                }, 502);
            }

            // Case B & C: PNR received — evaluate ticket status then capture
            const ticketStatus = mystiflyRawData?.TicketStatus
                ?? mystiflyRawData?.Status
                ?? result.providerStatus
                ?? 'pending';

            const isTicketed = ticketStatus.toLowerCase() === 'ticketed'
                || (result.ticketNumbers && result.ticketNumbers.length > 0);

            // Extract Mystifly TimeLimit for background polling
            const rawTimeLimit = mystiflyRawData?.TimeLimit
                ?? mystiflyRawData?.BookingTimeLimit
                ?? mystiflyRawData?.TicketTimeLimit;
            const ticketTimeLimit = rawTimeLimit ? new Date(rawTimeLimit).toISOString() : null;

            // Capture the authorized Stripe payment now that PNR is secured
            if (paymentIntentId) {
                try {
                    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
                    const captureRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/capture`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Basic ${btoa(stripeSecretKey + ':')}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    });
                    const captureData = await captureRes.json();
                    if (captureData.status === 'succeeded') {
                        console.log(`[create-booking] Stripe payment captured. PNR: ${result.pnr}`);
                    } else {
                        console.error('[create-booking] Stripe capture failed:', captureData);
                    }
                } catch (captureErr) {
                    // Log but do NOT throw — PNR exists so booking is real
                    console.error('[create-booking] Stripe capture error (manual follow-up needed):', captureErr);
                }
            }

            // STEP 7A: Map to internal status
            // isTicketed → 'ticketed'
            // Pending/OnHold → 'awaiting_ticket' (poll later via poll-pending-tickets)
            const internalStatus = isTicketed ? 'ticketed' : 'awaiting_ticket';
            console.log(`[create-booking] Mystifly ticket status: ${ticketStatus} → internal: ${internalStatus}`);

            // Insert flight_booking record
            const bookingPrice = result.rawPrice ?? bs.flight.price ?? 0;
            const bookingCurrency = result.rawCurrency ?? bs.flight.currency ?? 'USD';

            const { data: booking, error: insertError } = await supabase
                .from('flight_bookings')
                .insert({
                    user_id: bs.user_id,
                    pnr: result.pnr,
                    provider: bs.provider,
                    total_price: bookingPrice,
                    currency: bookingCurrency,
                    status: internalStatus,
                    payment_intent_id: paymentIntentId ?? null,
                    ticket_time_limit: ticketTimeLimit,
                    trip_type: bs.flight.tripType ?? (
                        bs.flight.segments?.length === 1 ? 'one-way'
                            : bs.flight.segments?.length === 2
                                && bs.flight.segments[0].origin === bs.flight.segments[1].destination
                                ? 'round-trip'
                                : bs.flight.segments?.length > 2 ? 'multi-city' : 'one-way'
                    ),
                    session_id: sessionId,
                    fare_policy: bs.fare_policy || null,
                })
                .select('id')
                .single();

            if (insertError || !booking) {
                throw new Error(`Failed to save booking: ${insertError?.message}`);
            }

            const bookingId = booking.id;

            // Save segments and passengers (same for all providers)
            await insertSegmentsAndPassengers(supabase, bookingId, bs, result);

            // Mark session complete
            await supabase.from('booking_sessions').update({ status: 'booked' }).eq('id', sessionId);

            const durationMs = Date.now() - startMs;
            console.log(`[create-booking] Mystifly complete. BookingId: ${bookingId} PNR: ${result.pnr} Status: ${internalStatus} in ${durationMs}ms`);

            return jsonResponse(corsHeaders, {
                success: true,
                bookingId,
                pnr: result.pnr,
                status: internalStatus,
                ticketStatus,
                confirmedPrice: bookingPrice,
                confirmedCurrency: bookingCurrency,
            });
        }

        // ── 4. Duffel path (automatic capture — payment already charged) ──
        console.log('[create-booking] Provider returned PNR:', result.pnr);

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
                currency: bookingCurrency,
                status: finalStatus,
                trip_type: bs.flight.tripType ?? (
                    bs.flight.segments?.length === 1 ? 'one-way'
                        : bs.flight.segments?.length === 2
                            && bs.flight.segments[0].origin === bs.flight.segments[1].destination
                            ? 'round-trip'
                            : bs.flight.segments?.length > 2 ? 'multi-city' : 'one-way'
                ),
                ...(result.providerOrderId ? { provider_order_id: result.providerOrderId } : {}),
                session_id: sessionId,
                fare_policy: bs.fare_policy || null,
            })
            .select('id')
            .single();

        if (insertError || !booking) {
            console.error('[create-booking] DB insert error:', insertError);
            throw new Error(`Failed to save booking: ${insertError?.message}`);
        }

        const bookingId = booking.id;

        await insertSegmentsAndPassengers(supabase, bookingId, bs, result);

        // Mark session as booked
        await supabase
            .from('booking_sessions')
            .update({ status: 'booked' })
            .eq('id', sessionId);

        const durationMs = Date.now() - startMs;
        console.log(`[create-booking] Completed: ${bookingId} / PNR ${result.pnr} in ${durationMs}ms`);

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
    provider: 'mystifly' | 'duffel' | 'mystifly_v2',
    onRawData?: (raw: any) => void,
): Promise<ProviderBookingResult> {
    // Route strictly by provider — FareSourceCode must never cross API versions
    const isV2Provider = provider === 'mystifly_v2';
    console.log(`[create-booking] Mystifly routing: provider=${provider} → ${isV2Provider ? 'V2' : 'V1'} revalidate+book`);

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

    // ── STEP: Revalidate fare before booking ── version-paired, no fallback ──
    const revalidateFn = isV2Provider ? revalidateFareV2 : revalidateFare;
    console.log(`[create-booking] Revalidating with ${isV2Provider ? 'V2' : 'V1'} function...`);
    const revalResult = await revalidateFn(fareSourceCode, sessionId, conversationId);


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
        fareSourceCode = revalFareInfo.FareSourceCode ?? revalData.FareSourceCode ?? fareSourceCode!;
        console.log('[create-booking] Updated FareSourceCode from revalidation:', fareSourceCode!.slice(0, 50) + '...');
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
                console.log('[create-booking] Refreshed FareSourceCode from PricedItineraries:', fareSourceCode!.slice(0, 50) + '...');
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
                console.log('[create-booking] Refreshed FareSourceCode from FareItinerary:', fareSourceCode!.slice(0, 50) + '...');
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


    // ── STEP: Book — version-paired, no cross-version retry ──
    const bookFn = isV2Provider ? bookFlightV2 : bookFlight;
    console.log(`[create-booking] Booking with ${isV2Provider ? 'V2' : 'V1'} function. FareSourceCode[:20]: ${fareSourceCode?.slice(0, 20)}`);
    const raw = await bookFn(mystiflyBody, sessionId, conversationId);


    if (!raw.Success) {
        console.error('[create-booking] Mystifly Booking FAILED:', JSON.stringify(raw));
        throw new Error(raw.Message ?? 'Mystifly booking failed');
    }

    const data = raw.Data ?? {};
    const providerStatus = String(data.Status ?? 'confirmed').toLowerCase();

    // Invoke the callback with the raw response data so the caller can extract
    // TicketStatus, TimeLimit, etc. without re-parsing the whole response
    if (onRawData) onRawData(data);

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

/**
 * Shared helper: inserts flight_segments and passengers rows for a booking.
 * Called by both the Mystifly and Duffel paths.
 */
async function insertSegmentsAndPassengers(
    supabase: any,
    bookingId: string,
    bs: BookingSession,
    result: ProviderBookingResult,
): Promise<void> {
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
        const { error: segError } = await supabase.from('flight_segments').insert(segments);
        if (segError) console.error('[create-booking] Segments insert error:', segError);
    }

    const passengers = bs.passengers.map((pax: SessionPassenger, idx: number) => ({
        booking_id: bookingId,
        first_name: pax.firstName,
        last_name: pax.lastName,
        type: pax.type,
        passport: pax.passport ?? null,
        ticket_number: result.ticketNumbers?.[idx] ?? null,
    }));

    if (passengers.length > 0) {
        const { error: paxError } = await supabase.from('passengers').insert(passengers);
        if (paxError) console.error('[create-booking] Passengers insert error:', paxError);
    }
}

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
