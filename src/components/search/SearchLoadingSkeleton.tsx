import React from 'react';
import { Header, Footer } from '@/components/landing';

export const SearchLoadingSkeleton = () => {
    return (
        <>
            <Header />
            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Back to Home Skeleton */}
                    <div className="mb-4 h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />

                    {/* Search Bar Skeleton */}
                    <div className="mb-8 relative z-50">
                        <div className="h-20 w-full bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
                    </div>
                </div>

                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                    {/* Filters Skeleton */}
                    <div className="hidden lg:block w-64 flex-shrink-0 space-y-6">
                        <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        <div className="h-64 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        <div className="h-40 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                    </div>

                    {/* Results Skeleton */}
                    <div className="flex-1 min-w-0">
                        {/* Results Header Skeleton */}
                        <div className="flex justify-between items-center mb-6">
                            <div className="space-y-2">
                                <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                                <div className="h-4 w-64 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                            </div>
                            <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse" />
                        </div>

                        {/* Property Card Skeletons */}
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-[200px]">
                                    {/* Image Skeleton */}
                                    <div className="md:w-[320px] h-[200px] bg-slate-200 dark:bg-slate-800 animate-pulse" />

                                    {/* Content Skeleton */}
                                    <div className="flex-1 p-5 flex flex-col justify-between">
                                        <div className="space-y-3">
                                            <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                                            <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                                            <div className="h-12 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse mt-2" />
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                                            <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
};
