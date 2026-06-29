import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { stripe } from '@/lib/stripe/server';
import { flightBookingSchema } from '@/lib/schemas/flight';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP } from '@/lib/pricing';
import { rateLimit } from '@/lib/server/rate-limit';
import { getMobileApiKey } from '@/lib/server/mobile-auth';
import { placeDuffelOrder } from '@/lib/server/flights/place-duffel-order';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/flights/book
 *
 * Mobile equivalent of /api/flights/book.
 * Authenticates via X-Mobile-Api-Key header instead of session cookies.
 * No CSRF check (mobile apps are not vulnerable to CSRF).
 *
 * Does the full booking flow:
 *   1. Price revalidation
 *   2. Booking session creation
 *   3. Duffel pre-order (locks the fare before charging)
 *   4. Stripe PaymentIntent creation
 *
 * Returns: { success, clientSecret, sessionId }
 */
export async function POST(req: NextRequest) {
    // ── API key auth — DB key takes priority over env var ─────────────────
    const apiKey = req.headers.get('x-mobile-api-key');
    const activeKey = await getMobileApiKey();
    if (!apiKey || !activeKey || apiKey !== activeKey) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limiting ─────────────────────────────────────────────────────
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'mobile-flights-book' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        const body = await req.json();
        console.log('[mobile/book] incoming body:', JSON.stringify(body, null, 2));
        const {
            provider,
            flight,
            passengers,
            contact,
            idempotencyKey,
            seatServiceIds,
            seatTotal,
            bagServiceIds,
            bagTotal,
            confirmedPrice,
        } = body;

        // ── Validate ──────────────────────────────────────────────────────
        if (provider !== 'duffel') {
            console.error('[mobile/book] 400 — unsupported provider:', provider);
            return NextResponse.json({ success: false, error: 'Only Duffel bookings are supported on mobile at this time.' }, { status: 400 });
        }
        if (!flight || typeof flight !== 'object') {
            console.error('[mobile/book] 400 — missing or invalid flight object:', flight);
            return NextResponse.json({ success: false, error: 'flight object is required' }, { status: 400 });
        }

        const passengerParsed = flightBookingSchema.safeParse({ passengers, contact });
        if (!passengerParsed.success) {
            console.error('[mobile/book] 400 — passenger/contact validation failed:', passengerParsed.error.issues);
            return NextResponse.json(
                { success: false, error: passengerParsed.error.issues[0]?.message ?? 'Invalid passenger or contact data' },
                { status: 400 }
            );
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const edgeFnHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
        };

        const flightTotal = typeof flight.price === 'number'
            ? flight.price as number
            : flight.price?.total ?? 0;
        const flightCurrency = (
            (typeof flight.price === 'object' ? flight.price?.currency : undefined)
            || (flight as any).currency
            || 'USD'
        ).toLowerCase();

        if (flightTotal <= 0) {
            console.error('[mobile/book] 400 — invalid flight price:', flightTotal, 'raw flight.price:', flight.price);
            return NextResponse.json({ success: false, error: 'Invalid flight price' }, { status: 400 });
        }

        // ── Resolve real user ID from session ────────────────────────────
        // Mobile app auth uses Lucia sessions via the cg-session cookie.
        // Falls back to MOBILE_GUEST_USER_ID only if no session is present.
        const { getSession } = await import('@/lib/auth/session');
        const { user: sessionUser } = await getSession();
        const userId = sessionUser?.id ?? env.MOBILE_GUEST_USER_ID ?? '00000000-0000-0000-0000-000000000001';
        if (!sessionUser?.id && !env.MOBILE_GUEST_USER_ID) {
            return NextResponse.json({ success: false, error: 'Invalid session. Please log in again.' }, { status: 401 });
        }

        // ── Step 1: Price revalidation ────────────────────────────────────
        const revalRes = await fetch(`${siteUrl}/api/internal/revalidate-flight`, {
            method: 'POST',
            headers: edgeFnHeaders,
            body: JSON.stringify({ userId, provider, flightPayload: { ...flight, oldPrice: flightTotal } }),
        });
        const revalData = await revalRes.json();

        if (!revalData.success || !revalData.seatsAvailable) {
            return NextResponse.json({
                success: false,
                error: revalData.error || 'This flight is no longer available. Please search again.',
            }, { status: 409 });
        }

        if (revalData.priceChanged && revalData.newPrice > 0) {
            return NextResponse.json({
                success: false,
                error: `Flight price changed to ${revalData.newPrice}. Please restart booking.`,
                priceChanged: true,
                newPrice: revalData.newPrice,
            }, { status: 409 });
        }

        const farePolicy = revalData.farePolicy || { isRefundable: false, isChangeable: false };

        // ── Step 2: Create booking session (direct DB insert) ────────────
        const db = createAdminClient();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { data: sessionRow, error: sessionError } = await db
            .from('booking_sessions')
            .insert({
                user_id: userId,
                provider,
                flight: flight as any,
                passengers: passengers as any,
                contact: contact as any,
                idempotency_key: idempotencyKey ?? crypto.randomUUID(),
                is_refundable: farePolicy?.isRefundable ?? null,
                is_changeable: farePolicy?.isChangeable ?? null,
                refund_penalty_amount: farePolicy?.refundPenaltyAmount ?? null,
                refund_penalty_currency: farePolicy?.refundPenaltyCurrency ?? null,
                fare_policy: farePolicy as any,
                policy_locked: true,
                status: 'initiated',
                expires_at: expiresAt,
                ...(seatServiceIds?.length ? { seat_service_ids: seatServiceIds, seat_total: seatTotal ?? 0 } : {}),
            })
            .select('id')
            .single();
        if (sessionError || !sessionRow) {
            throw new Error(sessionError?.message || 'Failed to create booking session');
        }
        const sessionId = (sessionRow as any).id;

        // ── Step 3: Duffel pre-order ──────────────────────────────────────
        // Create the airline order BEFORE charging the card so the fare is locked.
        const rawOffer = (flight as any)._rawOffer;
        if (!rawOffer?.id) throw new Error('Duffel offer data missing. Please go back and reselect the flight.');

        const duffelToken = env.DUFFEL_TOKEN;
        if (!duffelToken) throw new Error('Duffel not configured.');

        const isSandbox = duffelToken.startsWith('duffel_test_');

        // E.164 phone normalization
        const rawCountryCode = String((contact as any).countryCode ?? '63').replace(/\D/g, '') || '63';
        const rawPhone = String((contact as any).phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
        const e164Phone = `+${rawCountryCode}${rawPhone}`;
        const totalDigits = rawCountryCode.length + rawPhone.length;
        if (rawPhone.length < 4 || totalDigits < 7 || !/^\+\d{7,15}$/.test(e164Phone)) {
            console.error('[mobile/book] 400 — phone validation failed:', { e164Phone, rawCountryCode, rawPhone, totalDigits });
            return NextResponse.json({
                success: false,
                error: 'Invalid phone number. Please enter a valid phone number with country code.',
            }, { status: 400 });
        }

        function duffelTitle(pax: any): string {
            const g = (pax.gender ?? '').toUpperCase();
            const t = (pax.type ?? '').toUpperCase();
            if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
            return g === 'M' ? 'mr' : 'ms';
        }

        const duffelPaxTemplates: any[] = rawOffer.passengers ?? [];
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

        // Compute order total from rawOffer available_services (server-authoritative)
        const availableSvcs: any[] = rawOffer.available_services ?? [];
        let computedSeatExtra = 0;
        let computedBagExtra = 0;
        for (const id of (seatServiceIds ?? [])) {
            const svc = availableSvcs.find((s: any) => s.id === id);
            if (svc) computedSeatExtra += parseFloat(svc.total_amount ?? '0');
        }
        for (const id of (bagServiceIds ?? [])) {
            const svc = availableSvcs.find((s: any) => s.id === id);
            if (svc) computedBagExtra += parseFloat(svc.total_amount ?? '0');
        }
        const offerTotal = parseFloat(rawOffer.total_amount ?? '0');
        const orderTotal = (offerTotal + computedSeatExtra + computedBagExtra).toFixed(2);
        const orderCurrency = rawOffer.total_currency ?? 'USD';

        const allServiceIds = [...(seatServiceIds ?? []), ...(bagServiceIds ?? [])];

        const duffelHeaders = {
            'Authorization': `Bearer ${duffelToken}`,
            'Duffel-Version': 'v2',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey ?? crypto.randomUUID(),
        };

        const orderAbort = new AbortController();
        const orderTimeout = setTimeout(() => orderAbort.abort(), 45_000);

        let duffelRes: Response;
        let duffelData: any;
        try {
            duffelRes = await fetch('https://api.duffel.com/air/orders', {
                method: 'POST',
                headers: duffelHeaders,
                body: JSON.stringify({
                    data: {
                        type: 'instant',
                        selected_offers: [rawOffer.id],
                        passengers: orderPassengers,
                        payments: [{ type: 'balance', amount: orderTotal, currency: orderCurrency }],
                        ...(allServiceIds.length ? {
                            services: allServiceIds.map((id: string) => ({ id, quantity: 1 })),
                        } : {}),
                    },
                }),
                signal: orderAbort.signal,
            });
            duffelData = await duffelRes.json();
        } catch (fetchErr: any) {
            clearTimeout(orderTimeout);
            if (fetchErr?.name === 'AbortError') {
                throw new Error('Airline booking system timed out. Please try again.');
            }
            throw fetchErr;
        }
        clearTimeout(orderTimeout);

        if (!duffelRes.ok) {
            const errCode = duffelData?.errors?.[0]?.code ?? '';
            const errMsg = duffelData?.errors?.[0]?.message ?? '';
            const isPhoneErr = /phone_number/i.test(errMsg);
            const isExpired = duffelRes.status === 422 || /expired|no longer available/i.test(errMsg);
            const isPriceChanged = errCode === 'price_changed';

            if (isPriceChanged) {
                return NextResponse.json({ success: false, error: 'Flight price changed. Please go back and reselect the flight.', priceChanged: true }, { status: 409 });
            }
            if (isPhoneErr) {
                console.error('[mobile/book] 400 — Duffel phone error:', { errCode, errMsg, e164Phone });
                return NextResponse.json({ success: false, error: 'Invalid phone number format. Please check your country code and phone number.' }, { status: 400 });
            }
            if (isExpired) {
                return NextResponse.json({ success: false, error: 'This flight is no longer available. Please search again.' }, { status: 409 });
            }
            throw new Error(errMsg || 'Flight booking failed with the airline. Please try again.');
        }

        const order = duffelData.data;
        const tickets = (order.documents ?? [])
            .filter((d: any) => d.type === 'electronic_ticket')
            .map((d: any) => d.unique_identifier as string);

        // ── Step 4: Store pre-order in session ────────────────────────────
        const supabase = createAdminClient();

        await supabase.from('booking_sessions').update({
            duffel_pre_order_id: order.id,
            duffel_pre_order_pnr: order.booking_reference ?? order.id,
            duffel_pre_order_tickets: tickets,
            duffel_pre_order_ticketed: tickets.length > 0,
        }).eq('id', sessionId);

        // ── Step 5: Create Stripe PaymentIntent ───────────────────────────
        const pricing = applyMarkup(parseFloat(orderTotal), FLIGHT_MARKUP);
        const stripeAmount = toStripeAmount(pricing.chargedPrice, flightCurrency);

        const piIdempotencyKey = `mobile-flight-pi-${userId}-${sessionId}`;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
            currency: flightCurrency,
            capture_method: 'automatic',
            metadata: {
                bookingSessionId: sessionId,
                provider,
                userId,
                passengerEmail: contact.email,
                originalPrice: String(pricing.originalPrice),
                markupRate: String(pricing.markupRate),
                markupAmount: String(pricing.markupAmount),
                duffelOrderId: order.id,
                duffelPnr: order.booking_reference ?? order.id,
                duffelTickets: tickets.join(','),
                duffelIsTicketed: String(tickets.length > 0),
                type: 'mobile_flight',
            },
            description: `CheapestGo Mobile: ${flight.segments?.[0]?.origin} → ${flight.segments?.[flight.segments.length - 1]?.destination}`,
        }, { idempotencyKey: piIdempotencyKey });

        // Store PI in session
        await supabase.from('booking_sessions').update({
            payment_intent_id: paymentIntent.id,
            status: 'payment_initiated',
        }).eq('id', sessionId);

        console.log(`[mobile/book] Pre-order ${order.id} | Session ${sessionId} | PI ${paymentIntent.id} | sandbox=${isSandbox}`);

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            sessionId,
        });

    } catch (err: any) {
        console.error('[mobile/book]', err);
        return NextResponse.json({
            success: false,
            error: err.message || 'An unexpected error occurred. Please try again.',
        }, { status: 500 });
    }
}
