"use client";

import { getRatingColor, getRatingLabel } from '@/lib/property/fetchReviews';

interface ReviewsSummaryProps {
    averageRating: number;
    totalCount: number;
}

export default function ReviewsSummary({ averageRating, totalCount }: ReviewsSummaryProps) {
    if (totalCount === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>No reviews yet</span>
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
                    {getRatingLabel(averageRating)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {totalCount} verified review{totalCount !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
}
