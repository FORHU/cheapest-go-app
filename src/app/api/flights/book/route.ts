import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { FlightOffer, FarePolicy } from '@/types/flights';
import { logApiCall } from '@/lib/server/api-logger';
import { rateLimit } from '@/lib/server/rate-limit';
import { flightBookingSchema } from '@/lib/schemas/flight';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
        const { provider, flight, passengers, contact, idempotencyKey, farePolicy, seatServiceIds, seatTotal, bagServiceIds, bagTotal } = body as {
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
            const seatExtra = seatServiceIds?.length ? (seatTotal ?? 0) : 0;
            const bagExtra = bagServiceIds?.length ? (bagTotal ?? 0) : 0;
            const orderTotal = (offerTotal + seatExtra + bagExtra).toFixed(2);

            const duffelHeaders = {
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
            };

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

            // ── Attempt 1: Place order with current offer (include seat services) ──
            let duffelOrderRes = await fetch('https://api.duffel.com/air/orders', {
                method: 'POST',
                headers: duffelHeaders,
                body: JSON.stringify({ data: buildOrderBody(activeOffer.id, activePassengers, activeTotal, activeOffer.total_currency, true) }),
            });

            let duffelOrderData = await duffelOrderRes.json();

            // ── Auto-refresh: if offer expired (422), create a new offer_request and retry ──
            if (duffelOrderRes.status === 422) {
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
                        // departure_date exists at slice level in Duffel responses
                        const departure_date = sl.departure_date
                            ?? sl.segments?.[0]?.departing_at?.slice(0, 10);
                        return { origin, destination, departure_date };
                    }).filter((s: any) => s.origin && s.destination && s.departure_date);

                    console.warn(`[/book] Rebuilt ${slices.length} slices:`, JSON.stringify(slices));

                    const paxTypes: any[] = (rawOffer.passengers ?? []).map((p: any) => ({
                        type: p.type ?? 'adult',
                    }));

                    if (slices.length === 0) throw new Error('Cannot rebuild offer_request: no valid slices found in rawOffer');

                    // Determine cabin class from the original offer
                    const cabinClass: string = rawOffer.cabin_class
                        ?? rawOffer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class_marketing_name?.toLowerCase()
                        ?? 'economy';

                    // Create new offer_request with return_offers=true for inline results
                    console.warn(`[/book] Creating offer_request: slices=${JSON.stringify(slices)} pax=${JSON.stringify(paxTypes)} cabin=${cabinClass}`);
                    const orRes = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
                        method: 'POST',
                        headers: duffelHeaders,
                        body: JSON.stringify({ data: { slices, passengers: paxTypes, cabin_class: cabinClass } }),
                    });
                    const orData = await orRes.json();

                    if (!orRes.ok) {
                        throw new Error(`offer_request failed (${orRes.status}): ${orData?.errors?.[0]?.message ?? 'unknown error'}`);
                    }

                    // Offers come back inline when return_offers=true
                    let offers: any[] = orData.data?.offers ?? [];
                    console.warn(`[/book] offer_request returned ${offers.length} offers. offer_request_id=${orData.data?.id}`);

                    // If no inline offers, fetch them separately (some Duffel configs need this)
                    if (offers.length === 0 && orData.data?.id) {
                        const offersRes = await fetch(
                            `https://api.duffel.com/air/offers?offer_request_id=${orData.data.id}&limit=50`,
                            { headers: duffelHeaders }
                        );
                        const offersData = await offersRes.json();
                        offers = offersData.data ?? [];
                        console.warn(`[/book] Fallback offer fetch: ${offers.length} offers`);
                    }

                    if (offers.length === 0) throw new Error('No offers available for this route — flight may be fully booked or unavailable');

                    // Find best match: prefer same operating carrier, then closest price
                    const targetCarrier = rawOffer.validating_carrier_iata_code
                        ?? rawOffer.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                        ?? rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                    const targetTotal = parseFloat(rawOffer.total_amount ?? '0');

                    const matchingOffers = targetCarrier
                        ? offers.filter((o: any) => {
                            const carrier = o.validating_carrier_iata_code
                                ?? o.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                                ?? o.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                            return carrier === targetCarrier;
                          })
                        : offers;

                    const pool = matchingOffers.length > 0 ? matchingOffers : offers;
                    const freshOffer = pool.reduce((best: any, o: any) => {
                        if (!best) return o;
                        const diff = Math.abs(parseFloat(o.total_amount) - targetTotal);
                        const bestDiff = Math.abs(parseFloat(best.total_amount ?? '999999') - targetTotal);
                        return diff < bestDiff ? o : best;
                    }, null as any);

                    if (!freshOffer) throw new Error('Could not select a fresh offer from results');

                    // Rebuild passengers with new offer's passenger IDs
                    const freshPaxTemplates: any[] = freshOffer.passengers ?? [];
                    const refreshedPassengers = activePassengers.map((pax: any, idx: number) => ({
                        ...pax,
                        id: freshPaxTemplates[idx]?.id ?? pax.id,
                    }));

                    // Per Duffel docs: seat service IDs (ase_...) are specific to an offer.
                    // After refreshing to a new offer, the old service IDs are invalid.
                    // Drop them — user will be billed only the base fare on the refreshed offer.
                    const freshTotal = parseFloat(freshOffer.total_amount ?? '0').toFixed(2);

                    console.log(`[/book] Auto-refresh succeeded: ${activeOffer.id} → ${freshOffer.id} | price: ${activeOffer.total_amount} → ${freshOffer.total_amount} | carrier: ${targetCarrier}`);

                    activeOffer = freshOffer;
                    activePassengers = refreshedPassengers;
                    activeTotal = freshTotal;

                    // ── Attempt 2: Place order with refreshed offer ──
                    duffelOrderRes = await fetch('https://api.duffel.com/air/orders', {
                        method: 'POST',
                        headers: duffelHeaders,
                        body: JSON.stringify({ data: buildOrderBody(activeOffer.id, activePassengers, activeTotal, activeOffer.total_currency) }),
                    });
                    duffelOrderData = await duffelOrderRes.json();
                    console.log(`[/book] Retry order status: ${duffelOrderRes.status}`, duffelOrderRes.ok ? 'OK' : JSON.stringify(duffelOrderData?.errors?.[0]));

                } catch (refreshErr: any) {
                    console.error('[/book] Offer auto-refresh failed:', refreshErr.message);
                    // Fall through to the error handler below with the original 422 status
                }
            }

            if (!duffelOrderRes.ok) {
                const rawErrMsg = duffelOrderData?.errors?.[0]?.message ?? '';
                console.error('[/book] Duffel pre-order failed:', duffelOrderRes.status, rawErrMsg);
                const isPhoneErr = /phone_number/i.test(rawErrMsg);
                const isExpiredErr = duffelOrderRes.status === 422 || /expired|no longer available|select another offer/i.test(rawErrMsg);
                const errMsg = isPhoneErr
                    ? 'Invalid phone number format. Please check your phone number and country code.'
                    : isExpiredErr
                    ? 'This flight is no longer available. Please search again for current prices.'
                    : rawErrMsg || 'Flight booking failed. Please try again.';
                return NextResponse.json({ success: false, error: errMsg }, { status: isExpiredErr ? 409 : 400 });
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
        // The provider (Duffel/Mystifly) is billed the original fare from our balance.
        // See src/lib/pricing.ts for the full strategy rationale.
        const totalWithSeats = flightTotal + (seatTotal ?? 0) + (bagTotal ?? 0);
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

        // Step 3a: Update critical fields (PI id + status). Must succeed.
        const { error: sessionUpdateError } = await supabase
            .from('booking_sessions')
            .update({
                payment_intent_id: paymentIntent.id,
                status: 'payment_initiated',
                original_price: pricing.originalPrice,
                charged_price: pricing.chargedPrice,
                markup_pct: pricing.markupRate,
                currency: flightCurrency,
            })
            .eq('id', sessionId);

        if (sessionUpdateError) {
            console.error('[/book] Failed to update booking session (critical fields):', sessionUpdateError.message);
            // Don't fail the request — Stripe PI is already created. create-booking
            // will fall back to live booking which may fail, but the user won't be
            // charged without a booking. Log for investigation.
        }

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
        return NextResponse.json({
            success: false,
            error: err.message || 'An unexpected error occurred'
        }, { status: 500 });
    }
}
