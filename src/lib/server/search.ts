import { unstable_cache } from 'next/cache';
import { autocompleteLiteApi } from './liteapi';
import { extractCountryCode } from '@/lib/constants/countries';

export interface AutocompleteResult {
    type: 'city';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    /** TravelgateX TGX-context destination code (populated once FastX catalog is synced) */
    code?: string;
}

async function fetchAutocomplete(query: string): Promise<AutocompleteResult[]> {
    const res = await autocompleteLiteApi(query);
    if (!res?.data) return [];

    return res.data.map((item: Record<string, unknown>) => {
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
