import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ─── POST /api/flights/book ──────────────────────────────────────────
//
// Two-step booking flow via Supabase Edge Functions:
//   1. create-booking-session  →  stores flight + passengers temporarily
//   2. create-booking          →  calls provider API, saves to DB
//

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, provider, flight, passengers, contact } = body;

        // ── Validate ──
        if (!userId) {
            return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
        }
        if (!provider || !['amadeus', 'mystifly'].includes(provider)) {
            return NextResponse.json({ success: false, error: 'provider must be "amadeus" or "mystifly"' }, { status: 400 });
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
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase environment variables not set');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
        };

        // ── Step 1: Create Booking Session ──
        const sessionRes = await fetch(`${supabaseUrl}/functions/v1/create-booking-session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ userId, provider, flight, passengers, contact }),
        });

        const sessionData = await sessionRes.json();

        if (!sessionData.success) {
            throw new Error(sessionData.error || 'Failed to create booking session');
        }

        const sessionId = sessionData.sessionId;

        // ── Step 2: Create Booking (calls provider API + saves to DB) ──
        const bookingRes = await fetch(`${supabaseUrl}/functions/v1/create-booking`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ sessionId }),
        });

        const bookingData = await bookingRes.json();

        if (!bookingData.success) {
            throw new Error(bookingData.error || 'Booking failed');
        }

        return NextResponse.json({
            success: true,
            data: {
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                status: 'confirmed',
                totalPaid: flight.price ?? 0,
                currency: flight.currency ?? 'USD',
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
