import React from 'react';
import { Skeleton } from '@/components/ui';

export default function DuffelLoading() {
    return (
        <div className="pt-12 space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-40 rounded-xl" />
                    <Skeleton className="h-4 w-56 rounded-md" />
                </div>
                <Skeleton className="h-9 w-28 rounded-xl" />
            </div>

            {/* Status + config cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-36 w-full rounded-2xl" />
                ))}
            </div>

            {/* Detail panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-64 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        </div>
    );
}
