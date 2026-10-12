import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';
import { GolfCourseCard } from './GolfCourseCard';

/**
 * The home page's golf row. Renders nothing when there are no courses, so an empty
 * catalogue leaves no empty heading behind. A swipeable row on phones, a grid from `sm`.
 */
export function GolfCoursesSection({ courses }: { courses: GolfCourse[] }) {
    const t = useTranslations('golf');
    if (courses.length === 0) return null;

    return (
        <section className="golf-theme w-full py-8 md:py-12">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
                <div className="mb-6 flex flex-col gap-2 border-b border-g-rule pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                    <div>
                        <h2 className="font-golf mb-1 text-3xl font-medium tracking-tight text-g-ink md:text-4xl">{t('homeTitle')}</h2>
                        <p className="text-sm text-g-muted md:text-base">{t('homeSubtitle')}</p>
                    </div>
                    <Link href="/golf"
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-g-accent underline-offset-4 transition hover:underline">
                        {t('seeAll')}
                        <ArrowRight size={14} aria-hidden />
                    </Link>
                </div>
                <div className="-mx-4 grid grid-flow-col auto-cols-[75%] gap-5 overflow-x-auto snap-x snap-mandatory px-4 pb-2 scroll-px-4 *:snap-start
                    sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
                    {courses.map(course => <GolfCourseCard key={course.id} course={course} titleAs="h3" />)}
                </div>
            </div>
        </section>
    );
}
