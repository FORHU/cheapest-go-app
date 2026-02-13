import { autocompleteLiteApi } from './liteapi';
import { extractCountryCode } from '@/lib/constants/countries';

export interface AutocompleteResult {
    type: 'city';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
}

/**
 * Autocomplete destinations via LiteAPI.
 */
export async function autocompleteDestinations(
    query: string
): Promise<{ success: true; data: AutocompleteResult[] } | { success: false; error: string }> {
    if (!query || query.length < 2) {
        return { success: true, data: [] };
    }

    try {
        const res = await autocompleteLiteApi(query);

        if (res && res.data) {
            const mapped: AutocompleteResult[] = res.data.map((item: Record<string, unknown>) => {
                const cityName = (item.displayName || item.name || '') as string;
                const address = (item.formattedAddress || item.address || '') as string;

                // LiteAPI /data/places doesn't return countryCode directly.
                // Extract it from formattedAddress (e.g., "South Korea" → "KR")
                // Falls back to displayName for city-states (e.g., "Singapore")
                const countryCode = extractCountryCode(address, cityName);

                return {
                    type: 'city' as const,
                    title: cityName,
                    subtitle: address,
                    countryCode,
                    id: (item.placeId || item.id) as string | undefined,
                };
            });
            return { success: true, data: mapped };
        }

        return { success: true, data: [] };
    } catch (error) {
        console.error('[autocompleteDestinations] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Autocomplete failed',
        };
    }
}
