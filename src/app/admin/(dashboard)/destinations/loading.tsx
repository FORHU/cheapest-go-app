import React from 'react';
import { Skeleton } from '@/components/ui';

export default function DestinationsLoading() {
    return (
        <div className="pt-12 space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-40 rounded-xl" />
                    <Skeleton className="h-4 w-56 rounded-md" />
                </div>
                <Skeleton className="h-9 w-36 rounded-xl" />
            </div>

            <div className="flex gap-3">
                <Skeleton className="h-9 w-56 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
            </div>

            {/* Card grid (destinations often display as cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                ))}
            </div>

            <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40 rounded-md" />
                <div className="flex gap-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-8 rounded-lg" />)}
                </div>
            </div>
        </div>
    );
}
