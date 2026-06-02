import { unstable_cache } from 'next/cache';
import { extractCountryCode, COUNTRY_SEARCH_LIST } from '@/lib/constants/countries';
import { getSqlAdmin } from '@/lib/db/postgres';

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

    // proximity=Seoul biases results toward Asia/popular travel regions.
    // language=en ensures consistent city name casing across locales.
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,locality,region&limit=8&language=en&proximity=126.9780,37.5665&access_token=${token}`;

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
 * Filter Mapbox city results to those that have hotels in hotel_content,
 * matched on both city name AND country code to avoid false positives
 * (e.g. "Jeju, Ethiopia" matching our "Jeju, South Korea" hotels).
 */
async function filterCitiesWithHotels(
    cities: Array<{ title: string; countryCode: string }>
): Promise<Set<string>> {
    if (!cities.length) return new Set();
    try {
        const sql = getSqlAdmin();
        // Build composite keys "city|countrycode" for exact matching
        const pairs = cities.map(c => ({
            city: c.title.toLowerCase(),
            country: c.countryCode.toLowerCase(),
        }));
        const cityNames = pairs.map(p => p.city);
        const rows = await sql`
            SELECT DISTINCT LOWER(city) AS city, LOWER(country) AS country
            FROM hotel_content
            WHERE LOWER(city) = ANY(${cityNames})
        `;
        // Build a set of "city|country" composite keys that have hotels
        const matched = new Set(rows.map((r: any) => `${r.city}|${r.country}`));
        // Return a set of city titles (original case key) that matched by city+country
        const result = new Set<string>();
        for (const p of pairs) {
            if (matched.has(`${p.city}|${p.country}`)) {
                result.add(p.city);
            }
        }
        // Fallback: if no exact country match found, try city-only (for cities
        // where country field is blank in hotel_content)
        if (result.size === 0) {
            const cityOnlyMatched = new Set(rows.map((r: any) => r.city as string));
            for (const p of pairs) {
                if (cityOnlyMatched.has(p.city)) result.add(p.city);
            }
        }
        return result;
    } catch {
        return new Set(cities.map(c => c.title.toLowerCase()));
    }
}

// In-process cache — avoids repeat DB lookups within the same server process
const _destCodeCache = new Map<string, string>();

/**
 * Resolve a TravelgateX destination code for a given city.
 * Checks in-process cache → DB → TGX API (in that order).
 * Writes back to DB so future lookups skip the TGX API call entirely.
 */
export async function resolveTgxDestinationCode(cityName: string): Promise<string | undefined> {
    const key = cityName.toLowerCase().trim();

    // 1. In-process cache (fastest)
    if (_destCodeCache.has(key)) return _destCodeCache.get(key);

    // 2. DB cache (fast, survives server restarts)
    try {
        const sql = getSqlAdmin();
        const rows = await sql`SELECT destination_code FROM tgx_destination_cache WHERE city_key = ${key} LIMIT 1`;
        if (rows.length > 0) {
            const code = rows[0].destination_code as string;
            _destCodeCache.set(key, code);
            return code;
        }
    } catch { /* non-fatal — fall through to TGX */ }
    try {
        const { tgxGraphQL, getTgxConfig } = await import('@/lib/server/stays/travelgatex/client');
        const cfg = getTgxConfig();
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('resolve timeout')), 8000)
        );
        const result = await Promise.race([
            tgxGraphQL(
                `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
                   hotelX {
                     destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                       ... on DestinationData { code type }
                     }
                   }
                 }`,
                { access: cfg.accessCode, text: cityName, maxSize: 20 }
            ),
            timeout,
        ]);
        const items: any[] = result?.data?.hotelX?.destinationSearcher ?? [];
        const cityItem = items.find((i: any) => i.type === 'CITY');
        const zoneItem = items.find((i: any) => i.type === 'ZONE');
        const code = cityItem?.code ?? zoneItem?.code ?? undefined;
        if (code) {
            _destCodeCache.set(key, code);
            // Write to DB (fire-and-forget — non-blocking)
            try {
                const sql = getSqlAdmin();
                sql`INSERT INTO tgx_destination_cache (city_key, destination_code)
                    VALUES (${key}, ${code})
                    ON CONFLICT (city_key) DO NOTHING`.catch(() => {});
            } catch { /* non-fatal */ }
        }
        return code;
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

    const cityResults = await fetchCitiesFromMapbox(query);
    if (!cityResults.length) return countryResults;

    // Only show cities that have hotels in our TGX inventory (hotel_content).
    // This prevents "No results found" after selecting a Mapbox city we don't cover.
    // Sort: cities with hotels in our DB come first, others still shown below.
    const citiesWithHotels = await filterCitiesWithHotels(cityResults);
    const sorted = [
        ...cityResults.filter(c => citiesWithHotels.has(c.title.toLowerCase())),
        ...cityResults.filter(c => !citiesWithHotels.has(c.title.toLowerCase())),
    ];

    return [...countryResults, ...sorted];
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
