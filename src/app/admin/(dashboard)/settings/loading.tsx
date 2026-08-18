import React from 'react';
import { Skeleton } from '@/components/ui';

export default function SettingsLoading() {
    return (
        <div className="pt-12 space-y-8 pb-20 animate-in fade-in duration-500">
            <div className="space-y-2">
                <Skeleton className="h-9 w-32 rounded-xl" />
                <Skeleton className="h-4 w-56 rounded-md" />
            </div>

            {/* Settings sections */}
            {[1, 2, 3].map((section) => (
                <section key={section} className="space-y-4">
                    <div className="space-y-1">
                        <Skeleton className="h-5 w-40 rounded-md" />
                        <Skeleton className="h-4 w-64 rounded-md" />
                    </div>
                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 space-y-5">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-36 rounded-md" />
                                    <Skeleton className="h-3 w-52 rounded-md" />
                                </div>
                                <Skeleton className="h-9 w-32 rounded-lg" />
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            <div className="flex justify-end">
                <Skeleton className="h-10 w-28 rounded-xl" />
            </div>
        </div>
    );
}
