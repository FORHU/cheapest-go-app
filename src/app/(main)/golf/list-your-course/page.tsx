import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth/session';
import { listPublishedCourses } from '@/lib/server/golf/courses';
import { latestRequestOf } from '@/lib/server/golf/courseRequests';
import { CourseRequestForm } from './CourseRequestForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('golf.staff.request');
    return { title: t('title'), description: t('intro') };
}

/** A signed-in customer asks to list or claim a course; an admin decides (admin/golf/requests). */
export default async function ListYourCoursePage() {
    const { user } = await getSession();
    if (!user) redirect('/login?next=/golf/list-your-course');
    const t = await getTranslations('golf.staff.request');

    const shell = (children: React.ReactNode) => (
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-12 md:pt-16">
            <h1 className="font-golf text-5xl font-extrabold leading-[1.02] tracking-tight text-balance text-g-ink md:text-6xl">
                {t('title')}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-g-muted">{t('intro')}</p>
            <div className="mt-10">{children}</div>
        </div>
    );

    if (user.role !== 'user' && user.role !== 'course_staff') {
        return shell(<p className="text-g-muted">{t('staffAccount')}</p>);
    }

    const [courses, latest] = await Promise.all([listPublishedCourses(), latestRequestOf(user.id)]);

    if (latest?.status === 'pending') {
        return shell(
            <div className="border-l-2 border-g-accent bg-g-sunk px-4 py-4">
                <p className="font-medium text-g-ink">{t('pendingTitle', { course: latest.courseName })}</p>
                <p className="mt-1 text-sm text-g-muted">{t('pendingBody', { email: latest.contactEmail })}</p>
            </div>,
        );
    }

    return shell(
        <>
            {latest?.status === 'rejected' && (
                <div className="mb-8 border-l-2 border-g-rule bg-g-sunk px-4 py-4">
                    <p className="font-medium text-g-ink">{t('rejectedTitle', { course: latest.courseName })}</p>
                    {latest.decisionNote && <p className="mt-1 text-sm text-g-muted">{latest.decisionNote}</p>}
                    <p className="mt-1 text-sm text-g-muted">{t('rejectedHint')}</p>
                </div>
            )}
            <CourseRequestForm
                defaultName={[user.firstName, user.lastName].filter(Boolean).join(' ')}
                email={user.email}
                courses={courses.map(c => ({ id: c.id, name: c.name, city: c.city, country: c.country }))}
            />
        </>,
    );
}
