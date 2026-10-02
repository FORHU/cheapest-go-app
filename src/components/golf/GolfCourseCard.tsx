import Image from 'next/image';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';
import { formatGreenFee } from './format';

/**
 * One course card. Works as a server or client component. `titleAs` keeps the outline right:
 * `h2` under the /golf page's `h1`, `h3` under the home section's `h2`.
 */
export function GolfCourseCard({ course, titleAs: Title = 'h2' }: { course: GolfCourse; titleAs?: 'h2' | 'h3' }) {
    const t = useTranslations('golf');
    const locale = useLocale();
    const facts = [t('holes', { holes: course.holes }), course.par ? t('par', { par: course.par }) : null]
        .filter(Boolean)
        .join(' · ');

    return (
        <Link href={`/golf/${course.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-lg dark:border-white/10 dark:bg-slate-900">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-emerald-50 dark:bg-emerald-950/30">
                {course.imageUrls[0] ? (
                    <Image src={course.imageUrls[0]} alt={course.name} fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw"
                        className="object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-emerald-300" aria-hidden />
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
                <Title className="font-semibold text-slate-900 dark:text-slate-100">{course.name}</Title>
                <p className="text-sm text-slate-500 dark:text-slate-400">{course.city}, {course.country}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{facts}</p>
                {course.greenFeeFrom != null && (
                    <p className="mt-auto pt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        {t('greenFeesFrom', { price: formatGreenFee(course.greenFeeFrom, course.currency, locale) })}
                    </p>
                )}
            </div>
        </Link>
    );
}
