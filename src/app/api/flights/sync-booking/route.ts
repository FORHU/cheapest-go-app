import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/utils/postgres/admin';
import { checkCsrf } from '@/lib/server/csrf';
import { CANCEL_BOOKING_COLUMNS } from '@/lib/server/flights/cancel-flight-booking';
import { syncDuffelCancellation } from '@/lib/server/flights/sync-duffel-cancellation';

export const maxDuration = 60;

const bodySchema = z.object({ bookingId: z.string().min(1, 'bookingId is required') });

/**
 * Per booking, the last time this instance asked Duffel. Every open card asks when it mounts and a
 * traveller reloads, so without this a handful of tabs is a burst against a rate-limited API.
 * Per-instance on purpose: it bounds the load, and a second instance asking once more is harmless
 * (the reconciliation is idempotent).
 */
const WINDOW_MS = 30_000;
const MAX_TRACKED = 500;
const lastAskedAt = new Map<string, number>();

function recentlyAsked(bookingId: string, now: number): boolean {
    const at = lastAskedAt.get(bookingId);
    return at !== undefined && now - at < WINDOW_MS;
}

function remember(bookingId: string, now: number) {
    if (lastAskedAt.size >= MAX_TRACKED) {
        for (const [id, at] of lastAskedAt) if (now - at >= WINDOW_MS) lastAskedAt.delete(id);
        // Still full of live entries (500 bookings inside 30s): drop the oldest rather than grow.
        if (lastAskedAt.size >= MAX_TRACKED) lastAskedAt.delete(lastAskedAt.keys().next().value as string);
    }
    lastAskedAt.set(bookingId, now);
}

/**
 * POST /api/flights/sync-booking
 *
 * "Look at Duffel for this booking, now." The Trips card calls it for a live Duffel booking so that
 * a cancellation made in Duffel's dashboard shows up without needing the webhook to have arrived.
 * Everything it can do to money is in syncDuffelCancellation, which ends in the same function as
 * the Cancel button and the webhook.
 *
 * Body: { bookingId: string }
 */
export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    try {
        const { getSession } = await import('@/lib/auth/session');
        const { user } = await getSession();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 },
            );
        }
        const { bookingId } = parsed.data;

        const supabase = createAdminClient();
        const { data: booking, error } = await supabase
            .from('flight_bookings')
            .select(CANCEL_BOOKING_COLUMNS)
            .eq('id', bookingId)
            .single();

        if (error || !booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }
        if (booking.user_id !== user.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const now = Date.now();
        if (recentlyAsked(bookingId, now)) {
            return NextResponse.json({ success: true, changed: false, reason: 'throttled' });
        }
        remember(bookingId, now);

        try {
            const outcome = await syncDuffelCancellation({ supabase, booking, bookingId });
            return NextResponse.json({ success: true, ...outcome });
        } catch (err) {
            // Let the next open of the page try again straight away.
            lastAskedAt.delete(bookingId);
            throw err;
        }
    } catch (err) {
        console.error('[sync-booking] Error:', err);
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Sync failed' },
            { status: 500 },
        );
    }
}
