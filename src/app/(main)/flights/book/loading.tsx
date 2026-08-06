/**
 * Route-level loading UI for /flights/book.
 *
 * Same reason as /flights/search: without this, the boundary is inherited from
 * `(main)/loading.tsx`, which is a landing-page skeleton. Selecting a flight then
 * flashed the landing page on the way to the booking form.
 *
 * Hook-free so it renders as a server component with no client bundle.
 */
export default function FlightBookLoading() {
    return (
        <main className="min-h-screen pt-2 pb-12 px-4 md:pt-6 md:pb-20">
            <div className="max-w-6xl mx-auto space-y-4 lg:space-y-6 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800" />

                <div className="flex flex-col lg:flex-row gap-6 items-start">
                    {/* Passenger + contact form */}
                    <div className="flex-1 min-w-0 w-full space-y-4">
                        {[1, 2].map(block => (
                            <div
                                key={block}
                                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 space-y-4"
                            >
                                <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[1, 2, 3, 4].map(field => (
                                        <div key={field} className="space-y-1.5">
                                            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                                            <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-md" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Itinerary + price summary */}
                    <div className="w-full lg:w-[340px] flex-shrink-0 space-y-4">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 space-y-3">
                            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
                            {[0, 1].map(leg => (
                                <div key={leg} className="flex items-center gap-3">
                                    <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                                    <div className="flex-1 h-[2px] bg-slate-200 dark:bg-slate-800 rounded-full" />
                                    <div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                                </div>
                            ))}
                            <div className="h-px w-full bg-slate-200 dark:bg-slate-800" />
                            <div className="flex justify-between">
                                <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                            </div>
                        </div>
                        <div className="h-11 w-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
                    </div>
                </div>
            </div>
        </main>
    );
}
