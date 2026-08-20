import React from 'react';
import { Skeleton } from '@/components/ui';

export default function SuppliersLoading() {
    return (
        <div className="pt-12 space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-32 rounded-xl" />
                    <Skeleton className="h-4 w-48 rounded-md" />
                </div>
                <Skeleton className="h-9 w-32 rounded-xl" />
            </div>

            {/* Supplier cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                ))}
            </div>

            {/* Table */}
            <section className="space-y-4">
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
