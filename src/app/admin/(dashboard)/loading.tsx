import React from 'react';
import { Skeleton } from '@/components/ui';

export default function AdminLoading() {
    return (
        <div className="pt-12 space-y-12 pb-20 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-64 rounded-xl" />
                    <Skeleton className="h-4 w-48 rounded-md" />
                </div>
                <Skeleton className="h-12 w-48 rounded-xl" />
            </div>

            {/* Overview Section Skeleton */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32 rounded-md" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
            </section>

            {/* Financial Metrics Section Skeleton */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40 rounded-md" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                </div>
            </section>

            {/* Charts/Performance Section Skeleton */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-48 rounded-md" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-6">
                    <div className="lg:col-span-2">
                        <Skeleton className="h-[400px] w-full rounded-2xl" />
                    </div>
                    <div className="lg:col-span-1">
                        <Skeleton className="h-[400px] w-full rounded-2xl" />
                    </div>
                </div>
            </section>

            {/* Market Insights Section Skeleton */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40 rounded-md" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
                    <Skeleton className="h-[500px] w-full rounded-2xl" />
                    <Skeleton className="h-[500px] w-full rounded-2xl" />
                </div>
            </section>

            {/* Activity Section Skeleton */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-36 rounded-md" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
                <Skeleton className="h-[600px] w-full rounded-2xl" />
            </section>
        </div>
    );
}
