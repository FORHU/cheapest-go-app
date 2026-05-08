import { Suspense } from 'react';
import SearchFilters from '@/components/search/SearchFilters';
import SearchResults from '@/components/search/SearchResults';
import { ResponsiveSearchHeader } from '@/components/search/ResponsiveSearchHeader';
import LazySearchMapView from '@/components/search/LazySearchMapView';

import BackButton from '@/components/common/BackButton';
import { fetchSearchProperties, fetchFacilities } from '@/lib/search';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Search Hotels & Stays | CheapestGo',
    description: 'Find and book the cheapest hotels, apartments, and unique stays worldwide. Compare prices and discover your perfect accommodation on CheapestGo.',
    robots: { index: false, follow: false },
    alternates: { canonical: '/search' },
};

// ── Skeleton shown while TGX search is in flight ──────────────────────────────
function HotelListSkeleton() {
    return (
        <div className="flex-1 min-w-0 animate-pulse">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4 md:mb-6">
                <div className="space-y-2">
                    <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
                <div className="h-9 w-36 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            {/* 6 horizontal card skeletons */}
            <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-4 h-44 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <div className="w-44 shrink-0 bg-slate-200 dark:bg-slate-700" />
                        <div className="flex-1 py-4 pr-4 space-y-3">
                            <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="flex items-end justify-between mt-auto pt-2">
                                <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="h-9 w-28 bg-slate-200 dark:bg-slate-700 rounded-full" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Loading state for map view while TGX search is in flight ─────────────────
function MapSearchingState({ destination }: { destination: string }) {
    return (
        <div className="flex flex-col h-full w-full">
            {/* Top bar skeleton */}
            <div className="shrink-0 h-[50px] bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center px-4 gap-3 animate-pulse">
                <div className="h-4 w-10 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="ml-auto flex gap-1.5">
                    {[60, 52, 52, 68, 76, 52].map((w, i) => (
                        <div key={i} className="h-6 rounded-full bg-slate-200 dark:bg-slate-700" style={{ width: w }} />
                    ))}
                </div>
            </div>
            {/* Map area with centred spinner */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                <div className="text-center select-none">
                    <div className="w-12 h-12 rounded-full border-[3px] border-blue-200 dark:border-blue-900 border-t-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {destination ? `Searching hotels in ${destination}…` : 'Searching…'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Usually takes 15 – 25 seconds</p>
                </div>
            </div>
        </div>
    );
}

// ── Async server component — deferred so the page shell renders immediately ───
async function HotelResults({ params }: { params: Record<string, string | string[] | undefined> }) {
    const { properties, totalCount } = await fetchSearchProperties(params as any);
    return <SearchResults initialProperties={properties} totalCount={totalCount} rawSearchParams={params as any} />;
}

async function MapResults({ params }: { params: Record<string, string | string[] | undefined> }) {
    const { properties, totalCount, allMappable } = await fetchSearchProperties(params as any);
    return (
        <LazySearchMapView
            properties={properties}
            totalCount={totalCount}
            allMappable={allMappable}
            rawSearchParams={params as any}
            destination={(params.destination as string) || ''}
        />
    );
}

export default async function SearchPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const viewMode = searchParams.view === 'list' ? 'list' : 'map';

    // Facilities are fast (Supabase lookup) — await here so filters render immediately
    const initialFacilities = await fetchFacilities();

    // ─── MAP VIEW: split layout ────────────────────
    if (viewMode === 'map') {
        const dest = (searchParams.destination as string) || '';
        return (
            <main className="h-[calc(100dvh-64px)] w-full overflow-hidden">
                <Suspense fallback={<MapSearchingState destination={dest} />}>
                    <MapResults params={searchParams} />
                </Suspense>
            </main>
        );
    }

    // ─── LIST VIEW: Normal search page layout ───────────────────────
    return (
        <main className="min-h-screen pt-3 md:pt-6 pb-8 md:pb-16 px-3 md:px-6">
            <div className="max-w-[1400px] mx-auto">
                {/* Back to Home */}
                <div className="hidden lg:block mb-4">
                    <BackButton label="Back to Home" href="/" />
                </div>

                {/* Responsive Compact Header */}
                <ResponsiveSearchHeader />
            </div>

            <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
                {/* Filters sidebar — renders immediately, no data dependency */}
                <SearchFilters
                    initialFacilities={initialFacilities}
                    previewCoordinates={null}
                />

                {/* Hotel list streams in when TGX search resolves */}
                <Suspense fallback={<HotelListSkeleton />}>
                    <HotelResults params={searchParams} />
                </Suspense>
            </div>
        </main>
    );
}
