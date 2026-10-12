import Image from 'next/image';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';
import { formatGreenFee } from './format';

/**
 * One course card. Works as a server or client component. `titleAs` keeps the outline right:
 * `h2` under the /golf page's `h1`, `h3` under the home section's `h2`. No box: the photograph
 * and a hairline carry the card, so a grid of them reads as a page, not a wall of panels.
 */
export function GolfCourseCard({ course, titleAs: Title = 'h2' }: { course: GolfCourse; titleAs?: 'h2' | 'h3' }) {
    const t = useTranslations('golf');
    const locale = useLocale();
    const facts = [t('holes', { holes: course.holes }), course.par ? t('par', { par: course.par }) : null]
        .filter(Boolean)
        .join(' · ');

    return (
        <Link href={`/golf/${course.slug}`} className="golf-theme group flex flex-col text-g-ink">
            <div className="relative aspect-[5/4] w-full overflow-hidden rounded-sm bg-g-sunk">
                {course.imageUrls[0] ? (
                    <Image src={course.imageUrls[0]} alt={course.name} fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw"
                        className="object-cover transition duration-500 ease-out motion-safe:group-hover:scale-[1.03]" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-g-muted/60" aria-hidden />
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1 pt-3">
                <Title className="font-golf text-2xl font-bold leading-tight tracking-tight underline-offset-4 decoration-g-accent/50 group-hover:underline">
                    {course.name}
                </Title>
                <p className="text-sm text-g-muted">{course.city}, {course.country}</p>
                <p className="text-sm text-g-muted tabular-nums">{facts}</p>
                {course.greenFeeFrom != null && (
                    <p className="mt-auto border-t border-g-rule pt-2 text-sm font-medium tabular-nums text-g-accent">
                        {t('greenFeesFrom', { price: formatGreenFee(course.greenFeeFrom, course.currency, locale) })}
                    </p>
                )}
            </div>
        </Link>
    );
}
