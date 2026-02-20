import React from 'react';
import { Skeleton, SkeletonImage } from './Skeleton';

export interface RoomCardSkeletonProps {
    /** Additional CSS classes */
    className?: string;
}

/**
 * RoomCard loading skeleton
 * Matches the wide horizontal layout of RoomCard
 *
 * @example
 * <RoomCardSkeleton />
 *
 * // Multiple skeletons for loading room list
 * {Array.from({ length: 3 }).map((_, i) => (
 *   <RoomCardSkeleton key={i} />
 * ))}
 */
export const RoomCardSkeleton: React.FC<RoomCardSkeletonProps> = ({
    className = '',
}) => {
    return (
        <div
            className={`border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 overflow-hidden ${className}`}
        >
            {/* Header: Title */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
                <Skeleton width="60%" height={24} />
            </div>

            <div className="flex flex-col md:flex-row">
                {/* Left: Image */}
                <div className="w-full md:w-1/3 md:max-w-[300px] h-48 md:h-auto">
                    <SkeletonImage
                        width="100%"
                        height="100%"
                        aspectRatio="16/9"
                        className="rounded-none h-full"
                    />
                </div>

                {/* Middle: Info & Conditions */}
                <div className="flex-1 p-4 border-r border-slate-100 dark:border-white/5">
                    <div>
                        <Skeleton width={80} height={16} className="mb-3" />

                        <div className="space-y-2 mb-4">
                            <Skeleton width={140} height={14} />
                            <Skeleton width={120} height={14} />
                        </div>
                    </div>

                    {/* Room Details */}
                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-white/5">
                        <Skeleton width={90} height={14} className="mb-3" />
                        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
                            <Skeleton width={60} height={14} />
                            <Skeleton width={70} height={14} />
                            <Skeleton width={80} height={14} />
                        </div>

                        <Skeleton width={70} height={14} className="mb-2" />
                        <div className="space-y-2">
                            <Skeleton width={100} height={12} />
                            <Skeleton width={90} height={12} />
                            <Skeleton width={110} height={12} />
                        </div>
                    </div>

                    <Skeleton width={90} height={14} className="mt-3" />
                </div>

                {/* Right: Pricing & Action */}
                <div className="w-full md:w-1/4 p-4 flex flex-col justify-between items-end bg-slate-50/50 dark:bg-white/5 min-w-[200px]">
                    <div className="text-right w-full">
                        <Skeleton width={50} height={18} className="ml-auto mb-2" />
                        <Skeleton width={120} height={28} className="ml-auto mb-1" />
                        <Skeleton width={80} height={16} className="ml-auto mb-2" />
                        <Skeleton width={140} height={12} className="ml-auto" />
                    </div>

                    <Skeleton width="100%" height={44} rounded="lg" className="mt-4" />
                </div>
            </div>
        </div>
    );
};

export default RoomCardSkeleton;
