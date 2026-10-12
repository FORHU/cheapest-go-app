import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
    confirmBooking, declineBooking, getBookingById, listBookingsForCourses, type AdminBookingView,
} from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';
import { isCourseAuthError, requireCourseStaff, toCourseBookingView } from '@/lib/server/golf/courseAccess';

export const dynamic = 'force-dynamic';

/**
 * A course's side of its own Golf Bookings: the queue, and confirm or decline. Cancelling a
 * confirmed booking moves money out and stays with the team (admin/golf-bookings).
 */

const VIEWS: readonly AdminBookingView[] = ['waiting', 'upcoming', 'past'];
const idSchema = z.string().uuid();

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'course-golf-bookings' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    const asked = new URL(req.url).searchParams.get('view') as AdminBookingView | null;
    const view = asked && VIEWS.includes(asked) ? asked : 'waiting';
    const bookings = await listBookingsForCourses(actor.courseIds, view);
    return NextResponse.json({ success: true, data: bookings.map(toCourseBookingView) });
}

export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'course-golf-bookings-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const { action } = body;
    if (action !== 'confirm' && action !== 'decline') return fail(400, `Unknown action: ${String(action)}`);
    const id = idSchema.safeParse(body.id);
    if (!id.success) return fail(400, 'id is required');

    // A booking of another course reads as missing: the route must not confirm that it exists.
    const existing = await getBookingById(id.data);
    if (!existing || !actor.courseIds.includes(existing.courseId)) return fail(404, 'Booking not found');

    try {
        const booking = action === 'confirm'
            ? await confirmBooking(id.data)
            : await declineBooking(id.data, 'declined_by_team');
        logAdminAction({
            action: `course_${action}_golf_booking`, adminId: actor.id, adminEmail: actor.email,
            targetId: id.data, details: { reference: booking.reference, courseId: booking.courseId },
        });
        return NextResponse.json({ success: true, data: toCourseBookingView(booking) });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message);
        // Stripe refused: a capture fails if the authorisation lapsed. Nothing was changed.
        console.error(`[golf] Course ${action} failed for`, id.data, err);
        return fail(502, 'We could not take the payment for this booking. Ask the team to look at it.');
    }
}
