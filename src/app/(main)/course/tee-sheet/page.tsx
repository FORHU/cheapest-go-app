import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canStaffCourses } from '@/lib/auth/roles';
import { isIsoDate } from '@/lib/golf/time';
import { listCoursesOf } from '@/lib/server/golf/staff';
import { getTeeSheet } from '@/lib/server/golf/teeSheet';
import { CourseNav } from '../CourseNav';
import { TeeSheetClient } from './TeeSheetClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tee sheet', robots: { index: false, follow: false } };

/** A course runs its own tee sheet: schedules, blocks and extras, with a history of changes. */
export default async function TeeSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { user } = await getSession();
    if (!user) redirect('/login?next=/course/tee-sheet');
    if (!canStaffCourses(user.role)) redirect(user.role === 'admin' ? '/admin/golf' : '/');

    const query = await searchParams;
    const courses = await listCoursesOf(user.id);
    if (courses.length === 0) redirect('/course');

    const asked = typeof query.course === 'string' ? query.course : '';
    const chosen = courses.find(c => c.id === asked) ?? courses[0];
    const date = typeof query.date === 'string' && isIsoDate(query.date) ? query.date : undefined;
    const sheet = await getTeeSheet(chosen.id, date);
    if (!sheet) redirect('/course');

    return (
        <>
            <CourseNav active="tee-sheet" courseId={chosen.id} />
            <TeeSheetClient sheet={sheet} courses={courses.map(c => ({ id: c.id, name: c.name }))} />
        </>
    );
}
