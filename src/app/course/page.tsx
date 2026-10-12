import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canStaffCourses } from '@/lib/auth/roles';
import { listCoursesOf } from '@/lib/server/golf/staff';
import { listBookingsForCourses } from '@/lib/server/golf/bookings';
import { toCourseBookingView } from '@/lib/server/golf/courseAccess';
import { CourseQueueClient } from './CourseQueueClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Requests | Course portal', robots: { index: false, follow: false } };

/** What a course sees: its own tee-time requests, with Confirm and Decline. */
export default async function CoursePortalPage() {
    const { user } = await getSession();
    if (!user) redirect('/login?next=/course');
    // An admin works from the back office, which already reaches every course.
    if (!canStaffCourses(user.role)) redirect(user.role === 'admin' ? '/admin/golf' : '/');

    const courses = await listCoursesOf(user.id);
    const ids = courses.map(c => c.id);
    const [waiting, upcoming, past] = await Promise.all([
        listBookingsForCourses(ids, 'waiting'),
        listBookingsForCourses(ids, 'upcoming'),
        listBookingsForCourses(ids, 'past'),
    ]);

    return (
        <CourseQueueClient
            courses={courses}
            waiting={waiting.map(toCourseBookingView)}
            upcoming={upcoming.map(toCourseBookingView)}
            past={past.map(toCourseBookingView)}
        />
    );
}
