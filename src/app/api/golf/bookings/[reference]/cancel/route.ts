import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { isBookingReference } from '@/lib/bookingReference';
import { cancelByCustomer } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** The customer cancels their own tee time. Ownership is checked in the module (ADR-0027). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user } = await getAuthenticatedUser();
    if (!user) return fail(401, 'Please log in.');

    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'golf-cancel', userId: user.id });
    if (!rl.success) return fail(429, 'Too many requests. Please wait a moment and try again.');

    const { reference } = await params;
    if (!isBookingReference(reference)) return fail(404, 'Booking not found');

    try {
        const booking = await cancelByCustomer(reference, user.id);
        return NextResponse.json({ success: true, data: { status: booking.status, refundAmount: booking.refundAmount } });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message, { code: err.code });
        console.error('[golf] Cancellation failed for', reference, err);
        return fail(502, "We couldn't cancel this booking right now. Please try again or contact us.");
    }
}
