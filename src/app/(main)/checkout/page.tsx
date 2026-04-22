import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutContent } from '@/components/checkout';

export const metadata: Metadata = {
  title: 'Checkout | CheapestGo',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen pt-6 pb-16 px-4 md:px-6">
                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
                    {/* Left column */}
                    <div className="space-y-6">
                        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
                            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            <div className="grid grid-cols-2 gap-4">
                                {[1,2,3,4].map(i => (
                                    <div key={i} className="h-11 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
                            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                        </div>
                    </div>
                    {/* Right column — order summary */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 h-fit">
                        <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                        {[1,2,3].map(i => (
                            <div key={i} className="flex justify-between">
                                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            </div>
                        ))}
                        <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse mt-2" />
                    </div>
                </div>
            </div>
        }>
            <CheckoutContent />
        </Suspense>
    );
}
