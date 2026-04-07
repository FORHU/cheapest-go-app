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
        const { provider, flight, passengers, contact, idempotencyKey, farePolicy } = body as {
            provider: string;
            flight: FlightOffer;
            passengers: any[];
            contact: { email: string; phone: string };
            idempotencyKey: string;
            farePolicy: FarePolicy;
        };

        // Use server-verified user ID
        const userId = user.id;

        // ── Validate ──
        if (!provider || !['duffel', 'mystifly', 'mystifly_v2'].includes(provider)) {
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
            return NextResponse.json({
                success: false,
                error: revalData.error || 'This flight is no longer available from the supplier. Please return to search.'
            }, { status: 409 });
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
        if (provider === 'mystifly' || provider === 'mystifly_v2') {
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

        // ── Step 2: Create Stripe PaymentIntent ──
        const stripeStart = Date.now();
        const isMystifly = provider === 'mystifly' || provider === 'mystifly_v2';

        // Apply platform markup before charging the customer.
        // The provider (Duffel/Mystifly) is billed the original fare from our balance.
        // See src/lib/pricing.ts for the full strategy rationale.
        const pricing = applyMarkup(flightTotal, FLIGHT_MARKUP);
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
            },
            description: `Flight Booking: ${flight.segments[0]?.origin} to ${flight.segments[flight.segments.length - 1]?.destination}`,
        });
        logApiCall({
            provider: 'stripe', endpoint: 'paymentIntents.create', durationMs: Date.now() - stripeStart,
            requestParams: { amount: flightStripeAmount, currency: flightCurrency, captureMethod: isMystifly ? 'manual' : 'automatic', markupRate: pricing.markupRate },
            responseStatus: 200, userId,
            responseSummary: { paymentIntentId: paymentIntent.id, sessionId, chargedPrice: pricing.chargedPrice },
        });

        // ── Step 3: Store PaymentIntent ID in booking session ──
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await supabase
            .from('booking_sessions')
            .update({
                payment_intent_id: paymentIntent.id,
                status: 'payment_initiated',
                // Pricing audit — original provider cost vs what the customer was charged
                original_price: pricing.originalPrice,
                charged_price: pricing.chargedPrice,
                markup_pct: pricing.markupRate,
                currency: flightCurrency,
            })
            .eq('id', sessionId);

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
