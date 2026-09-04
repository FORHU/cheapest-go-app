import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invokeEdgeFunction } from '@/utils/postgres/functions';
import { createAdminClient } from '@/utils/postgres/admin';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

const noteSchema = z.object({
    // The booking is the anchor for authorisation, so it is required rather than the
    // optional "save a copy too" flag it used to be.
    bookingId: z.string().uuid('bookingId must be a booking UUID'),
    notes: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
});

/**
 * Adds a remark to a flight booking, both with the supplier and in our own table.
 *
 * This route writes to a supplier, so it authorises itself against the session and the
 * booking's owner — see ADR-0027. It previously took `uniqueId` (the PNR) straight from
 * the request body with no session, no CSRF check and no rate limit, which let any
 * caller write arbitrary text onto any reservation Mystifly holds.
 */
export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });

    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'booking-note', userId: user.id });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const parsed = noteSchema.safeParse(await req.json());
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
            { status: 400 }
        );
    }
    const { bookingId, notes } = parsed.data;

    const db = createAdminClient();

    const { data: booking } = await db
        .from('flight_bookings')
        .select('id, user_id, pnr')
        .eq('id', bookingId)
        .maybeSingle();

    if (!booking || booking.user_id !== user.id) {
        return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    // The PNR comes from the row we just authorised, never from the caller. Taking it
    // from the body would let someone pair their own bookingId with a stranger's PNR
    // and pass the ownership check while writing to the stranger's reservation.
    if (!booking.pnr) {
        return NextResponse.json({ success: false, error: 'This booking has no supplier reference yet' }, { status: 409 });
    }

    let data: any;
    try {
        data = await invokeEdgeFunction('mystifly-booking-note', { uniqueId: booking.pnr, notes });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }

    if (!data.success) return NextResponse.json(data);

    try {
        const rows = notes.map((note: string) => ({ booking_id: bookingId, note }));
        const { error } = await db.from('flight_booking_notes').insert(rows);
        if (error) console.error('[booking-note] DB insert error:', error.message);
    } catch (err: any) {
        console.error('[booking-note] DB save failed:', err.message);
    }

    return NextResponse.json(data);
}
