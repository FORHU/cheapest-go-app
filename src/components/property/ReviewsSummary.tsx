"use client";

import { getRatingColor, getRatingLabel } from '@/lib/property/reviewsUtils';
import { useTranslations } from 'next-intl';

interface ReviewsSummaryProps {
    averageRating: number;
    totalCount: number;
}

export default function ReviewsSummary({ averageRating: rawRating, totalCount }: ReviewsSummaryProps) {
    const t = useTranslations('propertyOverview');
    const averageRating = Number(rawRating) || 0;
    if (totalCount === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>{t('noReviewsYet')}</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3">
            {/* Rating badge */}
            <div className={`${getRatingColor(averageRating)} text-white px-2.5 py-1 rounded-lg font-bold text-sm`}>
                {averageRating.toFixed(1)}
            </div>

            {/* Rating info */}
            <div className="flex flex-col">
                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    {t(`hotels.ratings.${getRatingLabel(averageRating)}`)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('verifiedReviewCount', { count: totalCount })}
                </span>
            </div>
        </div>
    );
}
