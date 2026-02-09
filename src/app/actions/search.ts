'use server';

import { invokeEdgeFunction } from '@/utils/supabase/functions';

export interface AutocompleteResult {
  type: 'city';
  title: string;
  subtitle: string;
  countryCode: string;
  id?: string;
}

/**
 * Server action for destination autocomplete.
 * Proxies the LiteAPI autocomplete call through the server boundary.
 */
export async function autocompleteDestinations(
  query: string
): Promise<{ success: true; data: AutocompleteResult[] } | { success: false; error: string }> {
  if (!query || query.length < 2) {
    return { success: true, data: [] };
  }

  try {
    const res = await invokeEdgeFunction('liteapi-autocomplete', { keyword: query });

    if (res && res.data) {
      const mapped: AutocompleteResult[] = res.data.map((item: Record<string, unknown>) => {
        const countryCode = (item.country_code || item.countryCode || item.countryIso || 'PH') as string;
        const cityName = (item.displayName || item.name || '') as string;
        const address = (item.formattedAddress || item.address || '') as string;

        return {
          type: 'city' as const,
          title: cityName,
          subtitle: address,
          countryCode: countryCode.toUpperCase(),
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
