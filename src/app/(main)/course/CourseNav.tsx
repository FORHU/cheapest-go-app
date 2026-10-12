import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** The portal's two views. Plain links, so it works from a server page. */
export function CourseNav({ active, courseId }: { active: 'requests' | 'tee-sheet'; courseId?: string }) {
    const t = useTranslations('golf.staff.sheet');
    const tab = (on: boolean) =>
        `-mb-px border-b-2 pb-2 text-sm transition-colors ${on
            ? 'border-g-accent font-semibold text-g-ink'
            : 'border-transparent text-g-muted hover:text-g-ink'}`;
    return (
        <nav aria-label={t('navLabel')} className="mx-auto flex max-w-4xl gap-6 border-b border-g-rule px-4 pt-6">
            <Link href="/course" className={tab(active === 'requests')} aria-current={active === 'requests' ? 'page' : undefined}>
                {t('navRequests')}
            </Link>
            <Link href={courseId ? `/course/tee-sheet?course=${courseId}` : '/course/tee-sheet'}
                className={tab(active === 'tee-sheet')} aria-current={active === 'tee-sheet' ? 'page' : undefined}>
                {t('navTeeSheet')}
            </Link>
        </nav>
    );
}
