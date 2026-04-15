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

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

import { bookFlightV2, revalidateFare, revalidateFareV2, ticketFlight, MystiflyError } from '../_shared/mystiflyClient.ts';
import { createDuffelOrder } from '../_shared/duffelClient.ts';


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
    provider: 'mystifly_v2' | 'duffel';
    flight: SessionFlight;
    passengers: SessionPassenger[];
    contact: SessionContact;
    status: string;
    expires_at: string;
    payment_intent_id?: string | null;  // Set by /api/flights/book after PaymentIntent creation
    capture_method?: string;
    fare_policy?: Record<string, unknown> | null;
    seat_service_ids?: string[];
    seat_total?: number;
    // Duffel pre-order — stored by /api/flights/book so we skip re-booking
    duffel_pre_order_id?: string | null;
    duffel_pre_order_pnr?: string | null;
    duffel_pre_order_tickets?: string[] | null;
    duffel_pre_order_ticketed?: boolean | null;
}

interface ProviderBookingResult {
    pnr: string;
    providerOrderId?: string;
    providerStatus: string;
    rawPrice?: number;
    rawCurrency?: string;
    ticketNumbers?: string[];
    holdAllowed?: boolean;
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
        // 'payment_initiated' = set by /api/flights/book after Stripe PI is created (all providers)
        // 'initiated'         = legacy Mystifly status (kept for backwards-compat)
        // 'payment_authorized'= Mystifly after Stripe webhook marks the hold
        // 'pending'           = initial state (Duffel before /book runs)
        const claimableStatuses = ['pending', 'initiated', 'payment_initiated', 'payment_authorized'];

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

        const isMystifly = bs.provider === 'mystifly_v2';

        // ── 2. Call Provider to Book ──
        let result: ProviderBookingResult;
        let mystiflyRawData: any = null;

