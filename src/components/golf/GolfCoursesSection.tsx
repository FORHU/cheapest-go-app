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
        <section className="w-full py-8 md:py-12">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1">{t('homeTitle')}</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base">{t('homeSubtitle')}</p>
                    </div>
                    <Link href="/golf"
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        {t('seeAll')}
                        <ArrowRight size={14} aria-hidden />
                    </Link>
                </div>
                <div className="-mx-4 grid grid-flow-col auto-cols-[75%] gap-4 overflow-x-auto snap-x snap-mandatory px-4 pb-2 scroll-px-4 *:snap-start
                    sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
                    {courses.map(course => <GolfCourseCard key={course.id} course={course} titleAs="h3" />)}
                </div>
            </div>
        </section>
    );
}
