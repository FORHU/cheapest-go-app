import { NextRequest, NextResponse } from 'next/server';
import { sendFlightBookingConfirmationEmail } from '@/lib/server/email';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';

// ─── POST /api/flights/book ──────────────────────────────────────────
//
// Two-step booking flow via Supabase Edge Functions:
//   1. create-booking-session  →  stores flight + passengers temporarily
//   2. create-booking          →  calls provider API, saves to DB
//
// SECURITY: Requires authenticated user (JWT verified server-side).
// Uses service role key for edge function calls to prevent direct abuse.
// Client-supplied rawOffer is stripped — server rebuilds/revalidates.
//

export async function POST(req: NextRequest) {
    try {
        // ── CRITICAL-3 FIX: Server-side authentication ──
        const { user, error: authError } = await getAuthenticatedUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 },
            );
        }

        const body = await req.json();
        const { provider, flight, passengers, contact, idempotencyKey, farePolicy } = body;

        // Use server-verified user ID, never trust client-supplied userId
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

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        // CRITICAL-4 FIX: Use service role key for edge function calls (not public anon key)
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Supabase environment variables not set');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
        };

        // ── SERVER-SIDE REVALIDATION & TTL GUARD ──
        // Never trust the frontend's fare rules. Revalidate immediately 
        // before saving the session to enforce price and availability.
        const revalRes = await fetch(`${supabaseUrl}/functions/v1/revalidate-flight`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                userId,
                provider,
                flightPayload: { ...flight, oldPrice: flight.price },
            }),
        });

        const revalData = await revalRes.json();

        if (!revalData.success || !revalData.seatsAvailable) {
            return NextResponse.json({
                success: false,
                error: revalData.error || 'This flight is no longer available from the supplier. Please return to search.'
            }, { status: 409 });
        }

        if (revalData.priceChanged && Math.abs(revalData.newPrice - flight.price) > 0.01) {
            console.error('\n-------- MYSTIFLY RAW PAYLOAD (Zero Price Error) --------');
            console.error(JSON.stringify(revalData, null, 2));
            console.error('---------------------------------------------------------\n');

            return NextResponse.json({
                success: false,
                error: `Flight price changed from ${flight.currency} ${flight.price} to ${revalData.newPrice}. Please restart booking.`
            }, { status: 409 });
        }

        // Overwrite frontend policy with the immutable server-validated snapshot
        const serverFarePolicy = revalData.farePolicy || farePolicy;

        // CRITICAL-2 FIX: Strip rawOffer from flight data ONLY FOR MYSTIFLY
        const sanitizedFlight = { ...flight };
        if (provider === 'mystifly' || provider === 'mystifly_v2') {
            delete sanitizedFlight.rawOffer;
            delete sanitizedFlight._raw;
            delete sanitizedFlight._rawOffer;
        }

        // ── Step 1: Create Booking Session ──
        // HIGH-2 FIX: Pass idempotencyKey for duplicate detection
        const sessionRes = await fetch(`${supabaseUrl}/functions/v1/create-booking-session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                userId,
                provider,
                flight: sanitizedFlight,
                passengers,
                contact,
                idempotencyKey: idempotencyKey || undefined,
                farePolicy: serverFarePolicy,
            }),
        });

        const sessionData = await sessionRes.json();

        if (!sessionData.success) {
            throw new Error(sessionData.error || 'Failed to create booking session');
        }

        const sessionId = sessionData.sessionId;

        // ── Step 2: Create Stripe PaymentIntent ──
        // STEP 3: Create Stripe PaymentIntent with manual capture for Mystifly
        // DO NOT capture money yet. Mystifly requires PNR first.
        // Duffel: automatic capture (money taken when payment succeeds).
        const isMystifly = provider === 'mystifly' || provider === 'mystifly_v2';
        const unitAmount = Math.round((flight.price || 10) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: unitAmount,
            currency: (flight.currency || 'USD').toLowerCase(),
            // Manual capture for Mystifly: authorizes card but does NOT charge yet.
            // Money is only captured after the supplier confirms the booking (PNR received).
            ...(isMystifly ? { capture_method: 'manual' } : {}),
            description: `Flight Booking: ${flight.segments?.[0]?.origin} to ${flight.segments?.[flight.segments.length - 1]?.destination} with ${provider}`,
            metadata: {
                bookingSessionId: sessionId,
                provider: provider,
                contactEmail: contact.email,
                passengerName: passengers[0] ? `${passengers[0].firstName} ${passengers[0].lastName}` : 'Traveler',
            },
        });

        // ── Step 3: Store PaymentIntent ID in booking session ──
        // create-booking needs this to capture or cancel payment after supplier responds.
        const supabase = (await import('@supabase/supabase-js')).createClient(supabaseUrl, serviceRoleKey);
        await supabase
            .from('booking_sessions')
            .update({
                payment_intent_id: paymentIntent.id,
                capture_method: isMystifly ? 'manual' : 'automatic',
                status: 'initiated',
            })
            .eq('id', sessionId);

        return NextResponse.json({
            success: true,
            data: {
                clientSecret: paymentIntent.client_secret,
                sessionId: sessionId,
                paymentIntentId: paymentIntent.id,
                captureMethod: isMystifly ? 'manual' : 'automatic',
            },
        });
    } catch (err) {
        console.error('[FlightBook] Error:', err);
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Booking failed. Please try again.' },
            { status: 500 },
        );
    }
}
