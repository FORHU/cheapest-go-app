import React from 'react';
import { Skeleton, SkeletonText, SkeletonImage } from './Skeleton';

export interface PropertyCardSkeletonProps {
    /** Card variant */
    variant?: 'vertical' | 'horizontal';
    /** Additional CSS classes */
    className?: string;
}

/**
 * PropertyCard loading skeleton
 *
 * @example
 * // Vertical card skeleton (default)
 * <PropertyCardSkeleton />
 *
 * // Horizontal card skeleton
 * <PropertyCardSkeleton variant="horizontal" />
 *
 * // Multiple skeletons for loading list
 * {Array.from({ length: 6 }).map((_, i) => (
 *   <PropertyCardSkeleton key={i} />
 * ))}
 */
export const PropertyCardSkeleton: React.FC<PropertyCardSkeletonProps> = ({
    variant = 'vertical',
    className = '',
}) => {
    if (variant === 'horizontal') {
        return (
            <div
                className={`flex bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 ${className}`}
            >
                {/* Image */}
                <div className="w-1/3 min-w-[200px]">
                    <SkeletonImage height="100%" aspectRatio="4/3" className="rounded-none" />
                </div>

                {/* Content */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                        {/* Location */}
                        <Skeleton width={120} height={14} className="mb-2" />
                        {/* Title */}
                        <Skeleton width="80%" height={24} className="mb-3" />
                        {/* Description */}
                        <SkeletonText lines={2} className="mb-4" />
                        {/* Amenities */}
                        <div className="flex gap-2">
                            <Skeleton width={80} height={24} rounded="full" />
                            <Skeleton width={90} height={24} rounded="full" />
                            <Skeleton width={70} height={24} rounded="full" />
                        </div>
                    </div>

                    {/* Bottom: Rating & Price */}
                    <div className="flex justify-between items-end mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <div className="flex items-center gap-2">
                            <Skeleton width={40} height={28} rounded="md" />
                            <Skeleton width={80} height={16} />
                        </div>
                        <div className="text-right">
                            <Skeleton width={100} height={28} className="mb-1" />
                            <Skeleton width={60} height={14} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Vertical variant (default)
    return (
        <div
            className={`bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 ${className}`}
        >
            {/* Image */}
            <SkeletonImage aspectRatio="16/10" className="rounded-none" />

            {/* Content */}
            <div className="p-4">
                {/* Location */}
                <Skeleton width={100} height={14} className="mb-2" />
                {/* Title */}
                <Skeleton width="90%" height={22} className="mb-3" />
                {/* Amenities */}
                <div className="flex gap-2 mb-4">
                    <Skeleton width={70} height={22} rounded="full" />
                    <Skeleton width={80} height={22} rounded="full" />
                    <Skeleton width={60} height={22} rounded="full" />
                </div>

                {/* Rating & Price */}
                <div className="flex justify-between items-end pt-3 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <Skeleton width={36} height={24} rounded="md" />
                        <Skeleton width={70} height={14} />
                    </div>
                    <div className="text-right">
                        <Skeleton width={90} height={24} className="mb-1" />
                        <Skeleton width={50} height={12} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyCardSkeleton;
