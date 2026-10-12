import { useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';

/**
 * The same facts in the same order on every course, so two courses can be compared at a glance.
 * A fact the course has not given is left out, never shown as a dash.
 */
export function GolfFactBlock({ course }: { course: Pick<GolfCourse, 'holes' | 'par' | 'yardage' | 'yearOpened' | 'designer' | 'grass'> }) {
    const t = useTranslations('golf.facts');
    const facts: [string, string][] = [
        [t('holes'), String(course.holes)],
        ...(course.par != null ? [[t('par'), String(course.par)] as [string, string]] : []),
        ...(course.yardage != null ? [[t('yardage'), t('yards', { yards: course.yardage })] as [string, string]] : []),
        ...(course.yearOpened != null ? [[t('opened'), String(course.yearOpened)] as [string, string]] : []),
        ...(course.designer ? [[t('designer'), course.designer] as [string, string]] : []),
        ...(course.grass ? [[t('grass'), course.grass] as [string, string]] : []),
    ];

    return (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {facts.map(([label, value]) => (
                <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
