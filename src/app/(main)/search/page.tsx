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

export default async function SearchPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const viewMode = searchParams.view === 'list' ? 'list' : 'map';

    // Parallel fetch: properties and facilities
    const [initialProperties, initialFacilities] = await Promise.all([
        fetchSearchProperties(searchParams as any),
        fetchFacilities(),
    ]);

    // ─── MAP VIEW: split layout ────────────────────
    if (viewMode === 'map') {
        return (
            <main className="h-[calc(100dvh-64px)] w-full overflow-hidden">
                <Suspense
                    fallback={
                        <div className="flex h-full w-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    }
                >
                    <LazySearchMapView
                        properties={initialProperties}
                        destination={searchParams.destination as string || ''}
                    />
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
                <SearchResults initialProperties={initialProperties} />
            </div>
        </main>
    );
}
