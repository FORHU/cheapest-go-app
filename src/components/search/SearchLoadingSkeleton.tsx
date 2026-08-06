import React from 'react';

/**
 * Route-level loading UI for /search.
 *
 * Shaped for the MAP view, because that is what this route actually renders by
 * default: `search/page.tsx` reads `view || 'map'`, and the landing search never
 * sets `view`. The previous skeleton drew the list layout — sidebar filters and
 * stacked property cards — so every hotel search flashed a page that looked
 * nothing like the map it resolved into.
 *
 * `loading.tsx` receives no searchParams in the App Router, so this cannot branch
 * on `view`. Matching the default is the best available choice: the landing →
 * results transition is always map, and the list view is reached only by an
 * explicit toggle once the user is already here.
 *
 * Height mirrors the map branch of search/page.tsx exactly so the swap to the
 * real map causes no layout shift.
 */
export const SearchLoadingSkeleton = () => {
    return (
        <main className="h-[calc(100dvh-109px)] md:h-[calc(100dvh-121px)] lg:h-[calc(100dvh-57px)] w-full overflow-hidden flex flex-col animate-pulse">
            <div className="flex-1 relative overflow-hidden bg-slate-100 dark:bg-slate-900">
                {/* Map canvas placeholder */}
                <div className="absolute inset-0 bg-slate-200/70 dark:bg-slate-800/60" />

                {/* Result card rail — overlays the map on desktop */}
                <div className="hidden lg:flex absolute top-4 left-4 bottom-4 w-[340px] flex-col gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div
                            key={i}
                            className="flex bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-[110px] shrink-0"
                        >
                            <div className="w-[120px] h-full bg-slate-200 dark:bg-slate-800" />
                            <div className="flex-1 p-3 space-y-2">
                                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded mt-3" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Mobile: a horizontal card rail sits along the bottom */}
                <div className="lg:hidden absolute bottom-4 left-0 right-0 flex gap-3 px-4 overflow-hidden">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="shrink-0 w-[260px] h-[96px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex"
                        >
                            <div className="w-[96px] h-full bg-slate-200 dark:bg-slate-800 rounded-l-xl" />
                            <div className="flex-1 p-2.5 space-y-2">
                                <div className="h-3.5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* The "searching…" pill MapResultsClient shows while streaming */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                    <div className="h-7 w-40 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-lg" />
                </div>
            </div>
        </main>
    );
};

export default SearchLoadingSkeleton;
