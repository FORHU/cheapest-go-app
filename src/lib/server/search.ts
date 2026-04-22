import { unstable_cache } from 'next/cache';
import { autocompleteLiteApi } from './liteapi';
import { extractCountryCode, COUNTRY_SEARCH_LIST } from '@/lib/constants/countries';

export interface AutocompleteResult {
    type: 'city' | 'country';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    /** TravelgateX TGX-context destination code (populated once FastX catalog is synced) */
    code?: string;
}

function matchCountries(query: string): AutocompleteResult[] {
    const q = query.toLowerCase().trim();
    return COUNTRY_SEARCH_LIST
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(c => ({
            type: 'country' as const,
            title: c.name,
            subtitle: 'Country · Browse all hotels',
            countryCode: c.code,
        }));
}

async function fetchAutocomplete(query: string): Promise<AutocompleteResult[]> {
    const countryResults = matchCountries(query);

    // If the query is an exact (or near-exact) match for a country name, skip LiteAPI
    // entirely — it returns garbage like "South Korea Embassy" or "South Korea Border Area"
    // because it matches hotel/place names, not city names.
    const q = query.toLowerCase().trim();
    const isExactCountryMatch = countryResults.some(
        c => c.title.toLowerCase() === q || c.title.toLowerCase().startsWith(q) && q.length >= 4
    );

    if (isExactCountryMatch) {
        return countryResults;
    }

    const res = await autocompleteLiteApi(query);
    const cityResults: AutocompleteResult[] = (res?.data ?? []).map((item: Record<string, unknown>) => {
        const cityName = (item.displayName || item.name || '') as string;
        const address = (item.formattedAddress || item.address || '') as string;
        return {
            type: 'city' as const,
            title: cityName,
            subtitle: address,
            countryCode: extractCountryCode(address, cityName),
            id: (item.placeId || item.id) as string | undefined,
        };
    });

    // Countries first (max 4), then cities
    return [...countryResults, ...cityResults];
}

const getCachedAutocomplete = unstable_cache(
    fetchAutocomplete,
    ['autocomplete-destinations'],
    { revalidate: 300 } // 5-minute server-side cache shared across all users
);

/**
 * Autocomplete destinations via LiteAPI with server-side caching.
 * Same query returns cached results for all users — no per-tab staleTime needed.
 */
export async function autocompleteDestinations(
    query: string
): Promise<{ success: true; data: AutocompleteResult[] } | { success: false; error: string }> {
    if (!query || query.length < 2) {
        return { success: true, data: [] };
    }

    try {
        const data = await getCachedAutocomplete(query);
        return { success: true, data };
    } catch (error) {
        console.error('[autocompleteDestinations] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Autocomplete failed',
        };
    }
}
