import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { FlightOffer, FarePolicy } from '@/types/flights';
import { logApiCall } from '@/lib/server/api-logger';
import { rateLimit } from '@/lib/server/rate-limit';
import { checkCsrf } from '@/lib/server/csrf';
import { flightBookingSchema } from '@/lib/schemas/flight';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    // 5 booking attempts per minute per IP
    const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'flights-book' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const body = await req.json();
        const { provider, flight, passengers, contact, idempotencyKey, farePolicy, seatServiceIds, seatTotal, bagServiceIds, bagTotal, confirmedPrice, bundleHotelId } = body as {
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
        };

        // Use server-verified user ID
        const userId = user.id;

        // ── Validate ──
        if (!provider || !['duffel', 'mystifly_v2'].includes(provider)) {
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

        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[/book] Missing Supabase env variables');
            return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
        }

        const edgeFnHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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

        // ── Duplicate flight booking guard ──
        // Duffel segments use iata_code; Mystifly uses iataCode or plain string — handle all.
        {
            const { createClient: createSvc } = await import('@supabase/supabase-js');
            const svc = createSvc(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

            const rawFlight = flight as any;
            // Duffel: slices[0].segments[0]; Mystifly: segments[0]
            const firstSeg = rawFlight.slices?.[0]?.segments?.[0] ?? rawFlight.segments?.[0];
            const extractIata = (loc: any): string => {
                if (!loc) return '';
                if (typeof loc === 'string') return loc;
                return loc.iata_code ?? loc.iataCode ?? loc.code ?? '';
            };
            const origin = extractIata(firstSeg?.origin);
            // Duffel departure field is departing_at; Mystifly uses departureTime / departure
            const departureDate = (firstSeg?.departing_at ?? firstSeg?.departureTime ?? firstSeg?.departure ?? '').slice(0, 10);

            if (origin && departureDate) {
                // Step 1: get all active booking IDs for this user
                const { data: activeBookings } = await svc
                    .from('flight_bookings')
                    .select('id')
                    .eq('user_id', userId)
                    .not('status', 'in', '(cancelled,cancelled_provider_missing,refunded,cancel_failed,cancel_requested)');

                if (activeBookings?.length) {
                    const activeIds = activeBookings.map((b: any) => b.id);

                    // Step 2: check if any of those bookings has a segment departing from the same
                    // origin on the same day — covers connecting flights too
                    const { data: existingSeg } = await svc
                        .from('flight_segments')
                        .select('booking_id')
                        .in('booking_id', activeIds)
                        .eq('origin', origin)
                        .gte('departure', `${departureDate}T00:00:00`)
                        .lt('departure', `${departureDate}T23:59:59`)
                        .limit(1)
                        .maybeSingle();

                    if (existingSeg) {
                        return NextResponse.json({
                            success: false,
                            code: 'DUPLICATE_BOOKING',
                            existingBookingId: existingSeg.booking_id,
                            route: origin,
                            departureDate,
                            error: `You already have an active flight booking departing ${origin} on ${departureDate}.`,
                        }, { status: 409 });
                    }
                }
            }
        }

        // ── Mystifly V2 UUID FareSource guard — before creating any session or PaymentIntent ──
        // V2 UUID FareSources require SearchIdentifier on all Mystifly endpoints (revalidate + book).
        // Mystifly does not return SearchIdentifier in search responses, so these fares are unbookable.
        // Fail here immediately rather than authorizing a charge we can't complete.
        if (provider === 'mystifly_v2') {
            const traceId: string = (flight as any).traceId ?? '';
            const fareCode = traceId.split('|')[0];
            const searchIdentifier = traceId.split('|')[3]; // tunneled format: FSC|convId||SearchId
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fareCode);
            if (isUUID && !searchIdentifier) {
                console.warn(`[/book] Rejecting unbookable V2 UUID fare (no SearchIdentifier): ${fareCode.slice(0, 18)}…`);
                return NextResponse.json({
                    success: false,
                    error: 'This flight offer is not available for booking. Please go back and select a different flight.',
                }, { status: 422 });
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
        const revalEndpoint = `${env.SUPABASE_URL}/functions/v1/revalidate-flight`;
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
            // Mystifly: SearchIdentifier is frequently missing from search responses.
            // Soft-pass these errors and let the booking API validate the fare instead.
            const isMystiflyProvider = provider === 'mystifly_v2';
            const isSearchIdError = /searchIdentifier.*empty|cannot revalidate/i.test(revalData.error || '');
            if (isMystiflyProvider && isSearchIdError) {
                console.warn('[/book] SearchIdentifier revalidation error — soft-passing for Mystifly, proceeding to booking');
            } else {
                return NextResponse.json({
                    success: false,
                    error: revalData.error || 'This flight is no longer available from the supplier. Please return to search.'
                }, { status: 409 });
            }
        }

        // Trust the edge function's priceChanged flag — it handles currency
        // normalization and uses a $5 tolerance to avoid false positives.
        // Guard: newPrice=0 means price extraction failed, not a real $0 fare.
        if (revalData.priceChanged && revalData.newPrice > 0) {
            return NextResponse.json({
                success: false,
                error: `Flight price changed from ${flightTotal} to ${revalData.newPrice}. Please restart booking.`
            }, { status: 409 });
        }

        if (revalData.priceChanged && revalData.newPrice === 0) {
            console.warn(`[/book] Revalidation reported priceChanged but newPrice=0 — likely a parse failure. Proceeding with original price: ${flightTotal}`);
        }

        const serverFarePolicy = revalData.farePolicy || farePolicy;
        const sanitizedFlight = { ...flight };
        if (provider === 'mystifly_v2') {
            delete (sanitizedFlight as any).rawOffer;
            delete (sanitizedFlight as any)._rawOffer;
        }

        // ── Step 1: Create Booking Session ──
        const sessionStart = Date.now();
        const sessionEndpoint = `${env.SUPABASE_URL}/functions/v1/create-booking-session`;
        const sessionRes = await fetch(sessionEndpoint, {
            method: 'POST',
            headers: edgeFnHeaders,
            body: JSON.stringify({
                userId,
                provider,
                flight: sanitizedFlight,
                passengers,
                contact,
                idempotencyKey,
                farePolicy: serverFarePolicy,
                ...(seatServiceIds?.length ? { seatServiceIds, seatTotal: seatTotal ?? 0 } : {}),
                ...(bagServiceIds?.length ? { bagServiceIds, bagTotal: bagTotal ?? 0 } : {}),
            }),
        });

        const sessionData = await sessionRes.json();
        logApiCall({
            provider, endpoint: sessionEndpoint, durationMs: Date.now() - sessionStart,
            requestParams: { origin: flight.segments?.[0]?.origin, destination: flight.segments?.[flight.segments.length - 1]?.destination, passengerCount: passengers.length },
            responseStatus: sessionRes.status, userId,
            responseSummary: { sessionId: sessionData.sessionId },
            errorMessage: !sessionData.success ? (sessionData.error || 'Failed to create booking session') : undefined,
        });

        if (!sessionData.success) {
            throw new Error(sessionData.error || 'Failed to create booking session');
        }

        const sessionId = sessionData.sessionId;

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
            const priceTolerance = isSandbox ? 10.00 : 0.50;
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

            let currentIdempotencyKey = idempotencyKey ?? crypto.randomUUID();

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

            const tryPlaceOrder = async (offerId: string, paxList: any[], total: string, currency: string, includeServices: boolean, key: string): Promise<{
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
                let currentCurrency = currency;
                let activeHeaders = getDuffelHeaders(key);

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
                        const priceDelta = Math.abs(newTotalNum - oldTotalNum);

                        const priceAlreadyConfirmed = confirmedPrice !== undefined && (newTotalNum <= (confirmedPrice + priceTolerance));

                        currentCurrency = pricedOffer.total_currency ?? currentCurrency;

                        // If price delta is large and not confirmed (or above confirmed+buffer), return 409 to user
                        if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                            return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: oldTotalNum, newPrice: newTotalNum, newCurrency: currentCurrency };
                        }

                        console.warn(`[/book] Retrying order with new total ${newTotalStr} and ${pricedId === currentId ? 'same' : 'NEW priced'} ID: ${pricedId}`);
                        currentTotal = newTotalStr;

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
            const attempt1 = await tryPlaceOrder(activeOffer.id, activePassengers, activeTotal, activeOffer.total_currency, true, currentIdempotencyKey);
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
                        const priceDelta = Math.abs(freshBaseTotal - oldPriceNum);

                        const priceAlreadyConfirmed = confirmedPrice !== undefined && (freshBaseTotal <= (confirmedPrice + 0.50));
                        if (priceDelta > 0.50 && !priceAlreadyConfirmed) {
                            return NextResponse.json({
                                success: false,
                                error: 'price_changed',
                                oldPrice: oldPriceNum,
                                newPrice: freshBaseTotal,
                                currency: freshOffer.total_currency ?? rawOffer.total_currency ?? 'USD',
                            }, { status: 409 });
                        }

                        // Try place order with NEW idempotency key for this retry
                        const attempt2 = await tryPlaceOrder(freshOffer.id, refreshedPassengers, freshTotalStr, freshOffer.total_currency, false, crypto.randomUUID());
                        
                        if (attempt2.res?.status && attempt2.res.status >= 500) {
                            console.error(`[/book] Supplier returned ${attempt2.res.status}. Breaking retry loop.`);
                            duffelOrderRes = attempt2.res;
                            duffelOrderData = attempt2.data;
                            break;
                        }

                        if (attempt2.isOfferUnavailable) {
                            console.warn(`[/book] Refresh offer ${freshOffer.id} unavailable — trying next...`);
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

                        console.log(`[/book] Retry order status: ${duffelOrderRes.status}`, duffelOrderRes.ok ? 'OK' : JSON.stringify(duffelOrderData?.errors?.[0]));
                        
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
                const isExpiredErr = status === 422 || /expired|no longer available|select another offer/i.test(rawErrMsg);
                const isSeatErr = /seat|service.*unavailable|no longer.*available.*service/i.test(rawErrMsg) && !isExpiredErr;
                const isSupplierOutage = status >= 500;

                const errMsg = isPhoneErr
                    ? 'Invalid phone number format. Please check your phone number and country code.'
                    : isExpiredErr
                    ? 'This flight is no longer available. Please search again for current prices.'
                    : isSeatErr
                    ? 'One or more selected seats are no longer available. Please choose different seats or continue without seat selection.'
                    : isSupplierOutage
                    ? 'The airline\'s booking system is currently experiencing technical difficulties. Please try again in a few minutes or choose a different flight.'
                    : rawErrMsg || 'Flight booking failed. Please try again.';

                let httpStatus = 400;
                if (isExpiredErr) httpStatus = 409;
                if (isSupplierOutage) httpStatus = 502; // Bad Gateway

                return NextResponse.json({ success: false, error: errMsg, requestId }, { status: httpStatus });
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
        const isMystifly = provider === 'mystifly_v2';

        // Apply platform markup before charging the customer.
        // For Duffel: use the order's actual locked total (already validated by Duffel, includes services).
        //   This prevents a tampered client flightTotal from reducing the Stripe charge below what
        //   Duffel charges our balance. The Duffel order creation above rejects mismatched amounts,
        //   so duffelPreOrder.orderTotal is authoritative.
        // For Mystifly: use revalidated client price + server-clamped extras (no order to reference).
        // See src/lib/pricing.ts for the full strategy rationale.
        const stripeBase = (provider === 'duffel' && duffelPreOrder)
            ? parseFloat(duffelPreOrder.orderTotal)
            : flightTotal + Math.max(0, seatTotal ?? 0) + Math.max(0, bagTotal ?? 0);
        const totalWithSeats = stripeBase;
        const pricing = applyMarkup(totalWithSeats, FLIGHT_MARKUP);
        const flightStripeAmount = toStripeAmount(pricing.chargedPrice, flightCurrency);

        console.log(`[/book] Pricing: original=${pricing.originalPrice} ${flightCurrency}, charged=${pricing.chargedPrice}, markup=${(pricing.markupRate * 100).toFixed(1)}%, markupAmount=${pricing.markupAmount}`);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: flightStripeAmount,
            currency: flightCurrency,
            capture_method: isMystifly ? 'manual' : 'automatic',
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
            description: `Flight Booking: ${flight.segments[0]?.origin} to ${flight.segments[flight.segments.length - 1]?.destination}`,
        });
        logApiCall({
            provider: 'stripe', endpoint: 'paymentIntents.create', durationMs: Date.now() - stripeStart,
            requestParams: { amount: flightStripeAmount, currency: flightCurrency, captureMethod: isMystifly ? 'manual' : 'automatic', markupRate: pricing.markupRate },
            responseStatus: 200, userId,
            responseSummary: { paymentIntentId: paymentIntent.id, sessionId, chargedPrice: pricing.chargedPrice },
        });

        // ── Step 3: Store PaymentIntent ID + Duffel pre-order in booking session ──
        // Storing the pre-order data in the session means create-booking can use it
        // directly without a Stripe API round-trip (avoids STRIPE_SECRET_KEY dependency
        // in the edge function and eliminates any race/auth issues).
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        // Step 3a: Critical — PI id + status only. Must not fail.
        const { error: sessionUpdateError } = await supabase
            .from('booking_sessions')
            .update({
                payment_intent_id: paymentIntent.id,
                status: 'payment_initiated',
            })
            .eq('id', sessionId);

        if (sessionUpdateError) {
            console.error('[/book] CRITICAL — failed to save payment_intent_id to session:', sessionUpdateError.message);
        }

        // Step 3a-ii: Audit fields (non-critical — columns may not exist yet).
        await supabase
            .from('booking_sessions')
            .update({
                currency: flightCurrency,
                original_price: pricing.originalPrice,
                charged_price: pricing.chargedPrice,
                markup_pct: pricing.markupRate,
            })
            .eq('id', sessionId)
            .then(({ error }) => {
                if (error) console.warn('[/book] Audit fields not saved (run migration):', error.message);
            });

        // Step 3b: Store Duffel pre-order data (separate update to isolate schema issues).
        if (duffelPreOrder) {
            const { error: preOrderUpdateError } = await supabase
                .from('booking_sessions')
                .update({
                    duffel_pre_order_id: duffelPreOrder.orderId,
                    duffel_pre_order_pnr: duffelPreOrder.pnr,
                    duffel_pre_order_tickets: duffelPreOrder.tickets,
                    duffel_pre_order_ticketed: duffelPreOrder.isTicketed,
                })
                .eq('id', sessionId);

            if (preOrderUpdateError) {
                console.error('[/book] Failed to store Duffel pre-order in session:', preOrderUpdateError.message, '— create-booking will attempt live booking (offer may have expired)');
            } else {
                console.log(`[/book] Duffel pre-order stored in session ${sessionId}: orderId=${duffelPreOrder.orderId} pnr=${duffelPreOrder.pnr}`);
            }
        }

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            sessionId: sessionId
        });

    } catch (err: any) {
        console.error('[/book] Error:', err);
        const message = process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred. Please try again.'
            : (err.message || 'An unexpected error occurred');
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