        if (isMystifly) {
            try {
                result = await bookWithMystifly(bs.flight, bs.passengers, bs.contact, 'mystifly_v2', (raw) => { mystiflyRawData = raw; });
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
            // ── Check for pre-created order (from /api/flights/book Step 1.5) ──
            // /api/flights/book creates the Duffel order synchronously before Stripe
            // and stores the result directly in the booking_sessions row.
            // Read it here — no Stripe API call needed.
            const paymentIntentId = bs.payment_intent_id;
            const preOrderId = bs.duffel_pre_order_id ?? null;
            const preOrderPnr = bs.duffel_pre_order_pnr ?? null;
            const preOrderTickets: string[] = bs.duffel_pre_order_tickets ?? [];
            const preOrderIsTicketed = bs.duffel_pre_order_ticketed ?? false;

            console.log(`[create-booking] Duffel pre-order check: id=${preOrderId} pnr=${preOrderPnr} ticketed=${preOrderIsTicketed}`);

            if (preOrderId && preOrderPnr) {
                // Use the pre-created order — no Duffel API call needed
                console.log(`[create-booking] Using pre-created Duffel order: ${preOrderId} / ${preOrderPnr}`);
                result = {
                    pnr: preOrderPnr,
                    providerOrderId: preOrderId,
                    providerStatus: preOrderIsTicketed ? 'ticketed' : 'booked',
                    ticketNumbers: preOrderTickets,
                };
            } else {
                console.warn(`[create-booking] No pre-order found in session — falling back to live Duffel booking`);
                // Fallback: create Duffel order now (offer may have expired — handled by error below)
                try {
                    result = await bookWithDuffel(bs.flight, bs.passengers, bs.contact, bs.seat_service_ids ?? [], bs.seat_total ?? 0);
                } catch (duffelErr: any) {
                    console.error('[create-booking] Duffel Booking FAILED:', duffelErr.message);

                    // If payment was authorized/captured, we must refund
                    if (paymentIntentId) {
                        console.warn('[create-booking] Duffel failed after payment — attempting automatic Stripe refund');
                        try {
                            const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
                            await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Basic ${btoa(stripeSecretKey + ':')}`,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                            });
                            // Also try refund if it was already captured
                            await fetch(`https://api.stripe.com/v1/refunds`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Basic ${btoa(stripeSecretKey + ':')}`,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                body: new URLSearchParams({ payment_intent: paymentIntentId }).toString(),
                            });
                        } catch (refundErr) {
                            console.error('[create-booking] Automatic refund failed (manual intervention needed):', refundErr);
                        }
                    }

                    await supabase.from('booking_sessions').update({ status: 'failed' }).eq('id', sessionId);

                    // Build a user-friendly error — strip raw JSON dumps
                    const isDuffel500 = duffelErr.status >= 500;
                    const isExpired = /expired|no longer available|not found|gone|422/i.test(duffelErr.message ?? '') || duffelErr.status === 422;
                    const friendlyError = isExpired
                        ? 'This flight offer has expired. Your payment has been automatically refunded. Please search again for current availability.'
                        : isDuffel500
                        ? 'The airline system is temporarily unavailable. Your payment has been automatically refunded.'
                        : `${duffelErr.message}. Your payment has been automatically refunded.`;
                    console.error('[create-booking] Duffel error details:', duffelErr.message);

                    return jsonResponse(corsHeaders, {
                        success: false,
                        error: friendlyError,
                    }, 502);
                }
            }
        } else {
            return jsonResponse(corsHeaders, { success: false, error: `Unknown provider: ${bs.provider}` }, 400);
        }

        // ── 3. Mystifly: check PNR and handle payment capture / cancel ──
        // (PNR check for Duffel is handled implicitly - if we reach here, it succeeded)
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

            // Per docs: BookFlight returns PNR. Then:
            // HoldAllowed=true (Private/Public fare) → call OrderTicket to issue ticket
            // HoldAllowed=false (WebFare) → BookFlight already issued ticket, check TicketStatus

            // Extract raw ticket status from BookFlight response
            const rawTicketStatus: string = String(
                mystiflyRawData?.TicketStatus ?? mystiflyRawData?.Status ?? result.providerStatus ?? 'pending'
            ).toLowerCase();

            // Extract TimeLimit from BookFlight response for background polling
            const rawTimeLimit = mystiflyRawData?.TimeLimit
                ?? mystiflyRawData?.BookingTimeLimit
                ?? mystiflyRawData?.TicketTimeLimit;
            const ticketTimeLimit = rawTimeLimit ? new Date(rawTimeLimit).toISOString() : null;

            let ticketStatus = rawTicketStatus;
            let finalTicketNumbers: string[] = result.ticketNumbers ?? [];

            // HoldAllowedTrue workflow: BookFlight → OrderTicket → TripDetails
            const holdAllowed = result.holdAllowed ?? false;
            if (holdAllowed) {
                console.log(`[create-booking] HoldAllowed=true — calling OrderTicket for PNR: ${result.pnr}`);
                try {
                    // Per docs: OrderTicket only needs the MF UniqueID (PNR) from BookFlight response
                    const orderTicketRaw = await ticketFlight(result.pnr);
                    if (orderTicketRaw.Success) {
                        ticketStatus = 'ticketed';
                        finalTicketNumbers = extractTicketNumbers(orderTicketRaw.Data ?? {});
                        console.log(`[create-booking] OrderTicket succeeded. Tickets: ${finalTicketNumbers.length}`);
                    } else {
                        // OrderTicket failed — booking exists but ticket not yet issued
                        console.warn(`[create-booking] OrderTicket failed: ${orderTicketRaw.Message} — marking awaiting_ticket`);
                        ticketStatus = 'pending';
                    }
                } catch (otErr: any) {
                    console.warn(`[create-booking] OrderTicket error: ${otErr.message} — marking awaiting_ticket`);
                    ticketStatus = 'pending';
                }
            }

            const isTicketed = ticketStatus === 'ticketed' || finalTicketNumbers.length > 0;

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
                    console.error('[create-booking] Stripe capture error (manual follow-up needed):', captureErr);
                }
            }

            const internalStatus = isTicketed ? 'ticketed' : 'awaiting_ticket';
            console.log(`[create-booking] Mystifly status: holdAllowed=${holdAllowed}, ticketStatus=${ticketStatus} → internal: ${internalStatus}`);

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

            // Pass finalTicketNumbers into result so insertSegmentsAndPassengers can save them
            result.ticketNumbers = finalTicketNumbers.length > 0 ? finalTicketNumbers : result.ticketNumbers;

            await insertSegmentsAndPassengers(supabase, bookingId, bs, result);

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
    provider: 'mystifly_v2',
    onRawData?: (raw: any) => void,
): Promise<ProviderBookingResult> {
    // UUID-format FareSources (e.g. "3430ac34-593c-439c-...") are V2 fares.
    const rawFareCode = flight.traceId?.split('|')[0] ?? '';
    const isUUIDFareSource = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawFareCode);
    const isV2Provider = provider === 'mystifly_v2' || isUUIDFareSource;
    console.log(`[create-booking] Mystifly routing: provider=${provider}, isUUID=${isUUIDFareSource} → ${isV2Provider ? 'V2' : 'V1'} book`);

    let fareSourceCode = flight.traceId;
    let conversationId: string | undefined = undefined;
    let sessionId: string | undefined = undefined;
    let searchIdentifier: string | undefined = undefined;

    // ── Extract tunneled IDs (FareSourceCode|ConversationId|SessionId|SearchIdentifier) ──
    if (fareSourceCode?.includes('|')) {
        const parts = fareSourceCode.split('|');
        fareSourceCode = parts[0];
        conversationId = parts[1];
        sessionId = parts[2];
        searchIdentifier = parts[3];
        console.log('[create-booking] Extracted tunneled IDs:', { conversationId, hasSessionId: !!sessionId, hasSearchId: !!searchIdentifier });
    }

    if (!fareSourceCode) {
        throw new Error('Flight traceId (fareSourceCode) is missing for Mystifly booking');
    }

    // ── STEP: Revalidate fare before booking ── version-paired, no fallback ──
    const revalidateFn = isV2Provider ? revalidateFareV2 : revalidateFare;
    console.log(`[create-booking] Revalidating with ${isV2Provider ? 'V2' : 'V1'} function...`);

    let revalResult: any = null;
    let revalidationSkipped = false;

    // Revalidation is required per Mystifly API workflow docs before calling BookFlight.
    // V2 endpoints (404 on demo) fall through to V1 /Revalidate/Flight automatically.
    try {
        revalResult = await revalidateFn(fareSourceCode, sessionId, conversationId, searchIdentifier);
    } catch (revalErr: any) {
        const isSkippable = revalErr?.type === 'PARSE'
            || /invalid json|empty response/i.test(revalErr?.message ?? '')
            || /version mismatch|searchidentifier|invalid faresource/i.test(revalErr?.message ?? '');
        if (isSkippable) {
            console.warn('[create-booking] Revalidation skipped:', revalErr.message);
            revalidationSkipped = true;
        } else {
            throw revalErr;
        }
    }

    let revalidatedPrice: number | undefined;
    let revalidatedCurrency: string | undefined;

    if (!revalidationSkipped) {
        if (!revalResult.Success) {
            console.error('[create-booking] Mystifly Revalidation FAILED:', JSON.stringify(revalResult));
            const msg = revalResult.Message ?? '';
            const isUnavailable = /not available|not found|expired/i.test(msg);
            const isMissingSearchId = /searchIdentifier.*empty|cannot revalidate/i.test(msg);
            if (isMissingSearchId) {
                console.warn('[create-booking] SearchIdentifier error — skipping revalidation, proceeding to book');
                revalidationSkipped = true;
            } else {
                throw new Error(isUnavailable ? 'Flight is no longer available' : `Fare revalidation failed: ${msg}`);
            }
        }
    }

    if (!revalidationSkipped) {

        // Use updated FareSourceCode if revalidation returned a new one
        const revalData = revalResult.Data ?? {};
        const revalFareInfo = revalData.FareItinerary?.AirItineraryFareInfo ?? revalData;
        if (revalFareInfo.FareSourceCode || revalData.FareSourceCode) {
            fareSourceCode = revalFareInfo.FareSourceCode ?? revalData.FareSourceCode ?? fareSourceCode!;
            console.log('[create-booking] Updated FareSourceCode from revalidation:', fareSourceCode!.slice(0, 50) + '...');
        }

        // ── Support V2 Summarized vs V1 Nested ──
        const isV2 = revalData.FlightFaresList !== undefined;
        console.log('[create-booking] Revalidation structure:', isV2 ? 'Summarized (V2)' : (revalData.PricedItineraries ? 'List (V1)' : 'Legacy (V1)'));

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

                const newCode = itin.FareSourceCode || (itin.AirItineraryFareInfo as any)?.FareSourceCode;
                if (newCode) {
                    fareSourceCode = newCode;
                    console.log('[create-booking] Refreshed FareSourceCode from FareItinerary:', fareSourceCode!.slice(0, 50) + '...');
                }
            } else {
                console.warn('[create-booking] V1 Revalidation structure unexpected. Keys:', Object.keys(itin));
            }
        }
    }

    // Per Mystifly docs, the Revalidation response may carry the SearchIdentifier
    // needed for BookFlight. Extract it here if we didn't have one from search.
    if (!revalidationSkipped && !searchIdentifier && revalResult) {
        const revalData2 = revalResult.Data ?? {};
        const revalSearchId: string =
            revalResult.SearchIdentifier ??
            revalData2.SearchIdentifier ??
            revalData2.TraceId ??
            revalData2.ConversationId ?? '';
        if (revalSearchId) {
            searchIdentifier = revalSearchId;
            console.log('[create-booking] SearchIdentifier obtained from revalidation response:', searchIdentifier.slice(0, 36));
        }
    }

    // Per docs: validate IsValid and HoldAllowed from Revalidation response.
    // HoldAllowed=true → Private/Public fare → must call OrderTicket after BookFlight.
    // HoldAllowed=false → WebFare → BookFlight issues ticket immediately.
    let holdAllowed = false;
    let isValid = true;
    if (!revalidationSkipped && revalResult?.Success) {
        const rd = revalResult.Data ?? {};
        const itin = rd.FareItinerary ?? rd.PricedItineraries?.[0] ?? rd;
        const fareInfo = itin.AirItineraryFareInfo ?? itin.AirItineraryPricingInfo ?? rd;
        holdAllowed = fareInfo.HoldAllowed === true || rd.HoldAllowed === true;
        isValid = fareInfo.IsValid !== false && rd.IsValid !== false; // default true if absent
        console.log(`[create-booking] Revalidation tags: IsValid=${isValid}, HoldAllowed=${holdAllowed}`);
        if (!isValid) {
            throw new Error('Revalidation returned IsValid=false — fare is no longer valid');
        }
    }

    console.log('[create-booking] Revalidation parsed. Price:', revalidatedPrice, revalidatedCurrency, revalidationSkipped ? '(skipped)' : '', 'hasSearchId:', !!searchIdentifier);

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


    // ── STEP: Book ──
    // v2025-04-08-a: Route ALL Mystifly fares through bookFlightV2.
    // The demo server's /api/v1/Book/Flight now rejects all fares with ERBUK103
    // "API version mismatch", even for V1 base64 FareSources from V1 search.
    // bookFlightV2 tries V2 OnePoint/Book (no SearchId), then V2 Book/Flight,
    // then falls back to V1 Book/Flight — covering all endpoint combinations.
    console.log(`[create-booking] v2025-04-08-a Booking via bookFlightV2 (covers V1+V2). FareSourceCode[:20]: ${fareSourceCode?.slice(0, 20)}, isV2Provider: ${isV2Provider}, hasSearchId: ${!!searchIdentifier}`);

    const raw: any = await bookFlightV2(mystiflyBody, sessionId, conversationId, searchIdentifier);

    console.log(`[create-booking] Book response: Success=${raw.Success}, Message=${raw.Message?.slice(0, 100)}`);

    if (!raw.Success) {
        const msg: string = raw.Message ?? '';

        // Mystifly returns "Booking already exists with one or more same PAX and segment. Ref# MFxxxxxxx"
        // when we retry a booking that already succeeded at Mystifly but wasn't saved to our DB.
        // Extract the PNR and treat this as a successful booking to avoid a stuck session.
        const dupMatch = msg.match(/Ref#\s*(MF\w+)/i);
        if (dupMatch) {
            const recoveredPnr = dupMatch[1];
            console.warn(`[create-booking] Duplicate booking detected — recovering PNR from Mystifly message: ${recoveredPnr}`);
            return {
                pnr: recoveredPnr,
                providerStatus: 'confirmed',
                rawPrice: revalidatedPrice,
                rawCurrency: revalidatedCurrency,
            };
        }

        // "Pending Need" (PN): Mystifly created the booking but the carrier hasn't confirmed
        // seats yet. The PNR (UniqueID) is still returned. Save it as awaiting_ticket and
        // let the ticket poller handle the eventual confirmation — do NOT cancel Stripe.
        const isPendingNeed = /pending need|awaiting carrier|pending airline pnr|booking.{0,30}unconfirmed/i.test(msg);
        const pendingPnr = raw.Data?.UniqueID ?? raw.UniqueID ?? '';
        if (isPendingNeed && pendingPnr) {
            console.warn(`[create-booking] Pending Need booking — PNR: ${pendingPnr}. Carrier confirmation pending.`);
            if (onRawData) onRawData(raw.Data ?? {});
            return {
                pnr: pendingPnr,
                providerStatus: 'pending_need',
                rawPrice: revalidatedPrice,
                rawCurrency: revalidatedCurrency,
                holdAllowed: false,
            };
        }

        // V2 UUID fares require SearchIdentifier which Mystifly doesn't return in search responses.
        // Surface a user-friendly message rather than a cryptic 502.
        const isSearchIdMissing = /searchidentifier.*empty|cannot bookflight.*searchidentifier/i.test(msg);
        if (isSearchIdMissing) {
            console.error('[create-booking] V2 fare cannot be booked — SearchIdentifier missing. FareSource:', rawFareCode.slice(0, 36));
            throw new Error('This flight offer cannot be booked at this time. Please go back and select a different flight.');
        }

        console.error('[create-booking] Mystifly Booking FAILED:', JSON.stringify(raw));
        throw new Error(msg || 'Mystifly booking failed');
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
        holdAllowed,
    };
}

