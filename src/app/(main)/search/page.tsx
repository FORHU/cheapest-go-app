import { Suspense } from 'react';
import SearchFilters from '@/components/search/SearchFilters';
import SearchResults from '@/components/search/SearchResults';
import { SearchMapView } from '@/components/search/SearchMapView';
import { SearchModule } from '@/components/landing/hero/SearchModule';
import BackButton from '@/components/common/BackButton';
import { fetchSearchProperties, fetchFacilities } from '@/lib/search';

export const metadata = {
    title: 'Search Results - CheapestGo',
    description: 'Find your perfect stay.',
};

export default async function SearchPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const viewMode = searchParams.view === 'map' ? 'map' : 'list';

    // Parallel fetch: properties and facilities
    const [initialProperties, initialFacilities] = await Promise.all([
        fetchSearchProperties(searchParams as any),
        fetchFacilities(),
    ]);

    // ─── MAP VIEW: Full Agoda-style split layout ────────────────────
    if (viewMode === 'map') {
        return (
            <main className="h-[calc(100vh-64px)] w-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="flex h-full items-center justify-center">
                            <div className="animate-pulse text-sm text-slate-500">Loading map...</div>
                        </div>
                    }
                >
                    <SearchMapView
                        properties={initialProperties}
                        destination={searchParams.destination as string || ''}
                    />
                </Suspense>
            </main>
        );
    }

    // ─── LIST VIEW: Normal search page layout ───────────────────────
    return (
        <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
            <div className="max-w-7xl mx-auto">
                {/* Back to Home */}
                <div className="mb-4">
                    <BackButton label="Back to Home" href="/" />
                </div>

                {/* Compact Search Bar */}
                <div className="mb-8 relative z-50">
                    <div className="origin-top transform scale-90 sm:scale-100">
                        <SearchModule />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                <Suspense fallback={
                    <div className="w-full flex-shrink-0 lg:w-[280px] space-y-4">
                        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2 animate-pulse" />
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                            ))}
                        </div>
                    </div>
                }>
                    <SearchFilters
                        initialFacilities={initialFacilities}
                        previewCoordinates={
                            initialProperties && initialProperties.length > 0 &&
                                initialProperties[0].coordinates &&
                                initialProperties[0].coordinates.lat !== 0
                                ? initialProperties[0].coordinates
                                : null
                        }
                    />
                </Suspense>
                <SearchResults initialProperties={initialProperties} />
            </div>
        </main>
    );
}
