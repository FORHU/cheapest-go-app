import React from 'react';

export default function Loading() {
    return (
        <div className="min-h-screen pt-24 pb-20 px-4 md:px-6 bg-white dark:bg-[#020617]">
            <div className="max-w-7xl mx-auto animate-pulse max-w-[1248px]">
                {/* Breadcrumb Skeleton */}
                <div className="h-4 w-64 bg-slate-200 dark:bg-white/5 rounded mb-6" />

                {/* Gallery Skeleton */}
                <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[400px] rounded-xl overflow-hidden mb-8">
                    <div className="col-span-2 row-span-2 bg-slate-200 dark:bg-white/5" />
                    <div className="col-span-1 row-span-1 bg-slate-200 dark:bg-white/5" />
                    <div className="col-span-1 row-span-1 bg-slate-200 dark:bg-white/5" />
                    <div className="col-span-1 row-span-1 bg-slate-200 dark:bg-white/5" />
                    <div className="col-span-1 row-span-1 bg-slate-200 dark:bg-white/5" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content Skeleton */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Tabs */}
                        <div className="flex gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-6 w-20 bg-slate-200 dark:bg-white/5 rounded" />
                            ))}
                        </div>

                        {/* Title and Rating */}
                        <div className="space-y-4">
                            <div className="h-8 w-3/4 bg-slate-200 dark:bg-white/5 rounded" />
                            <div className="flex gap-2">
                                <div className="h-5 w-24 bg-slate-200 dark:bg-white/5 rounded" />
                                <div className="h-5 w-32 bg-slate-200 dark:bg-white/5 rounded" />
                            </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <div className="h-4 w-full bg-slate-200 dark:bg-white/5 rounded" />
                            <div className="h-4 w-full bg-slate-200 dark:bg-white/5 rounded" />
                            <div className="h-4 w-2/3 bg-slate-200 dark:bg-white/5 rounded" />
                        </div>

                        {/* Rooms List Skeleton */}
                        <div className="space-y-4 pt-8">
                            <div className="h-7 w-48 bg-slate-200 dark:bg-white/5 rounded mb-4" />
                            {[1, 2].map(i => (
                                <div key={i} className="h-48 rounded-xl bg-slate-200 dark:bg-white/5" />
                            ))}
                        </div>
                    </div>

                    {/* Booking Widget Skeleton */}
                    <div className="hidden lg:block">
                        <div className="h-96 rounded-xl bg-slate-200 dark:bg-white/5 sticky top-24" />
                    </div>
                </div>
            </div>
        </div>
    );
}
