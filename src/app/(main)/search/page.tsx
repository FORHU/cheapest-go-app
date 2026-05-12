import SearchFilters from '@/components/search/SearchFilters';
import { ResponsiveSearchHeader } from '@/components/search/ResponsiveSearchHeader';
import { HotelResultsClient } from '@/components/search/HotelResultsClient';
import { MapResultsClient } from '@/components/search/MapResultsClient';
import BackButton from '@/components/common/BackButton';
import { fetchFacilities } from '@/lib/search';

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

    // Flatten to Record<string, string> for client component props (arrays → first value)
    const flatParams = Object.fromEntries(
        Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? ''])
    ) as Record<string, string>;

    const dest = flatParams.destination || '';

    // ─── MAP VIEW ───────────────────────────────────────────────────
    if (viewMode === 'map') {
        return (
            <main className="h-[calc(100dvh-64px)] w-full overflow-hidden">
                <MapResultsClient searchParams={flatParams} destination={dest} />
            </main>
        );
    }

    // Facilities are fast (Supabase lookup) — await here so filters render immediately
    const initialFacilities = await fetchFacilities();

    // ─── LIST VIEW ──────────────────────────────────────────────────
    return (
        <main className="min-h-screen pt-3 md:pt-6 pb-8 md:pb-16 px-3 md:px-6">
            <div className="max-w-[1400px] mx-auto">
                <div className="hidden lg:block mb-4">
                    <BackButton label="Back to Home" href="/" />
                </div>
                <ResponsiveSearchHeader />
            </div>

            <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
                {/* Filters sidebar renders immediately — no hotel data dependency */}
                <SearchFilters
                    initialFacilities={initialFacilities}
                    previewCoordinates={null}
                />

                {/* Hotel list fetches client-side — page shell appears in <1s */}
                <HotelResultsClient searchParams={flatParams} />
            </div>
        </main>
    );
}
