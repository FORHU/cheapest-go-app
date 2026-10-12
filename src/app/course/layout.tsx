import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { canStaffCourses } from '@/lib/auth/roles';
import { listCoursesOf } from '@/lib/server/golf/staff';
import { listBookingsForCourses } from '@/lib/server/golf/bookings';
import { CourseShell } from './CourseShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Course portal | CheapestGo',
    robots: { index: false, follow: false },
};

/**
 * The course portal, in the admin's chrome.
 *
 * A sibling of `(main)` rather than a page inside it, so it gets the staff frame instead of the
 * storefront's header and footer. Invitation acceptance (`/course/join`) deliberately stays in
 * `(main)`: the person opening an invitation is not course staff yet, and may not be signed in.
 *
 * The role check is repeated here rather than inherited, as the Support Desk's is: "it is under
 * /course" proves nothing, and each route re-checks its own scope.
 */
export default async function CourseLayout({ children }: { children: React.ReactNode }) {
    const { user } = await getSession();

    if (!user) redirect('/login?next=/course');
    if (!canStaffCourses(user.role)) redirect(user.role === 'admin' ? '/admin/golf' : '/');

    const courses = await listCoursesOf(user.id);
    // The badge counts what is waiting for this person's courses; a failed lookup must not
    // take the whole portal down with it.
    const waiting = courses.length > 0
        ? (await listBookingsForCourses(courses.map(c => c.id), 'waiting').catch(() => [])).length
        : 0;

    const profile = {
        role: user.role,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatar: user.avatarUrl,
    };

    return <CourseShell profile={profile} waiting={waiting}>{children}</CourseShell>;
}
