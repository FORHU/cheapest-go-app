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
        const { provider, flight, passengers, contact, idempotencyKey } = body;

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
            }),
        });

        const sessionData = await sessionRes.json();

        if (!sessionData.success) {
            throw new Error(sessionData.error || 'Failed to create booking session');
        }

        const sessionId = sessionData.sessionId;

        // ── Step 2: Create Stripe PaymentIntent (Embedded Checkout) ──
        // Calculate price in smallest currency unit (cents)
        const unitAmount = Math.round((flight.price || 10) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: unitAmount,
            currency: (flight.currency || 'USD').toLowerCase(),
            description: `Flight Booking: ${flight.segments?.[0]?.origin} to ${flight.segments?.[flight.segments.length - 1]?.destination} with ${provider}`,
            metadata: {
                // Pass the vital internal session ID so the webhook knows what to book!
                bookingSessionId: sessionId,
                provider: provider,
                contactEmail: contact.email,
                passengerName: passengers[0] ? `${passengers[0].firstName} ${passengers[0].lastName}` : 'Traveler'
            },
        });




        return NextResponse.json({
            success: true,
            data: {
                clientSecret: paymentIntent.client_secret, // Return the PaymentIntent secret to the frontend
                sessionId: sessionId,
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
