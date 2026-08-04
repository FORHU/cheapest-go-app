import React from 'react';

export interface HotelCardSkeletonProps {
    /**
     * `row`     — matches MapPropertyCard's desktop layout (sidebar list).
     * `compact` — matches MapPropertyCard's mobile layout (swiper card).
     */
    variant?: 'row' | 'compact';
    /** Width of the name bar. Vary it across a list so rows don't look stamped. */
    nameWidth?: string;
}

/**
 * Placeholder rows are deliberately plain divs rather than <Skeleton> elements:
 * the parent owns a single `animate-pulse` so every bar in the list breathes in
 * sync, instead of each element running its own animation.
 */

/** Name-bar widths to cycle through. Index-keyed, never random — random widths
 *  would differ between server and client render and trip hydration. */
export const SKELETON_NAME_WIDTHS = ['82%', '64%', '91%', '73%', '58%'] as const;

/**
 * Hotel card loading skeleton.
 *
 * Mirrors MapPropertyCard's geometry — same paddings, thumbnail size, and
 * detail-column rhythm — so real results replace placeholders without the
 * list reflowing.
 *
 * @example
 * // A page of sidebar rows
 * {Array.from({ length: 15 }).map((_, i) => (
 *   <HotelCardSkeleton key={i} nameWidth={SKELETON_NAME_WIDTHS[i % SKELETON_NAME_WIDTHS.length]} />
 * ))}
 */
export const HotelCardSkeleton: React.FC<HotelCardSkeletonProps> = ({
    variant = 'row',
    nameWidth = '82%',
}) => {
    if (variant === 'compact') {
        return (
            <div className="p-2.5">
                <div className="flex flex-row gap-2">
                    {/* Thumbnail */}
                    <div className="w-[76px] h-[76px] shrink-0 rounded-xl bg-slate-200 dark:bg-slate-700" />

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                            {/* Name */}
                            <div className="h-3 rounded bg-slate-200 dark:bg-slate-700" style={{ width: nameWidth }} />
                            {/* Address */}
                            <div className="h-2 mt-1 rounded bg-slate-100 dark:bg-slate-800 w-2/3" />
                        </div>

                        {/* Stars */}
                        <div className="flex gap-px mt-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="w-2.5 h-2.5 rounded-[2px] bg-slate-200 dark:bg-slate-700" />
                            ))}
                        </div>

                        {/* Price + View Deal */}
                        <div className="flex items-center justify-between mt-1 gap-1">
                            <div className="h-3.5 w-14 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-6 w-16 rounded-lg bg-slate-200 dark:bg-slate-700" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Row variant (default)
    return (
        <div className="px-4 py-2.5 lg:px-6 lg:py-3">
            <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="w-20 h-16 lg:w-24 lg:h-20 shrink-0 rounded-xl bg-slate-200 dark:bg-slate-700" />

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start gap-1.5">
                        {/* Index badge */}
                        <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700" />
                        <div className="min-w-0 flex-1">
                            {/* Name */}
                            <div className="h-3.5 rounded bg-slate-200 dark:bg-slate-700" style={{ width: nameWidth }} />
                            {/* Address */}
                            <div className="h-2.5 mt-1.5 rounded bg-slate-100 dark:bg-slate-800 w-1/2" />
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-1.5">
                        {/* Stars + review line */}
                        <div className="flex flex-col gap-1">
                            <div className="flex gap-px">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="w-3 h-3 rounded-[2px] bg-slate-200 dark:bg-slate-700" />
                                ))}
                            </div>
                            <div className="h-2.5 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                        </div>
                        {/* Price */}
                        <div className="flex flex-col items-end gap-1">
                            <div className="h-3.5 w-16 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-2.5 w-10 rounded bg-slate-100 dark:bg-slate-800" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HotelCardSkeleton;
