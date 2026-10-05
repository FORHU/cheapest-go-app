import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
    cancelByTeam, confirmBooking, declineBooking, listBookingsForAdmin, type AdminBookingView,
} from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/** The team's side of a Golf Booking: confirm (capture), decline (release), cancel (refund). */

const VIEWS: readonly AdminBookingView[] = ['waiting', 'upcoming', 'past'];
const idSchema = z.string().uuid();

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-bookings' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const asked = new URL(req.url).searchParams.get('view') as AdminBookingView | null;
    const view = asked && VIEWS.includes(asked) ? asked : 'waiting';
    return NextResponse.json({ success: true, data: await listBookingsForAdmin(view) });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-golf-bookings-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const { action } = body;
    if (action !== 'confirm' && action !== 'decline' && action !== 'cancel') return fail(400, `Unknown action: ${String(action)}`);
    const id = idSchema.safeParse(body.id);
    if (!id.success) return fail(400, 'id is required');

    try {
        const booking = action === 'confirm'
            ? await confirmBooking(id.data)
            : action === 'decline'
                ? await declineBooking(id.data, 'declined_by_team')
                : await cancelByTeam(id.data);
        logAdminAction({
            action: `${action}_golf_booking`, adminId: auth.user.id, adminEmail: auth.user.email,
            targetId: id.data, details: { reference: booking.reference },
        });
        return NextResponse.json({ success: true, data: booking });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message);
        // Stripe refused — a capture fails if the authorisation lapsed. Nothing was changed.
        console.error(`[golf] Admin ${action} failed for`, id.data, err);
        return fail(502, `Stripe: ${err instanceof Error ? err.message : 'payment provider error'}`);
    }
}
