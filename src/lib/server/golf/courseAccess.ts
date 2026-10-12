import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { canStaffCourses } from '@/lib/auth/roles';
import type { GolfBooking } from '@/lib/schemas/golf';
import type { CourseBookingView } from '@/lib/schemas/golfStaff';
import { listCoursesOf } from './staff';

/**
 * The gate on every `/api/course/*` route, and the single place course staff are admitted.
 *
 * Like the Support Desk's `requireAgent`, nothing else in the back office asks for this role:
 * `requireAdmin` refuses it because it is not `admin`, so access is granted here by name and
 * never by satisfying a check written for someone else. The courses come from
 * \`golf_course_staff\`, read on every request: a revoked person loses access at once, not at
 * the next sign-in.
 */

export interface CourseStaffActor {
    id: string;
    email: string;
    courseIds: string[];
}

export async function requireCourseStaff(): Promise<CourseStaffActor | NextResponse> {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canStaffCourses(user.role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const courses = await listCoursesOf(user.id);
    // Course staff with no course left have nothing to act on.
    if (courses.length === 0) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    return { id: user.id, email: user.email, courseIds: courses.map(c => c.id) };
}

export function isCourseAuthError(result: CourseStaffActor | NextResponse): result is NextResponse {
    return result instanceof NextResponse;
}

/**
 * What a course sees of a booking: who is playing, when and what they asked for. Not the
 * customer's email or card, and not our fee: the course needs to recognise the booking, not to
 * contact the customer around us.
 */
export function toCourseBookingView(b: GolfBooking): CourseBookingView {
    return {
        id: b.id,
        reference: b.reference,
        status: b.status,
        courseId: b.courseId,
        courseName: b.courseName,
        timezone: b.timezone,
        startsAt: b.startsAt,
        players: b.players,
        leadName: b.leadName,
        extras: b.extras.map(e => ({ code: e.code, quantity: e.quantity })),
        greenFeeTotal: b.greenFeeTotal,
        currency: b.currency,
        decideBy: b.decideBy,
        requestedAt: b.requestedAt,
    };
}
