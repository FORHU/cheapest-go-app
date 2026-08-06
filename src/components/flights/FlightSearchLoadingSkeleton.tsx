/**
 * Route-level loading UI for /flights/search.
 *
 * Exists because `loading.tsx` boundaries are inherited: without one here, Next
 * falls back to the nearest ancestor — `(main)/loading.tsx`, which is a LANDING
 * PAGE skeleton (hero, search bar, four card carousels). Searching therefore
 * flashed the landing page on the way to the results, which reads as the app
 * navigating backwards before arriving.
 *
 * Deliberately hook-free (no translations, no stores) so it renders instantly as
 * a server component, and laid out to match src/app/(main)/flights/search/page.tsx
 * and <SearchFetcher> so the swap to real results causes no layout shift.
 */
export function FlightSearchLoadingSkeleton() {
    return (
        <main className="min-h-screen pt-2 pb-12 px-4 md:pt-6 md:pb-20 overflow-x-hidden">
            <div className="max-w-7xl mx-auto space-y-3 lg:space-y-6 animate-pulse">
                {/* Back button + route header — desktop only, matching the page */}
                <div className="hidden lg:block">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 mb-3" />
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-2">
                            <div className="h-7 w-56 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                            <div className="h-4 w-72 bg-slate-200 dark:bg-slate-800 rounded" />
                        </div>
                        <div className="h-9 w-32 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    </div>
                </div>

                {/* Mobile header strip */}
                <div className="lg:hidden space-y-2">
                    <div className="h-6 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-4 w-56 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>

                <div className="flex flex-col lg:flex-row gap-6 lg:items-start items-stretch">
                    {/* Filter sidebar — 288px to match the animated panel width */}
                    <div className="hidden lg:block w-72 flex-shrink-0">
                        <div className="w-full bg-white dark:bg-slate-900 p-6 rounded-md border border-slate-200 dark:border-slate-800 space-y-4">
                            <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                            <div className="h-24 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                            <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                            <div className="h-32 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                            <div className="h-5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                            <div className="h-20 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                        </div>
                    </div>

                    {/* Result cards */}
                    <div className="flex-1 min-w-0 space-y-4">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div
                                key={i}
                                className="flex flex-col lg:flex-row bg-white dark:bg-slate-900 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700"
                            >
                                <div className="flex-1 min-w-0 px-3 py-2 lg:px-4 lg:py-2.5 space-y-2">
                                    {/* Airline row */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-slate-200 dark:bg-slate-800" />
                                        <div className="space-y-1">
                                            <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                                            <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                                        </div>
                                    </div>
                                    {/* Two leg rows — a round trip renders one per direction */}
                                    {[0, 1].map(leg => (
                                        <div key={leg} className="flex items-center gap-3">
                                            <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                                            <div className="flex-1 h-[2px] bg-slate-200 dark:bg-slate-800 rounded-full" />
                                            <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                                        </div>
                                    ))}
                                    {/* Tag row */}
                                    <div className="flex gap-1.5">
                                        <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                                        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
                                        <div className="h-4 w-14 bg-slate-200 dark:bg-slate-800 rounded-full" />
                                    </div>
                                </div>

                                {/* Price + CTA column */}
                                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-2 lg:w-[180px] px-3 py-2 lg:py-3 lg:px-4 lg:border-l border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                                    <div className="space-y-1 lg:text-right">
                                        <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                                        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                                    </div>
                                    <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}

export default FlightSearchLoadingSkeleton;
