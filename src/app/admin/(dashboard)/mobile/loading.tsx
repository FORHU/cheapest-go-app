import React from 'react';
import { Skeleton } from '@/components/ui';

export default function MobileLoading() {
    return (
        <div className="pt-12 space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-36 rounded-xl" />
                    <Skeleton className="h-4 w-52 rounded-md" />
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
            </div>

            {/* Config panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <Skeleton className="h-5 w-32 rounded-md" />
                    <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-5 w-28 rounded-md" />
                    <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
            </div>

            {/* Bookings table */}
            <section className="space-y-4">
                <Skeleton className="h-5 w-40 rounded-md" />
                <div className="flex gap-3">
                    <Skeleton className="h-9 w-56 rounded-lg" />
                    <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                </div>
            </section>
        </div>
    );
}
