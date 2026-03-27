export default function AccountLoading() {
    return (
        <div className="min-h-screen pt-6 pb-16 px-4 md:px-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="h-8 w-40 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />

                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
                    {/* Sidebar nav */}
                    <div className="space-y-2">
                        {[1,2,3,4,5].map(i => (
                            <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                        ))}
                    </div>

                    {/* Content panel */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
                        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                            <div className="space-y-2 flex-1">
                                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[1,2,3,4].map(i => (
                                <div key={i} className="h-11 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                            ))}
                        </div>
                        <div className="h-10 w-28 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    );
}
