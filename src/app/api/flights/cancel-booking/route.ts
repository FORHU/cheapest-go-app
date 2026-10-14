import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/utils/postgres/admin';
import { checkCsrf } from '@/lib/server/csrf';
import { cancelFlightBooking, CANCEL_BOOKING_COLUMNS } from '@/lib/server/flights/cancel-flight-booking';

export const maxDuration = 60;

const cancelFlightSchema = z.object({
    bookingId: z.string().min(1, 'bookingId is required'),
    cancellationId: z.string().optional(), // Pre-fetched Duffel quote ID — skip the quote step if provided
});

/**
 * POST /api/flights/cancel-booking
 *
 * V1 — Full booking cancellation only.
 * No partial passenger / segment-level cancellation yet.
 *
 * This route authenticates the traveller and checks the booking is theirs. What cancelling
 * actually does (supplier, refund, statuses, emails) lives in cancelFlightBooking, which the Duffel
 * webhook uses too, so a cancellation made in Duffel's dashboard ends the same way.
 *
 * Body: { bookingId: string }
 */
export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    try {
        // ── Auth — use Lucia session ─────────────────────────────────────
        const { getSession } = await import('@/lib/auth/session');
        const { user: sessionUser } = await getSession();
        if (!sessionUser) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const rawBody = await req.json();
        const cancelParsed = cancelFlightSchema.safeParse(rawBody);
        if (!cancelParsed.success) {
            return NextResponse.json(
                { success: false, error: cancelParsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }
        const { bookingId, cancellationId: preQuotedCancellationId } = cancelParsed.data;

        // Service-role client for all DB operations (bypasses RLS)
        const supabase = createAdminClient();


        // ── Step 1: Load booking ──────────────────────────────────────
        const { data: booking, error: fetchErr } = await supabase
            .from('flight_bookings')
            .select(CANCEL_BOOKING_COLUMNS)
            .eq('id', bookingId)
            .single();

        if (fetchErr || !booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // ── Security: booking must belong to authenticated user ───────
        if (booking.user_id !== sessionUser.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        return await cancelFlightBooking({ supabase, booking, bookingId, preQuotedCancellationId });
    } catch (err) {
        console.error('[cancel-booking] Error:', err);
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Cancellation failed' },
            { status: 500 },
        );
    }
}
