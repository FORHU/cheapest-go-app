import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { getAuthenticatedUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const bookingId = req.nextUrl.searchParams.get('bookingId');
    if (!bookingId) return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });

    // Notes are booking data, so this route authorises itself rather than relying on
    // the page that calls it — see ADR-0027. Until this check existed, any caller who
    // knew (or guessed) a booking id could read its notes.
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });

    const db = createAdminClient();

    const { data: booking } = await db
        .from('flight_bookings')
        .select('id, user_id')
        .eq('id', bookingId)
        .maybeSingle();

    // Same response for "no such booking" and "not yours": distinguishing them would
    // turn this route into an oracle for which booking ids exist.
    if (!booking || booking.user_id !== user.id) {
        return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    const { data, error } = await db
        .from('flight_booking_notes')
        .select('note, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, notes: data ?? [] });
}
