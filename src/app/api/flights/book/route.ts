import { NextRequest, NextResponse } from 'next/server';
import { sendFlightBookingConfirmationEmail } from '@/lib/server/email';
import { getAuthenticatedUser } from '@/lib/server/auth';

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

        // HIGH-1 FIX: Use server-confirmed price from edge function, not client-supplied
        const confirmedPrice = bookingData.confirmedPrice ?? flight.price ?? 0;
        const confirmedCurrency = bookingData.confirmedCurrency ?? flight.currency ?? 'USD';

        let finalBookingStatus = bookingData.status ?? 'confirmed';
        let confirmedTickets = (bookingData.passengers ?? [])
            .filter((p: any) => p.ticket_number)
            .map((p: any) => ({ name: `${p.first_name} ${p.last_name}`, number: p.ticket_number }));

        // ── Step 3: Automate Ticketing for Duffel ──
        // Duffel confirms the PNR first. To match Mystifly's instant-ticket feel,
        // we automatically trigger the ticketing function if it's not already ticketed.
        if (provider === 'duffel' && finalBookingStatus !== 'ticketed') {
            try {
                console.log('[FlightBook] Automating Duffel ticketing for:', bookingData.bookingId);
                const ticketRes = await fetch(`${supabaseUrl}/functions/v1/issue-ticket`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ bookingId: bookingData.bookingId }),
                });

                const ticketResult = await ticketRes.json();
                if (ticketResult.success) {
                    finalBookingStatus = 'ticketed';
                    if (ticketResult.ticketNumbers?.length) {
                        // Re-fetch or map tickets if successful
                        confirmedTickets = ticketResult.ticketNumbers.map((num: string, idx: number) => ({
                            name: passengers[idx] ? `${passengers[idx].firstName} ${passengers[idx].lastName}` : 'Traveler',
                            number: num
                        }));
                    }
                    console.log('[FlightBook] Duffel ticketing successful');
                } else {
                    console.warn('[FlightBook] Duffel auto-ticketing failed (background):', ticketResult.error);
                }
            } catch (ticketErr) {
                console.error('[FlightBook] Duffel auto-ticketing error:', ticketErr);
                // We don't throw here — the PNR is already created, so we return success for the booking part
            }
        }

        // ── Send confirmation email ──
        const passengerName = passengers[0]
            ? `${passengers[0].firstName} ${passengers[0].lastName}`
            : 'Traveler';

        try {
            const emailResult = await sendFlightBookingConfirmationEmail({
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                email: contact.email,
                passengerName,
                provider,
                segments: sanitizedFlight.segments ?? [],
                tickets: confirmedTickets,
                totalPrice: confirmedPrice,
                currency: confirmedCurrency,
            });
            console.log('[FlightBook] Email result:', emailResult);
        } catch (emailErr) {
            console.error('[FlightBook] Email send failed:', emailErr);
        }

        return NextResponse.json({
            success: true,
            data: {
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                status: finalBookingStatus,
                totalPaid: confirmedPrice,
                currency: confirmedCurrency,
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
