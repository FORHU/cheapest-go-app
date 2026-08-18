import React from 'react';
import { Skeleton } from '@/components/ui';

export default function ReviewsLoading() {
    return (
        <div className="pt-12 space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-32 rounded-xl" />
                    <Skeleton className="h-4 w-48 rounded-md" />
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
            </div>

            <div className="flex gap-3">
                <Skeleton className="h-9 w-56 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
            </div>

            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
