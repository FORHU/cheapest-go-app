export default function LandingLoading() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-between pb-20 animate-pulse">
            {/* Hero skeleton */}
            <section className="w-full flex flex-col items-center text-center max-w-4xl mx-auto mt-6 md:mt-10 lg:mt-16 mb-6 md:mb-10 lg:mb-16 px-4">
                {/* Headline */}
                <div className="w-3/4 h-10 bg-slate-200 dark:bg-white/5 rounded-xl mb-3" />
                <div className="w-1/2 h-10 bg-slate-200 dark:bg-white/5 rounded-xl mb-8" />
                {/* Search bar */}
                <div className="w-full h-16 bg-slate-200 dark:bg-white/5 rounded-2xl shadow-lg mb-4" />
                {/* Suggestion chips */}
                <div className="flex gap-2 mt-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-8 w-24 bg-slate-200 dark:bg-white/5 rounded-full" />
                    ))}
                </div>
            </section>

            <div className="w-full space-y-2 sm:space-y-4">
                <div className="max-w-[1400px] mx-auto w-full">
                    {/* Horizontal scroll section skeleton × 4 */}
                    {[1, 2, 3, 4].map(section => (
                        <div key={section} className="w-full py-4 md:py-8 px-4 sm:px-6">
                            {/* Section header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-32 bg-slate-200 dark:bg-white/5 rounded-lg" />
                                    <div className="h-5 w-20 bg-slate-200 dark:bg-white/5 rounded-full" />
                                </div>
                                <div className="h-5 w-16 bg-slate-200 dark:bg-white/5 rounded-lg" />
                            </div>
                            {/* Cards row */}
                            <div className="flex gap-3 overflow-hidden">
                                {[1, 2, 3, 4].map(card => (
                                    <div
                                        key={card}
                                        className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[280px] h-[220px] sm:h-[260px] bg-slate-200 dark:bg-white/5 rounded-xl"
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
