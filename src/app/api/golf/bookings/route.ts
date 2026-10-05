import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { holdRequestSchema } from '@/lib/schemas/golf';
import { holdTeeTime } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** Starts a tee-time checkout: holds the spots and returns the PaymentIntent to authorise. */
export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user } = await getAuthenticatedUser();
    if (!user) return fail(401, 'Please log in to book a tee time.');

    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'golf-hold', userId: user.id });
    if (!rl.success) return fail(429, 'Too many requests. Please wait a moment and try again.');

    const parsed = holdRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }

    try {
        const { booking, clientSecret } = await holdTeeTime({ userId: user.id, email: user.email, ...parsed.data });
        return NextResponse.json({
            success: true,
            data: {
                reference: booking.reference,
                clientSecret,
                holdExpiresAt: booking.holdExpiresAt,
                greenFeeTotal: booking.greenFeeTotal,
                serviceFee: booking.serviceFee,
                total: booking.total,
                currency: booking.currency,
            },
        }, { status: 201 });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message, { code: err.code, ...err.detail });
        throw err;
    }
}
