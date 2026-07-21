import { getAuthenticatedUser } from '@/lib/server/auth';
import { validateVoucherServer } from '@/lib/server/vouchers';

export const dynamic = 'force-dynamic';

// ── In-memory sliding-window rate limiter ──────────────────────────
// Limits each authenticated user to MAX_ATTEMPTS voucher validations
// within WINDOW_MS. Prevents brute-forcing voucher codes.
const WINDOW_MS = 60_000; // 1 minute
const MAX_ATTEMPTS = 10;  // max 10 attempts per minute per user
const attempts = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = attempts.get(userId) ?? [];
    // Evict entries older than the window
    const recent = timestamps.filter(t => now - t < WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) {
        attempts.set(userId, recent);
        return true;
    }
    recent.push(now);
    attempts.set(userId, recent);
    return false;
}

// Periodic cleanup to prevent memory leaks (every 5 minutes)
if (typeof setInterval !== 'undefined') {
    const timer = setInterval(() => {
        const now = Date.now();
        attempts.forEach((timestamps, userId) => {
            const recent = timestamps.filter((t: number) => now - t < WINDOW_MS);
            if (recent.length === 0) attempts.delete(userId);
            else attempts.set(userId, recent);
        });
    }, 5 * 60_000);
    timer.unref?.();
}

export async function POST(req: Request) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        // Rate limit check
        if (isRateLimited(user.id)) {
            return Response.json(
                { success: false, error: 'Too many attempts. Please wait a minute before trying again.' },
                { status: 429 }
            );
        }

        const body = await req.json();
        const result = await validateVoucherServer({
            code: body.code,
            bookingPrice: body.bookingPrice,
            currency: body.currency,
            hotelId: body.hotelId,
            locationCode: body.locationCode,
            userId: user.id,
        });

        return Response.json({ success: true, data: result });
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
