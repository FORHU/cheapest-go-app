import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canStaffCourses } from '@/lib/auth/roles';
import { listCoursesOf } from '@/lib/server/golf/staff';
import { getCourseById } from '@/lib/server/golf/courses';
import { listChanges } from '@/lib/server/golf/changes';
import { photosConfigured } from '@/lib/server/golf/photos';
import { ProfileClient } from './ProfileClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Course profile | Course portal', robots: { index: false, follow: false } };

/** A course edits how it is described and what it promises customers (ADR-0050). */
export default async function CourseProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { user } = await getSession();
    if (!user) redirect('/login?next=/course/profile');
    if (!canStaffCourses(user.role)) redirect(user.role === 'admin' ? '/admin/golf' : '/');

    const query = await searchParams;
    const courses = await listCoursesOf(user.id);
    if (courses.length === 0) redirect('/course');

    const asked = typeof query.course === 'string' ? query.course : '';
    const chosen = courses.find(c => c.id === asked) ?? courses[0];
    const course = await getCourseById(chosen.id);
    if (!course) redirect('/course');

    const changes = (await listChanges(course.id, 60)).filter(c => c.kind === 'profile_updated').slice(0, 15);

    return (
        <ProfileClient
            // A different course is a different form, not the same form with other values.
            key={course.id}
            course={course}
            changes={changes}
            courses={courses.map(c => ({ id: c.id, name: c.name }))}
            canUpload={photosConfigured()}
        />
    );
}
