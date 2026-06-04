import SearchFilters from '@/components/search/SearchFilters';
import { ResponsiveSearchHeader } from '@/components/search/ResponsiveSearchHeader';
import { HotelResultsClient } from '@/components/search/HotelResultsClient';
import { MapResultsClient } from '@/components/search/MapResultsClient';
import { CountryCityPicker } from '@/components/search/CountryCityPicker';
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

    const flatParams = Object.fromEntries(
        Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? ''])
    ) as Record<string, string>;

    const dest = flatParams.destination || '';

    // ─── MAP VIEW ───────────────────────────────────────────────────
    if (viewMode === 'map') {
        return (
            <main className="h-[calc(100dvh-64px)] w-full overflow-hidden flex flex-col">
                {flatParams.destinationType === 'country' && (
                    <div className="shrink-0 px-3 pt-2">
                        <CountryCityPicker searchParams={flatParams} />
                    </div>
                )}
                <div className="flex-1 overflow-hidden">
                    <MapResultsClient searchParams={flatParams} destination={dest} />
                </div>
            </main>
        );
    }

    // Facilities are fast (Supabase lookup) — await here so filters render immediately
    const initialFacilities = await fetchFacilities();

    return (
        <SearchPageClient
            searchParams={flatParams}
            destination={dest}
            initialFacilities={initialFacilities}
            initialView={initialView}
        />
    );
}
