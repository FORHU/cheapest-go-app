import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const body = await req.json();
        const { provider, flight, passengers, contact, idempotencyKey, farePolicy } = body;

        // Use server-verified user ID
        const userId = user.id;

        // ── Validate ──
        if (!provider || !['duffel', 'mystifly', 'mystifly_v2'].includes(provider)) {
            return NextResponse.json({ success: false, error: 'invalid provider string passed' }, { status: 400 });
        }
        if (!flight || typeof flight !== 'object') {
            return NextResponse.json({ success: false, error: 'flight object is required' }, { status: 400 });
        }
        if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
            return NextResponse.json({ success: false, error: 'At least one passenger is required' }, { status: 400 });
        }
        if (!contact?.email || !contact?.phone) {
            return NextResponse.json({ success: false, error: 'Contact email and phone are required' }, { status: 400 });
        }

        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[/book] Missing Supabase env variables');
            return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
        }

        const edgeFnHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        };

        // ── SERVER-SIDE REVALIDATION & TTL GUARD ──
        const revalRes = await fetch(`${env.SUPABASE_URL}/functions/v1/revalidate-flight`, {
            method: 'POST',
            headers: edgeFnHeaders,
            body: JSON.stringify({
                userId,
                provider,
                flightPayload: { ...flight, oldPrice: flight.price.total },
            }),
        });

        const revalData = await revalRes.json();

        if (!revalData.success || !revalData.seatsAvailable) {
            return NextResponse.json({
                success: false,
                error: revalData.error || 'This flight is no longer available from the supplier. Please return to search.'
            }, { status: 409 });
        }

        if (revalData.priceChanged && Math.abs(revalData.newPrice - flight.price.total) > 0.01) {
            return NextResponse.json({
                success: false,
                error: `Flight price changed. Please restart booking.`
            }, { status: 409 });
        }

        const serverFarePolicy = revalData.farePolicy || farePolicy;
        const sanitizedFlight = { ...flight };
        if (provider === 'mystifly' || provider === 'mystifly_v2') {
            delete (sanitizedFlight as any).rawOffer;
            delete (sanitizedFlight as any)._rawOffer;
        }

        // ── Step 1: Create Booking Session ──
        const sessionRes = await fetch(`${env.SUPABASE_URL}/functions/v1/create-booking-session`, {
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
        if (!sessionData.success) {
            throw new Error(sessionData.error || 'Failed to create booking session');
        }

        const sessionId = sessionData.sessionId;

        // ── Step 2: Create Stripe PaymentIntent ──
        const isMystifly = provider === 'mystifly' || provider === 'mystifly_v2';
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(flight.price.total * 100),
            currency: flight.price.currency.toLowerCase(),
            capture_method: isMystifly ? 'manual' : 'automatic',
            metadata: {
                bookingSessionId: sessionId,
                provider: provider,
                userId: userId,
                passengerEmail: contact.email,
            },
            description: `Flight Booking: ${flight.segments[0].origin} to ${flight.segments[flight.segments.length - 1].destination}`,
        });

        // ── Step 3: Store PaymentIntent ID in booking session ──
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await supabase
            .from('booking_sessions')
            .update({
                payment_intent_id: paymentIntent.id,
                status: 'payment_initiated'
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
