import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { FlightOffer, FarePolicy } from '@/types/flights';
import { logApiCall } from '@/lib/server/api-logger';
import { rateLimit } from '@/lib/server/rate-limit';
import { checkCsrf } from '@/lib/server/csrf';
import { flightBookingSchema } from '@/lib/schemas/flight';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP, getFlightPriceTolerance } from '@/lib/pricing';
import { passengerTypeForBirthDate } from '@/lib/age';
import { convertCurrency } from '@/lib/currency';

export const maxDuration = 120;
import { parseDuffelOffer } from '@/lib/server/flights/providers/duffel';
import { normalizedToFlightOffer } from '@/utils/flight-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    // Auth first so rate limit keys on user ID instead of IP (IP is spoofable).
    //
    // Guarded separately because this runs BEFORE the try/catch that wraps the rest
    // of the handler, and resolving a session is a database read. With the database
    // unreachable, Lucia threw straight out of the route, Next.js answered with its
    // HTML error page, and the client's res.json() died on "<!DOCTYPE" — an
    // infrastructure outage surfacing as an unparseable booking response.
    let auth: Awaited<ReturnType<typeof getAuthenticatedUser>>;
    try {
        auth = await getAuthenticatedUser();
    } catch (err: any) {
        console.error('[/book] Session lookup failed (database unreachable?):', err?.message ?? err);
        return NextResponse.json({
            success: false,
            errorCode: 'server_error',
            error: 'Booking is temporarily unavailable. Please try again shortly.',
        }, { status: 503 });
    }

    const { user, error: authError } = auth;
    if (authError || !user) {
        // Machine-readable code, not just the sentence: the client keys the sign-in
        // prompt off this, and a bare `error` string would be read as an unknown
        // error code and rendered as a generic failure instead.
        return NextResponse.json({
            success: false,
            errorCode: 'unauthenticated',
            error: 'Authentication required',
        }, { status: 401 });
    }

    // 5 booking attempts per minute per user
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'flights-book', userId: user.id });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {

        const body = await req.json();
        const { provider, flight, passengers, contact, idempotencyKey, farePolicy, seatServiceIds, seatTotal, bagServiceIds, bagTotal, confirmedPrice, bundleHotelId, displayCurrency } = body as {
            provider: string;
            flight: FlightOffer;
            passengers: any[];
            contact: { email: string; phone: string };
            idempotencyKey: string;
            farePolicy: FarePolicy;
            seatServiceIds?: string[];
            seatTotal?: number;
            bagServiceIds?: string[];
            bagTotal?: number;
            confirmedPrice?: number;
            bundleHotelId?: string;
            displayCurrency?: string;
        };

        // Use server-verified user ID
        const userId = user.id;

        // ── Validate ──
        if (provider === 'mystifly_v2' || provider === 'mystifly') {
            // Mystifly is not active — this offer should never reach checkout because
            // search-flights.ts filters all Mystifly results from the cache. If it somehow
            // does, return a user-friendly message asking them to search again.
            return NextResponse.json({
                success: false,
                error: 'This fare is no longer available. Please search again for current prices.',
            }, { status: 422 });
        }
        if (!provider || provider !== 'duffel') {
            return NextResponse.json({ success: false, error: 'invalid provider string passed' }, { status: 400 });
        }
        if (!flight || typeof flight !== 'object') {
            return NextResponse.json({ success: false, error: 'flight object is required' }, { status: 400 });
        }

        const passengerParsed = flightBookingSchema.safeParse({ passengers, contact });
        if (!passengerParsed.success) {
            return NextResponse.json(
                { success: false, error: passengerParsed.error.issues[0]?.message ?? 'Invalid passenger or contact data' },
                { status: 400 }
            );
        }

        // ── Passenger type vs date of birth ──
        // `type` arrives from the client and was never checked against `birthDate`, so a
        // toddler could be sent as ADT (or an adult as INF) and book fine. Airlines band
        // by age on the travel date and only catch it at check-in — after ticketing, when
        // the correction costs a reissue. Verify against the actual departure date.
        {
            const firstSegForAge = (flight as any).slices?.[0]?.segments?.[0] ?? (flight as any).segments?.[0];
            const departureForAge: string =
                firstSegForAge?.departing_at ?? firstSegForAge?.departureTime ?? firstSegForAge?.departure ?? '';

            if (departureForAge) {
                for (const pax of passengers) {
                    const expected = passengerTypeForBirthDate(pax.birthDate, departureForAge);
                    // null = unparseable date; the schema already rejects those.
                    if (expected && expected !== String(pax.type ?? '').toUpperCase()) {
                        const name = [pax.firstName, pax.lastName].filter(Boolean).join(' ') || 'Passenger';
                        console.warn(`[/book] Passenger type mismatch: ${name} declared ${pax.type}, born ${pax.birthDate}, is ${expected} on ${departureForAge.slice(0, 10)}`);
                        return NextResponse.json({
                            success: false,
                            errorCode: 'passenger_type_mismatch',
                            error: `${name}'s date of birth does not match the selected passenger type for this travel date. Please correct it and search again.`,
                        }, { status: 400 });
                    }
                }
            }
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        // Headers for ported internal routes (FUNCTIONS_SECRET)
        const edgeFnHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
        };

        // Resolve price/currency — client sends flat format (price: number, currency: string)
        // but Stripe and revalidation expect separate values
        const flightTotal = typeof flight.price === 'number'
            ? flight.price as number
            : flight.price?.total ?? 0;
        const flightCurrency = (
            (typeof flight.price === 'object' ? flight.price?.currency : undefined)
            || (flight as any).currency
            || 'USD'
        ).toLowerCase();

        // ── Price floor guard ──
        if (flightTotal <= 0) {
            return NextResponse.json({
                success: false,
                error: 'Invalid flight price — must be greater than $0',
            }, { status: 400 });
        }

        // One client for the whole request — the three separate instantiations shared a
        // pool anyway, so they bought nothing but three objects and three names for the
        // same thing.
        const db = createAdminClient();

        // ── Duplicate flight booking guard ──
        //
        // One departure per traveller per calendar day. Route is deliberately NOT part
        // of the match: nobody can be on two aircraft at once, so a second departure
        // that day is a conflict wherever it happens to be going.
        //
        // Provider-agnostic — it matches on the itinerary, not on who sold it, because
        // `flight_bookings` is filtered only by user and status.
        //
        // Duffel segments carry iata_code objects; other providers send plain strings.
        {
            const rawFlight = flight as any;
            // Duffel: slices[0].segments[0]; Mystifly: segments[0]
            const firstSeg = rawFlight.slices?.[0]?.segments?.[0] ?? rawFlight.segments?.[0];
            const extractIata = (loc: any): string => {
                if (!loc) return '';
                if (typeof loc === 'string') return loc;
                return loc.iata_code ?? loc.iataCode ?? loc.code ?? '';
            };
            const origin = extractIata(firstSeg?.origin);
            const destination = extractIata(firstSeg?.destination);
            // Duffel departure field is departing_at; Mystifly uses departureTime / departure
            const departureRaw: string = firstSeg?.departing_at ?? firstSeg?.departureTime ?? firstSeg?.departure ?? '';
            const departureDate = departureRaw.slice(0, 10);

            if (departureDate) {
                // `flight_segments.departure` is timestamptz — an instant in UTC — while
                // `departureDate` is the LOCAL calendar day at the origin. Rather than
                // converting each stored row back to a local date (which would need that
                // row's own timezone), the traveller's local day is converted ONCE into the
                // UTC interval it occupies and the query asks for departures inside it.
                // Exact, and correct across origins in different zones.
                const dayMs = 24 * 60 * 60 * 1000;
                const instantMs = Date.parse(departureRaw);
                const wallClockMs = Date.parse(`${departureRaw.slice(0, 19)}Z`);
                // 0 when the string carries no offset — then local day == UTC day.
                const offsetMs = Number.isFinite(instantMs) && Number.isFinite(wallClockMs)
                    ? wallClockMs - instantMs
                    : 0;

                // Local midnight at the origin, expressed in UTC.
                const localMidnightUtc = new Date(`${departureDate}T00:00:00Z`).getTime() - offsetMs;
                const windowStart = new Date(localMidnightUtc).toISOString();
                const windowEnd = new Date(localMidnightUtc + dayMs).toISOString();

                // One round trip, not two. Previously this fetched every active booking id
                // and then queried segments by that id list; the join does both at once and
                // stops at the first conflict.
                //
                // Only statuses where the ticket is genuinely gone count as released.
                // `cancel_failed` and `cancel_requested` do not release anything — a failed
                // cancellation means the airline still holds the booking — so excluding them
                // let a traveller rebook a flight they were still holding, and pay twice.
                const sql = getSqlAdmin();
                let clash: { booking_id: string; origin: string; destination: string } | null = null;
                try {
                    const rows = await sql`
                        SELECT fs.booking_id, fs.origin, fs.destination
                        FROM flight_segments fs
                        JOIN flight_bookings fb ON fb.id = fs.booking_id
                        WHERE fb.user_id = ${userId}
                          AND fb.status NOT IN ('cancelled', 'cancelled_provider_missing', 'refunded')
                          AND fs.departure >= ${windowStart}
                          AND fs.departure <  ${windowEnd}
                        LIMIT 1
                    `;
                    clash = (rows[0] as any) ?? null;
                } catch (guardErr: any) {
                    // Never fail silently: without this lookup the guard cannot do its job
                    // and the traveller risks paying twice. A swallowed error here is exactly
                    // how this guard went unnoticed for its entire existence.
                    console.error('[/book] duplicate guard lookup FAILED — duplicates cannot be detected:', guardErr?.message ?? guardErr);
                }

                console.log(
                    `[/book] duplicate guard: ${origin}->${destination} departing ${departureDate} ` +
                    `(offset ${offsetMs / 3_600_000}h, UTC window ${windowStart}..${windowEnd}) — ` +
                    `verdict=${clash ? 'BLOCK' : 'allow'}`,
                );

                if (clash) {
                    return NextResponse.json({
                        success: false,
                        code: 'DUPLICATE_BOOKING',
                        existingBookingId: clash.booking_id,
                        // The route of the booking that CLASHES, not the one being attempted
                        // — the traveller needs to recognise what they already hold, and it
                        // may well go somewhere else entirely.
                        route: `${clash.origin} → ${clash.destination}`,
                        departureDate,
                        error: `You already have an active flight departing on ${departureDate} (${clash.origin} → ${clash.destination}). Only one departure per day can be booked.`,
                    }, { status: 409 });
                }
            }
        }

        // ── Duffel offer expiry check ──
        // NOTE: No buffer needed here because Step 1.5 creates the Duffel order
        // synchronously before Stripe, locking in the fare. If the offer has already
        // expired, the auto-refresh in Step 1.5 handles it. Only reject if truly gone.
        if (provider === 'duffel') {
            const rawOffer = (flight as any)._rawOffer;
            const expiresAt = rawOffer?.expires_at ?? (flight as any).expires_at ?? (flight as any).lastTicketDate;
            if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
                console.warn(`[/book] Duffel offer appears expired (${expiresAt}) — proceeding anyway, auto-refresh will handle it`);
                // Don't reject — let the pre-order attempt + auto-refresh handle it
            }
        }

        // ── SERVER-SIDE REVALIDATION & TTL GUARD ──
        const revalStart = Date.now();
        const revalEndpoint = `${siteUrl}/api/internal/revalidate-flight`;
        const revalRes = await fetch(revalEndpoint, {
            method: 'POST',
            headers: edgeFnHeaders,
            body: JSON.stringify({
                userId,
                provider,
                flightPayload: { ...flight, oldPrice: flightTotal },
            }),
        });

        const revalData = await revalRes.json();
        logApiCall({
            provider, endpoint: revalEndpoint, durationMs: Date.now() - revalStart,
            requestParams: { origin: flight.segments?.[0]?.origin, destination: flight.segments?.[flight.segments.length - 1]?.destination, oldPrice: flightTotal },
            responseStatus: revalRes.status, userId,
            responseSummary: { seatsAvailable: revalData.seatsAvailable, priceChanged: revalData.priceChanged, newPrice: revalData.newPrice },
            errorMessage: !revalData.success ? (revalData.error || 'Revalidation failed') : undefined,
        });

        if (!revalData.success || !revalData.seatsAvailable) {
            return NextResponse.json({
                success: false,
                error: revalData.error || 'This flight is no longer available from the supplier. Please return to search.'
            }, { status: 409 });
        }

        // The revalidation gate applies getFlightPriceTolerance() — the same threshold
        // used at order time below — and only flags increases.
        // Guard: newPrice=0 means price extraction failed, not a real $0 fare.
        if (revalData.priceChanged && revalData.newPrice > 0) {
            return NextResponse.json({
                success: false,
                error: 'price_changed',
                oldPrice: flightTotal,
                newPrice: revalData.newPrice,
                currency: (flight as any).currency || 'USD',
            }, { status: 409 });
        }

        if (revalData.priceChanged && revalData.newPrice === 0) {
            console.warn(`[/book] Revalidation reported priceChanged but newPrice=0 — likely a parse failure. Proceeding with original price: ${flightTotal}`);
        }

        // A fare that dropped never reaches the check above — there is nothing for the
        // traveller to approve. It must still be adopted, or we would charge the price
        // they were quoted while the supplier bills us the lower one, pocketing the
        // difference. Duffel is charged from the real order total further down, so this
        // only matters for providers whose Stripe amount is derived from flightTotal.
        let effectiveFlightTotal = flightTotal;
        if (revalData.newPrice > 0 && revalData.newPrice < flightTotal) {
            console.log(`[/book] Fare dropped ${flightTotal} → ${revalData.newPrice} — adopting the lower price without prompting`);
            effectiveFlightTotal = revalData.newPrice;
        }

        const serverFarePolicy = revalData.farePolicy || farePolicy;
        const sanitizedFlight = { ...flight };

        // ── Step 1: Create Booking Session (direct DB insert) ──
        const sessionStart = Date.now();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        const { data: sessionRow, error: sessionError } = await db
            .from('booking_sessions')
            .insert({
                user_id: userId,
                provider,
                flight: sanitizedFlight as any,
                passengers: passengers as any,
                contact: contact as any,
                idempotency_key: idempotencyKey,
                policy_source: (serverFarePolicy as any)?.policySource ?? null,
                policy_version: (serverFarePolicy as any)?.policyVersion ?? null,
                is_refundable: (serverFarePolicy as any)?.isRefundable ?? null,
                is_changeable: (serverFarePolicy as any)?.isChangeable ?? null,
                refund_penalty_amount: (serverFarePolicy as any)?.refundPenaltyAmount ?? null,
                refund_penalty_currency: (serverFarePolicy as any)?.refundPenaltyCurrency ?? null,
                fare_policy: serverFarePolicy as any,
                policy_locked: true,
                status: 'initiated',
                expires_at: expiresAt,
                ...(seatServiceIds?.length ? { seat_service_ids: seatServiceIds, seat_total: seatTotal ?? 0 } : {}),
                ...(bagServiceIds?.length  ? { bag_service_ids:  bagServiceIds,  bag_total:  bagTotal  ?? 0 } : {}),
            })
            .select('id')
            .single();

        logApiCall({
            provider, endpoint: 'create-booking-session (internal)', durationMs: Date.now() - sessionStart,
            requestParams: { origin: flight.segments?.[0]?.origin, destination: flight.segments?.[flight.segments.length - 1]?.destination, passengerCount: passengers.length },
            responseStatus: sessionError ? 500 : 200, userId,
            responseSummary: { sessionId: (sessionRow as any)?.id },
            errorMessage: sessionError?.message,
        });

        if (sessionError || !sessionRow) {
            throw new Error(sessionError?.message || 'Failed to create booking session');
        }

        const sessionId = (sessionRow as any).id;

        // ── Step 1.5 (Duffel only): Create the order NOW, before Stripe ──
        // Duffel offer_requests expire within minutes of the search, making
        // deferred booking (via webhook) unreliable. We create the order
        // synchronously here so the offer is guaranteed valid at the time
        // of booking. If this fails the user sees the error before paying.
        let duffelPreOrder: {
            orderId: string; pnr: string;
            tickets: string[]; isTicketed: boolean;
            orderTotal: string; orderCurrency: string;
        } | null = null;

        if (provider === 'duffel') {
            const rawOffer = (flight as any)._rawOffer;
            if (!rawOffer?.id) throw new Error('Duffel offer data missing — cannot book.');

            const duffelToken = env.DUFFEL_TOKEN;
            if (!duffelToken) throw new Error('Duffel not configured.');

            const isSandbox = duffelToken.startsWith('duffel_test_');
            // Same threshold the revalidation gate used a moment ago — see
            // getFlightPriceTolerance(). Keep these in lockstep or a fare that
            // drifts between the two values gets waved through one gate and
            // stopped by the other.
            const priceTolerance = getFlightPriceTolerance();

            // Pre-booking balance guard — catch insufficient balance before Duffel deducts.
            // Skip in sandbox mode (test balances are virtual).
            if (!isSandbox) {
                try {
                    const { getDuffelBalances, getAvailableBalance } = await import('@/lib/server/flights/duffel-balance');
                    // Use rawOffer for currency/amount — these are in Duffel's native currency (USD/GBP).
                    // (flight as any).currency/.price may carry the user's display currency, causing false blocks.
                    const offerCurrency = rawOffer.total_currency ?? 'USD';
                    const offerTotal = parseFloat(rawOffer.total_amount ?? '0');
                    // Check cached balance first; force a live fetch if balance is within 2× the ticket
                    // cost — the 5-min cache can be stale after rapid concurrent bookings.
                    let balances = await getDuffelBalances(duffelToken);
                    let available = getAvailableBalance(balances, offerCurrency);
                    if (available < offerTotal * 2) {
                        balances = await getDuffelBalances(duffelToken, true);
                        available = getAvailableBalance(balances, offerCurrency);
                    }
                    if (available < offerTotal) {
                        console.error(`[/book] Duffel balance insufficient: ${available} ${offerCurrency} < ${offerTotal}`);
                        return NextResponse.json(
                            { success: false, error: 'Flight booking is temporarily unavailable. Please try again shortly.' },
                            { status: 503 }
                        );
                    }
                } catch (balErr: any) {
                    // Non-fatal — log and proceed. Duffel's order API is the hard enforcement point.
                    console.warn('[/book] Duffel balance check failed (non-fatal):', balErr.message);
                }
            }
            const refreshPoolSize = isSandbox ? 3 : 2;
            console.log(`[/book] Duffel ${isSandbox ? 'SANDBOX' : 'LIVE'} mode: tolerance=${priceTolerance}, pool=${refreshPoolSize}`);

            // Build Duffel passenger objects using the offer's passenger IDs
            const duffelPaxTemplates: any[] = rawOffer.passengers ?? [];

            // Build E.164 phone number.
            // countryCode: strip everything except digits (handles "+82", "82", "0082")
            // phone: strip non-digits, then strip leading zeros (Korean "010-..." → "10...")
            const rawCountryCode = String((contact as any).countryCode ?? '82').replace(/\D/g, '') || '82';
            const rawPhone = String((contact as any).phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const e164Phone = `+${rawCountryCode}${rawPhone}`;

            // E.164 requires at least 7 digits total (country code + subscriber)
            const totalDigits = rawCountryCode.length + rawPhone.length;
            if (rawPhone.length < 4 || totalDigits < 7 || !/^\+\d{7,15}$/.test(e164Phone)) {
                console.error(`[/book] Invalid phone for Duffel: countryCode="${rawCountryCode}" phone="${rawPhone}" e164="${e164Phone}"`);
                return NextResponse.json({
                    success: false,
                    error: `Invalid phone number. Please enter a valid phone number with country code (e.g. for South Korea: country code 82, number 10-1234-5678).`,
                }, { status: 400 });
            }

            // Per Duffel docs: title values are mr | ms | mrs | miss | dr
            // Map based on passenger type + gender
            function duffelTitle(pax: any): string {
                const g = (pax.gender ?? '').toUpperCase();
                const t = (pax.type ?? '').toUpperCase();
                if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
                return g === 'M' ? 'mr' : 'ms';
            }

            const orderPassengers = passengers.map((pax: any, idx: number) => ({
                id: duffelPaxTemplates[idx]?.id,
                title: duffelTitle(pax),
                given_name: pax.firstName,
                family_name: pax.lastName,
                born_on: pax.birthDate,
                email: contact.email,
                phone_number: e164Phone,
                gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
            }));

            const offerTotal = parseFloat(rawOffer.total_amount ?? '0');

            // Server-side: derive service prices from rawOffer.available_services.
            // Never use client-sent seatTotal/bagTotal for the Duffel order payment amount —
            // Duffel validates payments.amount and will reject if it doesn't match.
            const availableSvcs: any[] = rawOffer.available_services ?? [];
            let computedSeatExtra = 0;
            let computedBagExtra = 0;
            for (const id of (seatServiceIds ?? [])) {
                const svc = availableSvcs.find((s: any) => s.id === id);
                if (svc) computedSeatExtra += parseFloat(svc.total_amount ?? '0');
                else console.warn(`[/book] Duffel: seat service ${id} not in available_services — excluding from order`);
            }
            for (const id of (bagServiceIds ?? [])) {
                const svc = availableSvcs.find((s: any) => s.id === id);
                if (svc) computedBagExtra += parseFloat(svc.total_amount ?? '0');
                else console.warn(`[/book] Duffel: bag service ${id} not in available_services — excluding from order`);
            }

            const orderTotal = (offerTotal + computedSeatExtra + computedBagExtra).toFixed(2);

            const getDuffelHeaders = (currKey: string) => ({
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
                'Idempotency-Key': currKey,
            });

            const currentIdempotencyKey = idempotencyKey ?? crypto.randomUUID();

            // includeServices: true only on the first attempt with the original offer.
            // On auto-refresh all service IDs (seats + bags) are invalid for the new offer — omit them.
            const buildOrderBody = (offerId: string, paxList: any[], total: string, currency: string, includeServices = false) => {
                const allServiceIds = includeServices ? [
                    ...(seatServiceIds ?? []),
                    ...(bagServiceIds ?? []),
                ] : [];
                return {
                    type: 'instant',
                    selected_offers: [offerId],
                    passengers: paxList,
                    payments: [{ type: 'balance', amount: total, currency }],
                    ...(allServiceIds.length ? {
                        services: allServiceIds.map((id: string) => ({ id, quantity: 1 })),
                    } : {}),
                };
            };

            let activeOffer = rawOffer;
            let activePassengers = orderPassengers;
            let activeTotal = orderTotal;

            // `baseAmount` is the bare fare behind `total` (which also carries seats/bags).
            // Both are needed: the customer-facing delta is measured on the total, but the
            // price the traveller confirmed is always a bare fare — the revalidation gate
            // never sees ancillaries and so can only ever quote one.
            const tryPlaceOrder = async (offerId: string, paxList: any[], total: string, baseAmount: number, currency: string, includeServices: boolean, key: string): Promise<{
                isPriceChangedError: boolean;
                isOfferUnavailable: boolean;
                oldPrice?: number;
                newPrice?: number;
                newCurrency?: string;
                res?: Response;
                data?: any;
                finalTotal?: string;
                finalCurrency?: string;
            }> => {
                let currentTotal = total;
                let currentBase = baseAmount;
                let currentCurrency = currency;
                const activeHeaders = getDuffelHeaders(key);

                // 12-second timeout: Duffel sometimes hangs before returning a 500.
                // AbortController lets us bail out instead of waiting 20+ seconds.
                const orderAbort = new AbortController();
                const orderTimeout = setTimeout(() => orderAbort.abort(), 12000);

                let res: Response;
                let data: any;
                try {
                    res = await fetch('https://api.duffel.com/air/orders', {
                        method: 'POST',
                        headers: activeHeaders,
                        body: JSON.stringify({ data: buildOrderBody(offerId, paxList, currentTotal, currentCurrency, includeServices) }),
                        signal: orderAbort.signal,
                    });
                    data = await res.json();
                } catch (fetchErr: any) {
                    clearTimeout(orderTimeout);
                    if (fetchErr?.name === 'AbortError') {
                        console.error(`[/book] Duffel order fetch timed out after 12s for offer ${offerId}`);
                        // Return a synthetic 504 response so the caller can map it to a supplier outage
                        const syntheticRes = new Response(JSON.stringify({ errors: [{ code: 'timeout', message: 'Duffel order creation timed out' }] }), { status: 504 });
                        return { isPriceChangedError: false, isOfferUnavailable: false, res: syntheticRes, data: { errors: [{ code: 'timeout', message: 'Airline booking system timed out. Please try again.' }] }, finalTotal: currentTotal, finalCurrency: currentCurrency };
                    }
                    throw fetchErr;
                }
                clearTimeout(orderTimeout);

                // If offer unavailable, signal for immediate retry with next offer
                if (res.status === 422 && data?.errors?.[0]?.code === 'offer_no_longer_available') {
                    console.warn(`[/book] order 422 offer_no_longer_available on ${offerId}.`);
                    return { isPriceChangedError: false, isOfferUnavailable: true };
                }

                // ── Handle price_changed with authoritative Price Action + Internal Retry Loop ──
                // We allow up to 2 internal attempts to "catch" a fast-moving price.
                let internalAttempts = 0;
                while (res.status === 422 && data?.errors?.[0]?.code === 'price_changed' && internalAttempts < 2) {
                    internalAttempts++;
                    const currentId = data?.errors?.[0]?.source?.offer_id ?? offerId;
                    console.warn(`[/book] order 422 price_changed on ${currentId} (internal attempt ${internalAttempts}). Performing live Price Action.`);

                    const priceAbort = new AbortController();
                    const priceTimeout = setTimeout(() => priceAbort.abort(), 10000);
                    let liveRes: Response;
                    let liveData: any;
                    try {
                        liveRes = await fetch(`https://api.duffel.com/air/offers/${currentId}/actions/price`, {
                            method: 'POST',
                            headers: getDuffelHeaders(crypto.randomUUID()),
                            body: JSON.stringify({ data: {} }),
                            signal: priceAbort.signal,
                        });
                        liveData = await liveRes.json();
                    } catch (priceErr: any) {
                        clearTimeout(priceTimeout);
                        console.error(`[/book] Price Action request failed: ${priceErr.message}`);
                        break;
                    }
                    clearTimeout(priceTimeout);

                    if (liveRes.ok && liveData?.data) {
                        const pricedOffer = liveData.data;
                        const pricedId = pricedOffer.id;

                        if (pricedId !== currentId) {
                            console.log(`[/book] Priced offer ID differs: ${currentId} -> ${pricedId}`);
                        }

                        const availableSvcs: any[] = pricedOffer.available_services ?? [];
                        let newSeatExtra = 0;
                        let newBagExtra = 0;
                        if (includeServices) {
                            for (const id of (seatServiceIds ?? [])) {
                                const svc = availableSvcs.find((s: any) => s.id === id);
                                if (svc) newSeatExtra += parseFloat(svc.total_amount ?? '0');
                            }
                            for (const id of (bagServiceIds ?? [])) {
                                const svc = availableSvcs.find((s: any) => s.id === id);
                                if (svc) newBagExtra += parseFloat(svc.total_amount ?? '0');
                            }
                        }

                        const freshBase = parseFloat(pricedOffer.total_amount ?? '0');
                        const newTotalNum = freshBase + newSeatExtra + newBagExtra;
                        const newTotalStr = newTotalNum.toFixed(2);
                        const oldTotalNum = parseFloat(currentTotal);
                        // Signed, not absolute: only an increase is worth interrupting for.
                        // A cheaper fare is adopted below via `currentTotal = newTotalStr`.
                        const priceDelta = newTotalNum - oldTotalNum;

                        // Bare fare against bare fare. Comparing the confirmed price against
                        // `newTotalNum` read the cost of any selected seats and bags as a fare
                        // increase, so a traveller with ancillaries was re-asked to confirm the
                        // very price they had just accepted — every time, without converging.
                        const priceAlreadyConfirmed = confirmedPrice !== undefined && (freshBase <= (confirmedPrice + priceTolerance));

                        currentCurrency = pricedOffer.total_currency ?? currentCurrency;

                        // If price delta is large and not confirmed (or above confirmed+buffer), return 409 to user.
                        // Report bare fares so the value the client echoes back as `confirmedPrice`
                        // stays in the same units this check expects.
                        if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                            return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: currentBase, newPrice: freshBase, newCurrency: currentCurrency };
                        }

                        console.warn(`[/book] Retrying order with new total ${newTotalStr} and ${pricedId === currentId ? 'same' : 'NEW priced'} ID: ${pricedId}`);
                        currentTotal = newTotalStr;
                        currentBase = freshBase;

                        // Per Duffel: retry after 4xx requires a fresh idempotency key
                        const retryKey = crypto.randomUUID();
                        const retryAbort = new AbortController();
                        const retryTimeout = setTimeout(() => retryAbort.abort(), 12000);
                        try {
                            res = await fetch('https://api.duffel.com/air/orders', {
                                method: 'POST',
                                headers: getDuffelHeaders(retryKey),
                                body: JSON.stringify({ data: buildOrderBody(pricedId, paxList, currentTotal, currentCurrency, includeServices) }),
                                signal: retryAbort.signal,
                            });
                            data = await res.json();
                        } catch (retryErr: any) {
                            clearTimeout(retryTimeout);
                            console.error(`[/book] Retry order fetch failed: ${retryErr.message}`);
                            break;
                        }
                        clearTimeout(retryTimeout);

                        // If it succeeds or fails with something else, break or handle in next iteration
                        if (res.ok) break;
                    } else {
                        console.error(`[/book] Price Action failed (${liveRes.status} on ${currentId}) — cannot proceed with internal retry.`);
                        break;
                    }
                }

                return { isPriceChangedError: false, isOfferUnavailable: false, res, data, finalTotal: currentTotal, finalCurrency: currentCurrency };
            };


            let duffelOrderRes: Response;
            let duffelOrderData: any;

            // ── Attempt 1: Place order with current offer (handle price_changed internally) ──
            const attempt1 = await tryPlaceOrder(activeOffer.id, activePassengers, activeTotal, offerTotal, activeOffer.total_currency, true, currentIdempotencyKey);
            if (attempt1.isPriceChangedError) {
                return NextResponse.json({
                    success: false,
                    error: 'price_changed',
                    oldPrice: attempt1.oldPrice,
                    newPrice: attempt1.newPrice,
                    currency: attempt1.newCurrency,
                }, { status: 409 });
            }
            
            // If Attempt 1 failed with 'offer_no_longer_available', duffelOrderRes will be set below
            // in the auto-refresh block. If it succeeded, we assign here.
            if (!attempt1.isOfferUnavailable) {
                duffelOrderRes = attempt1.res!;
                duffelOrderData = attempt1.data;
                activeTotal = attempt1.finalTotal!;
            } else {
                // Mock a 422 to trigger the refresh block below
                duffelOrderRes = { status: 422 } as Response;
                duffelOrderData = { errors: [{ code: 'offer_no_longer_available' }] };
            }

            // ── Auto-refresh: if offer expired (422) but NOT price_changed ──
            if (duffelOrderRes.status === 422 && duffelOrderData?.errors?.[0]?.code !== 'price_changed') {
                console.warn('[/book] Duffel offer expired (422) — attempting auto-refresh');
                console.warn('[/book] Raw offer slices:', JSON.stringify(rawOffer.slices?.map((sl: any) => ({
                    origin: sl.origin?.iata_code,
                    destination: sl.destination?.iata_code,
                    departure_date: sl.departure_date,
                    segments_count: sl.segments?.length,
                    first_departing_at: sl.segments?.[0]?.departing_at,
                }))));

                try {
                    // Rebuild slices — use slice-level departure_date first (most reliable),
                    // fall back to first segment's departing_at timestamp
                    const slices: any[] = (rawOffer.slices ?? []).map((sl: any) => {
                        const origin = sl.origin?.iata_code ?? sl.segments?.[0]?.origin?.iata_code;
                        const destination = sl.destination?.iata_code
                            ?? sl.segments?.[sl.segments.length - 1]?.destination?.iata_code;
                        const departure_date = sl.departure_date
                            ?? sl.segments?.[0]?.departing_at?.slice(0, 10);
                        return { origin, destination, departure_date };
                    }).filter((s: any) => s.origin && s.destination && s.departure_date);

                    console.warn(`[/book] Rebuilt ${slices.length} slices:`, JSON.stringify(slices));

                    const paxTypes: any[] = (rawOffer.passengers ?? []).map((p: any) => ({
                        type: p.type ?? 'adult',
                    }));

                    if (slices.length === 0) throw new Error('Cannot rebuild offer_request: no valid slices found in rawOffer');

                    const cabinClass: string = rawOffer.cabin_class
                        ?? rawOffer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class_marketing_name?.toLowerCase()
                        ?? 'economy';

                    console.warn(`[/book] Creating offer_request: slices=${JSON.stringify(slices)} pax=${JSON.stringify(paxTypes)} cabin=${cabinClass}`);
                    const orRes = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
                        method: 'POST',
                        headers: getDuffelHeaders(crypto.randomUUID()),
                        body: JSON.stringify({ data: { slices, passengers: paxTypes, cabin_class: cabinClass } }),
                    });
                    const orData = await orRes.json();

                    if (!orRes.ok) {
                        throw new Error(`offer_request failed (${orRes.status}): ${orData?.errors?.[0]?.message ?? 'unknown error'}`);
                    }

                    let offers: any[] = orData.data?.offers ?? [];
                    console.warn(`[/book] offer_request returned ${offers.length} offers. offer_request_id=${orData.data?.id}`);

                    if (offers.length === 0 && orData.data?.id) {
                        const offersRes = await fetch(
                            `https://api.duffel.com/air/offers?offer_request_id=${orData.data.id}&limit=50`,
                            { headers: getDuffelHeaders(crypto.randomUUID()) }
                        );
                        const offersData = await offersRes.json();
                        offers = offersData.data ?? [];
                        console.warn(`[/book] Fallback offer fetch: ${offers.length} offers`);
                    }

                    if (offers.length === 0) throw new Error('No offers available for this route — flight may be fully booked or unavailable');

                    const targetCarrier = rawOffer.validating_carrier_iata_code
                        ?? rawOffer.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                        ?? rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                    const targetTotal = parseFloat(rawOffer.total_amount ?? '0');

                    // Filter matching offers by carrier
                    const matchingOffers = targetCarrier
                        ? offers.filter((o: any) => {
                            const carrier = o.validating_carrier_iata_code
                                ?? o.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                                ?? o.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                            return carrier === targetCarrier;
                          })
                        : offers;

                    const sortedPool = (matchingOffers.length > 0 ? matchingOffers : offers).sort((a: any, b: any) => {
                        const diffA = Math.abs(parseFloat(a.total_amount) - targetTotal);
                        const diffB = Math.abs(parseFloat(b.total_amount) - targetTotal);
                        return diffA - diffB;
                    });

                    // ── Attempt 2: Loop through top matching offers ──
                    let attempt2Success = false;
                    const maxAttempts = Math.min(sortedPool.length, refreshPoolSize);
                    for (let i = 0; i < maxAttempts; i++) {
                        const freshOffer = sortedPool[i];
                        console.log(`[/book] Attempting refresh offer ${i + 1}/${maxAttempts}: ${freshOffer.id}`);

                        const freshPaxTemplates: any[] = freshOffer.passengers ?? [];
                        const refreshedPassengers = activePassengers.map((pax: any, idx: number) => ({
                            ...pax,
                            id: freshPaxTemplates[idx]?.id ?? pax.id,
                        }));

                        const freshBaseTotal = parseFloat(freshOffer.total_amount ?? '0');
                        const freshTotalStr = freshBaseTotal.toFixed(2);
                        const oldPriceNum = parseFloat(rawOffer.total_amount ?? '0');
                        // Signed — a refreshed offer that is cheaper needs no confirmation.
                        const priceDelta = freshBaseTotal - oldPriceNum;

                        const priceAlreadyConfirmed = confirmedPrice !== undefined && (freshBaseTotal <= (confirmedPrice + priceTolerance));
                        if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                            return NextResponse.json({
                                success: false,
                                error: 'price_changed',
                                oldPrice: oldPriceNum,
                                newPrice: freshBaseTotal,
                                currency: freshOffer.total_currency ?? rawOffer.total_currency ?? 'USD',
                            }, { status: 409 });
                        }

                        // Seats/bags from the original offer are invalid on a refreshed offer — ask client to re-select.
                        const hadAncillaries = (seatServiceIds && seatServiceIds.length > 0) || (bagServiceIds && bagServiceIds.length > 0);
                        if (hadAncillaries) {
                            const parsedFreshOffer = parseDuffelOffer(freshOffer);
                            const tripType = parsedFreshOffer.segments?.some((s: any) => s.segmentIndex > 0) ? 'round-trip' : 'one-way';
                            const flightOffer = normalizedToFlightOffer(parsedFreshOffer, tripType);
                            return NextResponse.json({
                                success: false,
                                error: 'offer_replaced',
                                newOffer: flightOffer,
                            }, { status: 409 });
                        }

                        // Try place order with NEW idempotency key for this retry
                        const attempt2 = await tryPlaceOrder(freshOffer.id, refreshedPassengers, freshTotalStr, freshBaseTotal, freshOffer.total_currency, false, crypto.randomUUID());

                        if (attempt2.res?.status && attempt2.res.status >= 500) {
                            console.error(`[/book] refresh offer ${freshOffer.id} failed with ${attempt2.res.status} — supplier error, stopping retries`);
                            duffelOrderRes = attempt2.res;
                            duffelOrderData = attempt2.data;
                            break;
                        }

                        if (attempt2.isOfferUnavailable) {
                            console.warn(`[/book] refresh offer ${freshOffer.id} no longer available — trying next in pool`);
                            continue;
                        }

                        if (attempt2.isPriceChangedError) {
                            return NextResponse.json({
                                success: false,
                                error: 'price_changed',
                                oldPrice: attempt2.oldPrice,
                                newPrice: attempt2.newPrice,
                                currency: attempt2.newCurrency,
                            }, { status: 409 });
                        }

                        duffelOrderRes = attempt2.res!;
                        duffelOrderData = attempt2.data;
                        activeTotal = attempt2.finalTotal!;
                        activeOffer = freshOffer;
                        activePassengers = refreshedPassengers;

                        console.log( duffelOrderRes.ok ? 'OK' : JSON.stringify(duffelOrderData?.errors?.[0]));

                        if (duffelOrderRes.ok) {
                            attempt2Success = true;
                            break;
                        }
                    }

                    if (!attempt2Success && !duffelOrderRes?.ok) {
                        throw new Error('Fresh offers also unavailable or failed booking.');
                    }

                } catch (refreshErr: any) {
                    console.error('[/book] Offer auto-refresh failed:', refreshErr.message);
                    // Fall through to the error handler below with the original 422 status
                }
            }

            if (!duffelOrderRes.ok) {
                const status = duffelOrderRes.status;
                const rawErrMsg = duffelOrderData?.errors?.[0]?.message ?? '';
                const code = duffelOrderData?.errors?.[0]?.code ?? '';
                const requestId = duffelOrderData?.meta?.request_id ?? '';

                console.error(`[/book] Duffel pre-order failed: status=${status} code=${code} msg="${rawErrMsg}" request_id=${requestId}`);

                const isPhoneErr = /phone_number/i.test(rawErrMsg);
                const isBalanceErr = code === 'insufficient_balance' || /insufficient.*balance|balance.*insufficient/i.test(rawErrMsg);
                // isBalanceErr must be checked before isExpiredErr — both produce 422, but the cause and
                // user-facing message are different. A balance error is a platform issue, not a fare issue.

                // Match on Duffel's error code, not on the bare 422 status. Duffel answers 422
                // for every rejected order — an expired offer, but equally a malformed passport
                // number or an unaccepted title — so treating the status alone as "expired"
                // reported a stale fare for problems that had nothing to do with the fare, and
                // hid the real message from both the traveller and the logs. Anything not
                // recognised here now falls through with Duffel's own wording.
                const EXPIRED_CODES = new Set([
                    'offer_no_longer_available',
                    'offer_expired',
                    'offer_request_not_found',
                    'not_found',
                ]);
                const isExpiredErr = !isBalanceErr && (
                    EXPIRED_CODES.has(code) ||
                    /expired|no longer available|select another offer/i.test(rawErrMsg)
                );
                const isSeatErr = /seat|service.*unavailable|no longer.*available.*service/i.test(rawErrMsg) && !isExpiredErr && !isBalanceErr;
                const isSupplierOutage = status >= 500;

                let errorCode: string | null = null;
                if (isPhoneErr) errorCode = 'phone_number_invalid';
                else if (isBalanceErr) errorCode = 'balance_insufficient';
                else if (isExpiredErr) errorCode = 'flight_unavailable';
                else if (isSeatErr) errorCode = 'seats_unavailable';
                else if (isSupplierOutage) errorCode = 'supplier_outage';

                let httpStatus = 400;
                if (isBalanceErr) httpStatus = 503;
                else if (isExpiredErr) httpStatus = 409;
                else if (isSupplierOutage) httpStatus = 502;

                return NextResponse.json({
                    success: false,
                    errorCode,
                    error: isBalanceErr
                        ? 'Flight booking is temporarily unavailable. Please try again shortly.'
                        : errorCode ? undefined : (rawErrMsg || 'Flight booking failed. Please try again.'),
                    // Duffel's own code, echoed for diagnosis. `errorCode` is our bucket and
                    // several Duffel codes collapse into each one, so without this the response
                    // alone can't tell you which supplier condition actually fired.
                    duffelCode: code || undefined,
                    requestId,
                }, { status: httpStatus });
            }

            const order = duffelOrderData.data;
            const tickets = (order.documents ?? [])
                .filter((d: any) => d.type === 'electronic_ticket')
                .map((d: any) => d.unique_identifier as string);

            const finalOrderCurrency = activeOffer.total_currency ?? rawOffer.total_currency;

            duffelPreOrder = {
                orderId: order.id,
                pnr: order.booking_reference ?? order.id,
                tickets,
                isTicketed: tickets.length > 0,
                orderTotal: activeTotal,
                orderCurrency: finalOrderCurrency,
            };

            console.log(`[/book] Duffel pre-order created: orderId=${duffelPreOrder.orderId} pnr=${duffelPreOrder.pnr} tickets=${tickets.length}`);
        }

        // ── Step 2: Create Stripe PaymentIntent ──
        const stripeStart = Date.now();

        // Apply platform markup before charging the customer.
        // Prefer the Duffel order's locked total: it is what Duffel actually charged our
        // balance, and Duffel rejects mismatched amounts, so it cannot be understated by a
        // tampered client payload. The fallback covers a provider with no order to
        // reference. See src/lib/pricing.ts for the full strategy rationale.
        const stripeBase = duffelPreOrder
            ? parseFloat(duffelPreOrder.orderTotal)
            : effectiveFlightTotal + Math.max(0, seatTotal ?? 0) + Math.max(0, bagTotal ?? 0);
        const pricing = applyMarkup(stripeBase, FLIGHT_MARKUP);

        // Charge the customer in their selected display currency, not Duffel's USD.
        // This ensures the refund amount exactly matches what they paid — no FX drift.
        const chargeInCurrency = (displayCurrency || flightCurrency).toLowerCase();
        const chargePrice = chargeInCurrency !== flightCurrency
            ? Math.round(convertCurrency(pricing.chargedPrice, flightCurrency, chargeInCurrency.toUpperCase()) * 100) / 100
            : pricing.chargedPrice;
        const flightStripeAmount = toStripeAmount(chargePrice, chargeInCurrency);

        console.log(`[/book] Pricing: original=${pricing.originalPrice} ${flightCurrency}, charged=${pricing.chargedPrice}, markup=${(pricing.markupRate * 100).toFixed(1)}%, markupAmount=${pricing.markupAmount}`);
        console.log(`[/book] Stripe charge: ${chargePrice} ${chargeInCurrency} (converted from ${pricing.chargedPrice} ${flightCurrency})`);

        // Idempotency key prevents duplicate charges if the client retries on network error.
        const piIdempotencyKey = `flight-pi-${userId}-${sessionId}`;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: flightStripeAmount,
            currency: chargeInCurrency,
            // Duffel is the only reachable provider and its orders are placed before the
            // charge, so there is nothing to hold funds for — capture immediately.
            capture_method: 'automatic',
            metadata: {
                bookingSessionId: sessionId,
                provider: provider,
                userId: userId,
                passengerEmail: contact.email,
                // Store pricing breakdown in metadata for audit trail
                originalPrice: String(pricing.originalPrice),
                markupRate: String(pricing.markupRate),
                markupAmount: String(pricing.markupAmount),
                // Duffel pre-order (created before payment to avoid offer expiry)
                ...(duffelPreOrder ? {
                    duffelOrderId: duffelPreOrder.orderId,
                    duffelPnr: duffelPreOrder.pnr,
                    duffelTickets: duffelPreOrder.tickets.join(','),
                    duffelIsTicketed: String(duffelPreOrder.isTicketed),
                } : {}),
                // Bundle link — hotel booking ID this flight is paired with
                ...(bundleHotelId ? { bundleHotelId, type: 'flight_bundle' } : { type: 'flight' }),
            },
            description: `CG: ${flight.segments[0]?.origin} → ${flight.segments[flight.segments.length - 1]?.destination}`,
        }, { idempotencyKey: piIdempotencyKey });
        logApiCall({
            provider: 'stripe', endpoint: 'paymentIntents.create', durationMs: Date.now() - stripeStart,
            requestParams: { amount: flightStripeAmount, currency: flightCurrency, captureMethod: 'automatic', markupRate: pricing.markupRate },
            responseStatus: 200, userId,
            responseSummary: { paymentIntentId: paymentIntent.id, sessionId, chargedPrice: pricing.chargedPrice },
        });

        // ── Step 3: Store PaymentIntent ID + Duffel pre-order in booking session ──
        //
        // One UPDATE, not three. This used to be split — critical fields, then audit
        // fields, then pre-order details — because `payment_currency` did not exist and
        // Postgres rejects the whole statement over one unknown column. The split meant
        // the audit write failed in its entirety on every booking, silently dropping
        // currency, original_price, charged_price and markup_pct along with it. The column
        // now exists (migration 20260803000002), so all of it lands in a single round trip
        // on the critical path between charging and confirming.
        //
        // Storing the pre-order data here means create-booking can use it directly without
        // a Stripe API round-trip.
        const { error: sessionUpdateError } = await db
            .from('booking_sessions')
            .update({
                payment_intent_id: paymentIntent.id,
                status: 'payment_initiated',
                currency: flightCurrency,
                original_price: pricing.originalPrice,
                charged_price: chargePrice,
                markup_pct: pricing.markupRate,
                payment_currency: chargeInCurrency.toUpperCase(),
                ...(duffelPreOrder ? {
                    duffel_pre_order_id: duffelPreOrder.orderId,
                    duffel_pre_order_pnr: duffelPreOrder.pnr,
                    duffel_pre_order_tickets: duffelPreOrder.tickets,
                    duffel_pre_order_ticketed: duffelPreOrder.isTicketed,
                } : {}),
            })
            .eq('id', sessionId);

        if (sessionUpdateError) {
            console.error('[/book] CRITICAL — failed to save payment_intent_id to session:', sessionUpdateError.message);

            // Cancel the Duffel pre-order FIRST — it exists in Duffel's system and holds a
            // real seat. If we only cancel Stripe and leave the Duffel order open, the seat
            // remains locked on our Duffel balance until the hold expires (5–30 min).
            if (duffelPreOrder?.orderId) {
                try {
                    const duffelToken = env.DUFFEL_TOKEN;
                    // Step 1: create order cancellation (get refund quote)
                    const cancelQuoteRes = await fetch('https://api.duffel.com/air/order_cancellations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${duffelToken}`,
                            'Duffel-Version': 'v2',
                        },
                        body: JSON.stringify({ data: { order_id: duffelPreOrder.orderId } }),
                        signal: AbortSignal.timeout(8000),
                    });
                    if (cancelQuoteRes.ok) {
                        const cancelQuote = await cancelQuoteRes.json();
                        const cancellationId = cancelQuote?.data?.id;
                        if (cancellationId) {
                            // Step 2: confirm the cancellation
                            await fetch(`https://api.duffel.com/air/order_cancellations/${cancellationId}/actions/confirm`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${duffelToken}`,
                                    'Duffel-Version': 'v2',
                                },
                                signal: AbortSignal.timeout(8000),
                            });
                            console.log(`[/book] Duffel order ${duffelPreOrder.orderId} cancelled (cancellation: ${cancellationId})`);
                        }
                    } else {
                        const errBody = await cancelQuoteRes.text().catch(() => '');
                        console.error(`[/book] Duffel cancellation quote failed (${cancelQuoteRes.status}): ${errBody} — order ${duffelPreOrder.orderId} may need manual cancellation`);
                    }
                } catch (duffelCancelErr: any) {
                    // Log loudly — ops must manually cancel this order in the Duffel dashboard
                    console.error(`[/book] ORPHANED DUFFEL ORDER: ${duffelPreOrder.orderId} — cancel failed: ${duffelCancelErr.message}. Manual cancellation required.`);
                }
            }

            // Cancel the Stripe PaymentIntent so the customer is never charged
            try {
                await stripe.paymentIntents.cancel(paymentIntent.id);
                console.log('[/book] PaymentIntent cancelled after session update failure:', paymentIntent.id);
            } catch (cancelErr: any) {
                console.error('[/book] Could not cancel PI after session update failure:', cancelErr.message, '— PI:', paymentIntent.id);
            }
            return NextResponse.json({
                success: false,
                error: 'A session error occurred. Your card was not charged. Please try again.',
            }, { status: 500 });
        }

        if (duffelPreOrder) {
            console.log(`[/book] Duffel pre-order stored in session ${sessionId}: orderId=${duffelPreOrder.orderId} pnr=${duffelPreOrder.pnr}`);
        }

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            sessionId: sessionId,
            paymentIntentId: paymentIntent.id,
        });

    } catch (err: any) {
        console.error('[/book] Error:', err);
        const message = process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred. Please try again.'
            : (err.message || 'An unexpected error occurred');
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
