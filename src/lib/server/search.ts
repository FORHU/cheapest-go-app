import { unstable_cache } from 'next/cache';
import { extractCountryCode, COUNTRY_SEARCH_LIST } from '@/lib/constants/countries';

export interface AutocompleteResult {
    type: 'city' | 'country';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    /** TravelgateX destination code — embedded so the search page can pass it directly */
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

async function fetchCitiesFromMapbox(query: string): Promise<AutocompleteResult[]> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return [];

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,locality,region&limit=6&access_token=${token}`;

    try {
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return [];
        const data = await res.json();

        return (data.features ?? []).map((feature: any) => {
            const cityName = feature.text ?? '';
            const placeName = feature.place_name ?? '';
            // Extract country short_code from context array
            const countryCtx = (feature.context ?? []).find((c: any) => c.id?.startsWith('country.'));
            const rawCode = countryCtx?.short_code ?? '';
            const countryCode = rawCode
                ? rawCode.toUpperCase().slice(0, 2)
                : extractCountryCode(placeName, cityName);

            return {
                type: 'city' as const,
                title: cityName,
                subtitle: placeName,
                countryCode,
                id: feature.id ?? undefined,
            };
        });
    } catch {
        return [];
    }
}

/**
 * Resolve a TravelgateX destination code for a given city name.
 * Prefers CITY type results; falls back to ZONE if no CITY found.
 * Best-effort — returns undefined on any failure so it never blocks autocomplete.
 */
async function resolveTgxCode(cityName: string): Promise<string | undefined> {
    try {
        const { tgxGraphQL, getTgxConfig } = await import('@/lib/server/stays/travelgatex/client');
        const cfg = getTgxConfig();
        const result = await tgxGraphQL(
            `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
               hotelX {
                 destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                   ... on DestinationData { code type }
                 }
               }
             }`,
            { access: cfg.accessCode, text: cityName, maxSize: 50 }
        );
        const items: any[] = result?.data?.hotelX?.destinationSearcher ?? [];
        // Prefer CITY type; fall back to first ZONE if no CITY found
        const cityItem = items.find((i: any) => i.type === 'CITY');
        const zoneItem = items.find((i: any) => i.type === 'ZONE');
        return cityItem?.code ?? zoneItem?.code ?? undefined;
    } catch {
        return undefined;
    }
}

async function fetchAutocomplete(query: string): Promise<AutocompleteResult[]> {
    const countryResults = matchCountries(query);

    const q = query.toLowerCase().trim();
    const isExactCountryMatch = countryResults.some(
        c => c.title.toLowerCase() === q || (c.title.toLowerCase().startsWith(q) && q.length >= 4)
    );

    if (isExactCountryMatch) {
        return countryResults;
    }

    // Run Mapbox geocoding + TGX destination code lookup in parallel
    const [cityResults, tgxCode] = await Promise.all([
        fetchCitiesFromMapbox(query),
        resolveTgxCode(query),
    ]);

    // Attach the TGX code to the top (most relevant) city result
    const enriched = cityResults.map((city, idx) => {
        if (idx === 0 && tgxCode) {
            return { ...city, code: tgxCode };
        }
        return city;
    });

    return [...countryResults, ...enriched];
}

const getCachedAutocomplete = unstable_cache(
    fetchAutocomplete,
    ['autocomplete-destinations'],
    { revalidate: 300 }
);

/**
 * Autocomplete destinations via Mapbox Geocoding with server-side caching.
 * Countries come from the local list; cities from Mapbox Places API.
 * The top city result is enriched with its TravelgateX destination code
 * so the search page can pass `destinationCode` directly (no fallback needed).
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
