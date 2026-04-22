import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/flights/booking-status?sessionId=xxx
 *
 * Lightweight DB-only check — no external calls.
 * Used by the client to poll for a booking after payment, so we don't have to
 * block on the slow create-booking fallback if the webhook already handled it.
 */
export async function GET(req: NextRequest) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!sessionId) {
            return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: booking } = await supabase
            .from('flight_bookings')
            .select('id, pnr, status')
            .eq('session_id', sessionId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!booking) {
            return NextResponse.json({ found: false });
        }

        if (booking.status === 'failed') {
            return NextResponse.json({
                found: true,
                failed: true,
                error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
            });
        }

        return NextResponse.json({
            found: true,
            bookingId: booking.id,
            pnr: booking.pnr,
            status: booking.status,
        });
    } catch (err) {
        console.error('[booking-status] Error:', err);
        return NextResponse.json({ found: false }, { status: 500 });
    }
}