// ─── Duffel Booking ──────────────────────────────────────────────────

async function bookWithDuffel(
    flight: SessionFlight,
    passengers: SessionPassenger[],
    contact: SessionContact,
    seatServiceIds: string[] = [],
    seatTotal: number = 0,
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
        console.log('[create-booking] Creating Duffel Order for offer:', offerId, {
            total_amount: rawOffer.total_amount,
            total_currency: rawOffer.total_currency,
            expires_at: rawOffer.expires_at,
            passengerCount: orderPassengers.length,
        });

        // Check if offer has expired before even trying
        if (rawOffer.expires_at && new Date(rawOffer.expires_at) < new Date()) {
            throw Object.assign(
                new Error(`Duffel offer expired at ${rawOffer.expires_at}. Please search again.`),
                { status: 422 }
            );
        }

        const totalAmount = seatServiceIds.length > 0 && seatTotal > 0
            ? (parseFloat(rawOffer.total_amount) + seatTotal).toFixed(2)
            : rawOffer.total_amount;

        const duffelPayload: Record<string, unknown> = {
            type: 'instant',
            selected_offers: [offerId],
            passengers: orderPassengers,
            payments: [
                {
                    type: 'balance',
                    amount: totalAmount,
                    currency: rawOffer.total_currency,
                }
            ],
            ...(seatServiceIds.length > 0 ? {
                services: seatServiceIds.map(id => ({ id, quantity: 1 })),
            } : {}),
        };

        // Retry once on Duffel 500 (transient server errors)
        let orderResponse: any;
        try {
            orderResponse = await createDuffelOrder(duffelPayload);
        } catch (firstErr: any) {
            console.error('[create-booking] Duffel order error:', firstErr.status, firstErr.message);
            if (firstErr.status === 500) {
                console.warn('[create-booking] Duffel 500, retrying once after 2s...');
                await new Promise(r => setTimeout(r, 2000));
                orderResponse = await createDuffelOrder(duffelPayload);
            } else {
                throw firstErr;
            }
        }

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
        itinerary_index: seg.itineraryIndex ?? 0,
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
