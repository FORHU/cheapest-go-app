import { SearchPageClient } from '@/components/search/SearchPageClient';
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
    const initialView = flatParams.view === 'list' ? 'list' : 'map';

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
