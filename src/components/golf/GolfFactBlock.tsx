import { useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';

/**
 * The same facts in the same order on every course, so two courses can be compared at a glance.
 * A fact the course has not given is left out, never shown as a dash. Laid out like a scorecard
 * header: hairline cells, figures in the serif.
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
        <dl className="golf-theme grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-px border border-g-rule bg-g-rule">
            {facts.map(([label, value]) => (
                <div key={label} className="bg-g-surface px-4 py-3">
                    <dt className="text-xs text-g-muted">{label}</dt>
                    <dd className="font-golf mt-0.5 text-2xl font-bold leading-tight tabular-nums text-g-ink">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
