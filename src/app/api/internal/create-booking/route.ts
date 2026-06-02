/**
 * POST /api/internal/create-booking
 *
 * Replaces the Supabase Edge Function `functions/v1/create-booking`.
 *
 * Reads a booking_sessions row, atomically locks it, then:
 *   - Mystifly: calls AirBook → captures or cancels Stripe PaymentIntent
 *   - Duffel:   reads the pre-created order from the session (created in /api/flights/book)
 *               and persists it as a flight_booking
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 *
 * Request body: { sessionId: string, paymentIntentId?: string }
 * Response:     { success: true, bookingId, pnr, status, confirmedPrice, confirmedCurrency }
 *             | { success: false, alreadyBooked?: true }
 *             | { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe } from '@/lib/stripe/server';
import { mystiflyRequest } from '@/lib/server/flights/mystifly-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ── Auth helper ──────────────────────────────────────────────────────────────

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[create-booking] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { sessionId?: string; paymentIntentId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { sessionId, paymentIntentId: piIdFromCaller } = body;

    if (!sessionId) {
        return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }

    const sql = getSqlAdmin();
    const db = createAdminClient();

    try {
        // ── Step 1: Atomically lock the session ──────────────────────────────
        // If status is already 'processing', 'booked', or 'failed' this UPDATE
        // returns 0 rows → idempotency guard fires.
        const locked = await sql`
            UPDATE booking_sessions
            SET status = 'processing'
            WHERE id = ${sessionId}
              AND status IN ('pending', 'initiated', 'payment_initiated', 'payment_authorized')
            RETURNING
                id,
                user_id,
                provider,
                flight,
                passengers,
                contact,
                payment_intent_id,
                fare_policy,
                duffel_pre_order_id,
                duffel_pre_order_pnr,
                duffel_pre_order_tickets,
                duffel_pre_order_ticketed,
                currency,
                original_price,
                charged_price
        `;

        if (locked.length === 0) {
            // Check if already booked
            const { data: existing } = await db
                .from('flight_bookings')
                .select('id, pnr, status')
                .eq('session_id', sessionId)
                .maybeSingle();

            if (existing) {
                console.log(`[create-booking] Session ${sessionId} already has booking ${existing.id} — returning idempotent result`);
                return NextResponse.json({
                    success: true,
                    alreadyBooked: true,
                    bookingId: existing.id,
                    pnr: existing.pnr,
                    status: existing.status,
                });
            }

            console.warn(`[create-booking] Could not lock session ${sessionId} — status may be 'processing', 'booked', or 'failed'`);
            return NextResponse.json({ success: false, alreadyBooked: true });
        }

        const session = locked[0] as any;
        const provider: string = session.provider ?? '';
        const flight: any = session.flight ?? {};
        const passengers: any[] = session.passengers ?? [];
        const paymentIntentId: string = piIdFromCaller ?? session.payment_intent_id ?? '';
        const farePolicy: any = session.fare_policy ?? null;
        const tripType: string = flight.tripType ?? flight.trip_type ?? 'one-way';

        console.log(`[create-booking] Processing session ${sessionId} provider=${provider}`);

        // ── Mystifly path ────────────────────────────────────────────────────
        if (provider === 'mystifly' || provider === 'mystifly_v2') {
            return await handleMystifly({
                db, sql, session, sessionId, provider, flight, passengers,
                paymentIntentId,
            });
        }

        // ── Duffel path ──────────────────────────────────────────────────────
        if (provider === 'duffel') {
            return await handleDuffel({
                db, sql, session, sessionId, flight, passengers,
                paymentIntentId,
            });
        }

        // Unknown provider
        await sql`
            UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}
        `;
        return NextResponse.json({ success: false, error: `Unknown provider: ${provider}` }, { status: 400 });

    } catch (err: any) {
        console.error('[create-booking] Unhandled error:', err);
        try {
            await sql`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}`;
        } catch { /* best-effort */ }
        return NextResponse.json({ success: false, error: err.message ?? 'Internal server error' }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mystifly handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleMystifly(ctx: {
    db: ReturnType<typeof createAdminClient>;
    sql: ReturnType<typeof getSqlAdmin>;
    session: any;
    sessionId: string;
    provider: string;
    flight: any;
    passengers: any[];
    paymentIntentId: string;
}): Promise<NextResponse> {
    const { db, sql, session, sessionId, flight, passengers, paymentIntentId } = ctx;

    // Extract traceId / FareSourceCode (tunneled format: FSC|convId||SearchId)
    const traceId: string = flight.traceId ?? flight.offer_id ?? '';
    const parts = traceId.split('|');
    const fareSourceCode = parts[0] ?? traceId;
    const conversationId = parts[1] ?? '';
    const searchIdentifier = parts[3] ?? '';

    if (!fareSourceCode) {
        await markFailed(sql, db, sessionId, paymentIntentId, 'No FareSourceCode in flight data');
        return NextResponse.json({ success: false, error: 'No FareSourceCode in flight data' }, { status: 400 });
    }

    const bookBody: Record<string, any> = {
        FareSourceCode: fareSourceCode,
        PassengerDetails: buildMystiflyPassengers(passengers),
    };

    if (conversationId) bookBody.ConversationId = conversationId;
    if (searchIdentifier) bookBody.SearchIdentifier = searchIdentifier;

    console.log(`[create-booking] Calling Mystifly AirBook FSC=${fareSourceCode.slice(0, 16)}… SearchId=${searchIdentifier ? searchIdentifier.slice(0, 8) + '…' : '(none)'}`);

    let bookData: any;
    try {
        bookData = await mystiflyRequest('/api/AirBook', bookBody);
    } catch (err: any) {
        console.error('[create-booking] Mystifly AirBook threw:', err.message);
        await markFailed(sql, db, sessionId, paymentIntentId, err.message);
        return NextResponse.json({ success: false, error: `Mystifly booking failed: ${err.message}` });
    }

    const pnr: string = bookData?.Data?.UniqueID ?? bookData?.UniqueID ?? '';
    const bookingSuccess = bookData?.Success === true && pnr;

    if (!bookingSuccess) {
        const errMsg = bookData?.Message ?? 'Mystifly booking failed';
        console.error('[create-booking] Mystifly AirBook failed:', errMsg);
        await markFailed(sql, db, sessionId, paymentIntentId, errMsg);
        return NextResponse.json({ success: false, error: errMsg });
    }

    // ── Capture Stripe PaymentIntent ─────────────────────────────────────
    let captureStatus = 'unknown';
    if (paymentIntentId) {
        try {
            const captured = await stripe.paymentIntents.capture(paymentIntentId);
            captureStatus = captured.status;
            console.log(`[create-booking] Stripe capture OK: ${paymentIntentId} status=${captureStatus}`);
        } catch (stripeErr: any) {
            console.error('[create-booking] Stripe capture failed:', stripeErr.message);
            // Don't abort — PNR exists; mark as awaiting_ticket and surface error in metadata
        }
    }

    // ── Resolve confirmed price from PI amount ───────────────────────────
    let confirmedPrice = session.charged_price ?? session.original_price ?? 0;
    let confirmedCurrency = (session.currency ?? 'usd').toUpperCase();
    if (paymentIntentId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            confirmedPrice = pi.amount / 100;
            confirmedCurrency = (pi.currency ?? 'usd').toUpperCase();
        } catch { /* non-critical */ }
    }

    const bookingStatus = 'pnr_created';

    // ── Insert flight_bookings ───────────────────────────────────────────
    const bookingRows = await sql`
        INSERT INTO flight_bookings (
            user_id, session_id, provider, pnr, status,
            payment_intent_id, confirmed_price, confirmed_currency,
            raw_provider_response
        ) VALUES (
            ${session.user_id},
            ${sessionId},
            ${'mystifly'},
            ${pnr},
            ${bookingStatus},
            ${paymentIntentId || null},
            ${confirmedPrice},
            ${confirmedCurrency},
            ${JSON.stringify(bookData)}
        )
        RETURNING id
    `;
    const bookingId: string = bookingRows[0]?.id;

    // ── Insert flight_segments ───────────────────────────────────────────
    await insertFlightSegments(sql, bookingId, flight);

    // ── Insert passengers ────────────────────────────────────────────────
    await insertPassengers(sql, bookingId, passengers, session.user_id);

    // ── Update session to booked ─────────────────────────────────────────
    await sql`
        UPDATE booking_sessions SET status = 'booked' WHERE id = ${sessionId}
    `;

    console.log(`[create-booking] Mystifly done. bookingId=${bookingId} pnr=${pnr}`);

    return NextResponse.json({
        success: true,
        bookingId,
        pnr,
        status: bookingStatus,
        confirmedPrice,
        confirmedCurrency,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Duffel handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleDuffel(ctx: {
    db: ReturnType<typeof createAdminClient>;
    sql: ReturnType<typeof getSqlAdmin>;
    session: any;
    sessionId: string;
    flight: any;
    passengers: any[];
    paymentIntentId: string;
}): Promise<NextResponse> {
    const { db, sql, session, sessionId, flight, passengers, paymentIntentId } = ctx;

    // Duffel pre-order was created synchronously in /api/flights/book (or /api/mobile/flights/book).
    // The order data is stored directly in the session columns.
    const preOrderId: string = session.duffel_pre_order_id ?? '';
    const preOrderPnr: string = session.duffel_pre_order_pnr ?? '';
    const preOrderTickets: string[] = session.duffel_pre_order_tickets ?? [];
    const preOrderTicketed: boolean = session.duffel_pre_order_ticketed === true;

    if (!preOrderId) {
        console.error(`[create-booking] Duffel session ${sessionId} has no pre-order — this session was created without Step 1.5`);
        await sql`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}`;
        return NextResponse.json({ success: false, error: 'Duffel pre-order missing from session' }, { status: 400 });
    }

    console.log(`[create-booking] Duffel pre-order found: orderId=${preOrderId} pnr=${preOrderPnr} tickets=${preOrderTickets.length}`);

    // ── Resolve confirmed price ──────────────────────────────────────────
    let confirmedPrice = session.charged_price ?? session.original_price ?? 0;
    let confirmedCurrency = (session.currency ?? 'usd').toUpperCase();
    if (paymentIntentId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            confirmedPrice = pi.amount / 100;
            confirmedCurrency = (pi.currency ?? 'usd').toUpperCase();
        } catch { /* non-critical */ }
    }

    const bookingStatus = preOrderTicketed ? 'ticketed' : 'awaiting_ticket';

    // ── Insert flight_bookings ───────────────────────────────────────────
    const bookingRows = await sql`
        INSERT INTO flight_bookings (
            user_id, session_id, provider, pnr, status,
            total_price, currency,
            payment_intent_id, confirmed_price, confirmed_currency,
            charged_price, supplier_cost,
            duffel_order_id, ticket_numbers,
            fare_policy, trip_type
        ) VALUES (
            ${session.user_id},
            ${sessionId},
            ${'duffel'},
            ${preOrderPnr},
            ${bookingStatus},
            ${confirmedPrice},
            ${confirmedCurrency},
            ${paymentIntentId || null},
            ${confirmedPrice},
            ${confirmedCurrency},
            ${confirmedPrice},
            ${session.original_price ?? confirmedPrice},
            ${preOrderId},
            ${JSON.stringify(preOrderTickets)},
            ${farePolicy ? sql.json(farePolicy) : null},
            ${tripType}
        )
        RETURNING id
    `;
    const bookingId: string = bookingRows[0]?.id;

    // ── Insert flight_segments ───────────────────────────────────────────
    await insertFlightSegments(sql, bookingId, flight);

    // ── Insert passengers ────────────────────────────────────────────────
    await insertPassengers(sql, bookingId, passengers, session.user_id, preOrderTickets);

    // ── Update session to booked ─────────────────────────────────────────
    await sql`UPDATE booking_sessions SET status = 'booked' WHERE id = ${sessionId}`;

    console.log(`[create-booking] Duffel done. bookingId=${bookingId} pnr=${preOrderPnr} status=${bookingStatus}`);

    return NextResponse.json({
        success: true,
        bookingId,
        pnr: preOrderPnr,
        status: bookingStatus,
        confirmedPrice,
        confirmedCurrency,
        ticketStatus: preOrderTicketed ? 'ticketed' : 'pending',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function markFailed(
    sql: ReturnType<typeof getSqlAdmin>,
    db: ReturnType<typeof createAdminClient>,
    sessionId: string,
    paymentIntentId: string,
    reason: string,
) {
    await sql`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}`;

    if (paymentIntentId) {
        try {
            await stripe.paymentIntents.cancel(paymentIntentId);
            console.log(`[create-booking] Stripe PI cancelled after failure: ${paymentIntentId}`);
        } catch (err: any) {
            console.error(`[create-booking] Failed to cancel Stripe PI ${paymentIntentId}:`, err.message);
        }
    }

    // Insert a failed booking row so confirm/webhook can surface a clear error
    try {
        await sql`
            INSERT INTO flight_bookings (
                session_id, provider, status, payment_intent_id
            )
            SELECT
                bs.id,
                bs.provider,
                'failed',
                ${paymentIntentId || null}
            FROM booking_sessions bs
            WHERE bs.id = ${sessionId}
            ON CONFLICT DO NOTHING
        `;
    } catch { /* best-effort */ }
}

/** Build Mystifly passenger objects from our internal passenger array */
function buildMystiflyPassengers(passengers: any[]): any[] {
    return passengers.map((pax: any) => {
        const typeMap: Record<string, string> = {
            ADT: 'ADT', adult: 'ADT',
            CHD: 'CHD', child: 'CHD',
            INF: 'INF', infant: 'INF',
        };
        const paxType = typeMap[pax.type] ?? typeMap[pax.passengerType] ?? 'ADT';

        return {
            Title: pax.title ?? (pax.gender?.toUpperCase() === 'M' ? 'MR' : 'MS'),
            Gender: pax.gender?.toUpperCase() === 'M' ? 'M' : 'F',
            LeadPassenger: pax.isLead ?? false,
            PassengerType: paxType,
            FirstName: pax.firstName,
            LastName: pax.lastName,
            DateOfBirth: pax.birthDate ?? pax.dob ?? '',
            PassportDetails: pax.passport ? {
                PassportNumber: pax.passport.number ?? '',
                ExpiryDate: pax.passport.expiryDate ?? '',
                CountryOfIssue: pax.passport.countryOfIssue ?? '',
                Nationality: pax.nationality ?? pax.passport.nationality ?? '',
            } : undefined,
        };
    });
}

/** Insert flight_segments from the session's flight object (handles both Duffel and Mystifly shapes) */
async function insertFlightSegments(
    sql: ReturnType<typeof getSqlAdmin>,
    bookingId: string,
    flight: any,
) {
    if (!bookingId) return;

    // Duffel: flight.slices[].segments[] — normalised by /book into flight.segments too
    // Mystifly: flight.segments[]
    const segments: any[] = flight.segments ?? [];

    if (segments.length === 0) {
        console.warn(`[create-booking] No segments found for booking ${bookingId}`);
        return;
    }

    for (const seg of segments) {
        try {
            // Duffel segment shape uses seg.departure.time / seg.arrival.time
            // Mystifly uses seg.departureTime / seg.arrivalTime
            const depTime = seg.departure?.time ?? seg.departing_at ?? seg.departureTime ?? null;
            const arrTime = seg.arrival?.time ?? seg.arriving_at ?? seg.arrivalTime ?? null;
            const origin = seg.origin?.iata_code ?? seg.origin?.airport ?? seg.origin ?? '';
            const destination = seg.destination?.iata_code ?? seg.destination?.airport ?? seg.destination ?? '';

            await sql`
                INSERT INTO flight_segments (
                    booking_id, airline, flight_number,
                    origin, destination, departure, arrival,
                    cabin_class, segment_index
                ) VALUES (
                    ${bookingId},
                    ${seg.airline ?? seg.airline_iata_code ?? ''},
                    ${seg.flightNumber ?? seg.flight_number ?? ''},
                    ${origin},
                    ${destination},
                    ${depTime},
                    ${arrTime},
                    ${seg.cabinClass ?? seg.cabin_class ?? 'economy'},
                    ${seg.segmentIndex ?? seg.itineraryIndex ?? 0}
                )
            `;
        } catch (segErr: any) {
            console.error(`[create-booking] Failed to insert segment for booking ${bookingId}:`, segErr.message);
        }
    }
}

/** Insert passengers from the session's passengers array */
async function insertPassengers(
    sql: ReturnType<typeof getSqlAdmin>,
    bookingId: string,
    passengers: any[],
    userId: string,
    ticketNumbers: string[] = [],
) {
    if (!bookingId) return;

    // Normalise type to schema constraint values: ADT | CHD | INF
    const normaliseType = (raw: string | undefined) => {
        const map: Record<string, string> = {
            ADT: 'ADT', adult: 'ADT',
            CHD: 'CHD', child: 'CHD',
            INF: 'INF', infant: 'INF',
        };
        return map[raw ?? ''] ?? 'ADT';
    };

    for (let i = 0; i < passengers.length; i++) {
        const pax = passengers[i];
        try {
            await sql`
                INSERT INTO passengers (
                    booking_id,
                    first_name, last_name,
                    type,
                    ticket_number, passport
                ) VALUES (
                    ${bookingId},
                    ${pax.firstName ?? pax.first_name ?? ''},
                    ${pax.lastName ?? pax.last_name ?? ''},
                    ${normaliseType(pax.type ?? pax.passengerType)},
                    ${ticketNumbers[i] ?? null},
                    ${pax.passport?.number ?? pax.passportNumber ?? null}
                )
            `;
        } catch (paxErr: any) {
            console.error(`[create-booking] Failed to insert passenger ${i} for booking ${bookingId}:`, paxErr.message);
        }
    }
}
