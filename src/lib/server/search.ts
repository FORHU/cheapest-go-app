import { unstable_cache } from 'next/cache';
import { extractCountryCode, COUNTRY_SEARCH_LIST } from '@/lib/constants/countries';
import { getSqlAdmin } from '@/lib/db/postgres';

/** Where a searched place sits on the granularity ladder. See CONTEXT.md
 *  ("Destination granularity") and ADR-0006. Area rungs (country/province/city)
 *  resolve to an ETG region; point rungs (district/poi) resolve to coord+radius. */
export type DestinationRung = 'country' | 'province' | 'city' | 'district' | 'poi';

export interface AutocompleteResult {
    type: 'city' | 'country';
    /** Granularity ladder rung — drives which resolution path search uses. */
    rung: DestinationRung;
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    /** TravelgateX destination code — embedded so the search page can pass it directly */
    code?: string;
    /** Place centre from Mapbox (point rungs are searched around this). */
    lat?: number;
    lng?: number;
    /** Mapbox bounding box [minLng, minLat, maxLng, maxLat] — sizes a district's search circle. */
    bbox?: [number, number, number, number];
}

/** Map a Mapbox geocoder place_type to a ladder rung. */
function mapboxTypeToRung(placeType: string): DestinationRung {
    switch (placeType) {
        case 'country':                            return 'country';
        case 'region':                             return 'province';
        case 'place':                              return 'city';
        case 'district':
        case 'locality':
        case 'neighborhood':                       return 'district';
        case 'poi':
        case 'poi.landmark':
        case 'address':                            return 'poi';
        default:                                   return 'city';
    }
}

function matchCountries(query: string): AutocompleteResult[] {
    const q = query.toLowerCase().trim();
    return COUNTRY_SEARCH_LIST
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(c => ({
            type: 'country' as const,
            rung: 'country' as const,
            title: c.name,
            subtitle: 'Country · Browse all hotels',
            countryCode: c.code,
        }));
}

/** Map an app locale ('en'|'ko'|'cn'|'ja') to a Mapbox geocoder language code. */
function mapboxLang(locale?: string): string {
    switch (locale) {
        case 'ko': return 'ko';
        case 'ja': return 'ja';
        case 'cn': return 'zh-Hans'; // app uses 'cn'; Mapbox expects a BCP-47 tag
        default:   return 'en';
    }
}

async function fetchCitiesFromMapbox(query: string, locale?: string): Promise<AutocompleteResult[]> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return [];

    // proximity=Seoul biases results toward Asia/popular travel regions.
    // Request the user's language AND English so non-Latin queries (e.g. "도쿄",
    // "東京") match, while we still get an English `text_en` to use as the
    // resolution-safe canonical name. English-only locales just request `en`.
    // types spans the whole granularity ladder: region (province) → place (city)
    // → district/locality (district) → poi/address (landmark). Country comes from
    // the local COUNTRY_SEARCH_LIST, so it is not requested here.
    const lang = mapboxLang(locale);
    const language = lang === 'en' ? 'en' : `${lang},en`;
    const types = 'region,place,district,locality,neighborhood,poi,address';
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=${types}&limit=8&language=${language}&proximity=126.9780,37.5665&access_token=${token}`;

    try {
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return [];
        const data = await res.json();

        return (data.features ?? []).map((feature: any) => {
            // `text_en` is the English name (present because we requested `en`);
            // fall back to `text` for English-only requests. Downstream resolution
            // (destination codes, region_id, cache keys, hotel_content.city) is all
            // English-keyed, so `title` must stay English even when the user typed Korean.
            const cityName = feature.text_en ?? feature.text ?? '';
            // Localized full name for display (primary requested language).
            const placeName = feature.place_name ?? '';
            // Extract country short_code from context array
            const countryCtx = (feature.context ?? []).find((c: any) => c.id?.startsWith('country.'));
            const rawCode = countryCtx?.short_code ?? '';
            const countryCode = rawCode
                ? rawCode.toUpperCase().slice(0, 2)
                : extractCountryCode(placeName, cityName);

            // place_type is an array (most-specific first); its first entry drives the rung.
            const placeType: string = (feature.place_type ?? [])[0] ?? 'place';
            const rung = mapboxTypeToRung(placeType);
            // Mapbox center is [lng, lat]; bbox is [minLng, minLat, maxLng, maxLat].
            const center: [number, number] | undefined = Array.isArray(feature.center) ? feature.center : undefined;
            const bbox: [number, number, number, number] | undefined =
                Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox : undefined;

            return {
                type: 'city' as const,
                rung,
                title: cityName,
                subtitle: placeName,
                countryCode,
                id: feature.id ?? undefined,
                lat: center ? center[1] : undefined,
                lng: center ? center[0] : undefined,
                bbox,
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

/** Overwrite an entry in the in-process dest code cache (e.g. after manually seeding the DB). */
export function setDestCodeCache(cityKey: string, destCode: string): void {
    _destCodeCache.set(cityKey.toLowerCase().trim(), destCode);
}

/**
 * Resolve a TravelgateX destination code for a given city.
 * Checks in-process cache → DB → TGX API (in that order).
 * Writes back to DB so future lookups skip the TGX API call entirely.
 *
 * When countryCode is provided the cache key is scoped to that country so
 * ambiguous city names (e.g. "Bali" → Crete OR Indonesia) resolve correctly
 * for each country.  The TGX result selection also prefers ZONE over CITY when
 * countryCode is given — geographic zones (islands, provinces) are rarely shared
 * across countries, while small city names often clash.
 */
export async function resolveTgxDestinationCode(cityName: string, countryCode?: string): Promise<string | undefined> {
    const key = countryCode
        ? `${cityName.toLowerCase().trim()}:${countryCode.toLowerCase()}`
        : cityName.toLowerCase().trim();

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
            setTimeout(() => reject(new Error('resolve timeout')), 18000)
        );
        // TGX destinationSearcher returns a union type — other union members come back
        // as empty {} objects, crowding out real DestinationData entries when maxSize is
        // small. Retry with 4× the size if the first pass yields no usable codes.
        const DEST_QUERY = `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
                   hotelX {
                     destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                       ... on DestinationData { code type texts { text language } }
                     }
                   }
                 }`;
        const fetchItems = async (maxSize: number) => {
            const res = await tgxGraphQL(DEST_QUERY, { access: cfg.accessCode, text: cityName, maxSize });
            return (res?.data?.hotelX?.destinationSearcher ?? []) as any[];
        };
        let items: any[] = await Promise.race([fetchItems(50), timeout]);
        const hasCode = (arr: any[]) => arr.some((i: any) => i.code);
        if (!hasCode(items)) {
            // First pass returned only empty union members — retry with 4× the window.
            items = await Promise.race([fetchItems(200), timeout]);
        }
        const exactName = cityName.toLowerCase();
        const matchesName = (i: any) =>
            (i.texts ?? []).some((t: any) => t.language === 'en' && t.text.toLowerCase() === exactName);

        // Prefer the item whose English text exactly matches the query to avoid
        // false positives (e.g. "Little Tokyo" LA being picked over "Tokyo" Japan).
        // With a known country, prefer ZONE: "Bali, Indonesia" is a ZONE while
        // the Greek town of Bali is a CITY — zone-first avoids cross-country mismatches.
        const cityItem =
            items.find((i: any) => i.type === 'CITY' && matchesName(i)) ??
            items.find((i: any) => i.type === 'CITY');
        const zoneItem =
            items.find((i: any) => i.type === 'ZONE' && matchesName(i)) ??
            items.find((i: any) => i.type === 'ZONE');
        const code = countryCode
            ? (zoneItem?.code ?? cityItem?.code ?? undefined)
            : (cityItem?.code ?? zoneItem?.code ?? undefined);
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

// Cities whose background resolution is already in flight — prevents duplicate calls.
const _bgResolving = new Set<string>();

/**
 * Fire-and-forget: call destinationSearcher with a long timeout, cache the result.
 * Called when the synchronous resolution in resolveTgxDestinationCode times out.
 * On next search the code is in DB cache and resolution is instant.
 */
export function backgroundResolveDestCode(cityName: string, countryCode?: string): void {
    const key = countryCode
        ? `${cityName.toLowerCase().trim()}:${countryCode.toLowerCase()}`
        : cityName.toLowerCase().trim();
    if (_bgResolving.has(key) || _destCodeCache.has(key)) return;
    _bgResolving.add(key);
    (async () => {
        try {
            const { getTgxConfig } = await import('@/lib/server/stays/travelgatex/client');
            const cfg = getTgxConfig();
            if (!cfg.apiKey) return;
            const DEST_QUERY = `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
                   hotelX {
                     destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                       ... on DestinationData { code type texts { text language } }
                     }
                   }
                 }`;
            // Use raw fetch with NO AbortSignal — Next.js aborts signals tied to the
            // request context when the stream closes, killing any tgxGraphQL call.
            // Without a signal the fetch runs until TGX responds (can take 30-60s).
            const res = await fetch(cfg.endpoint, {
                method:  'POST',
                headers: { 'Authorization': `Apikey ${cfg.apiKey}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
                body:    JSON.stringify({ query: DEST_QUERY, variables: { access: cfg.accessCode, text: cityName, maxSize: 50 } }),
            });
            if (!res.ok) { console.warn(`[dest-resolve] HTTP ${res.status} for "${cityName}"`); return; }
            const result = await res.json();
            const items: any[] = result?.data?.hotelX?.destinationSearcher ?? [];
            const exactName = cityName.toLowerCase();
            const matchesName = (i: any) =>
                (i.texts ?? []).some((t: any) => t.language === 'en' && t.text.toLowerCase() === exactName);
            const cityItem = items.find((i: any) => i.type === 'CITY' && matchesName(i)) ?? items.find((i: any) => i.type === 'CITY');
            const zoneItem = items.find((i: any) => i.type === 'ZONE' && matchesName(i)) ?? items.find((i: any) => i.type === 'ZONE');
            // Always prefer CITY — this resolver is called with countryCode=undefined to
            // match the same cache key as resolveTgxDestinationCode(cityName, undefined).
            const code = cityItem?.code ?? zoneItem?.code ?? undefined;
            if (code) {
                _destCodeCache.set(key, code);
                const sql = getSqlAdmin();
                await sql`INSERT INTO tgx_destination_cache (city_key, destination_code)
                    VALUES (${key}, ${code})
                    ON CONFLICT (city_key) DO UPDATE SET destination_code = EXCLUDED.destination_code`;
                console.log(`[dest-resolve] Background resolved "${cityName}" → ${code} (cached for next search)`);
            } else {
                console.warn(`[dest-resolve] Background resolution for "${cityName}" returned no code`);
            }
        } catch (e: any) {
            console.warn(`[dest-resolve] Background resolution for "${cityName}" failed:`, e.message?.slice(0, 100));
        } finally {
            _bgResolving.delete(key);
        }
    })();
}

async function fetchAutocomplete(query: string, locale?: string): Promise<AutocompleteResult[]> {
    const countryResults = matchCountries(query);

    const q = query.toLowerCase().trim();
    const isExactCountryMatch = countryResults.some(
        c => c.title.toLowerCase() === q || (c.title.toLowerCase().startsWith(q) && q.length >= 4)
    );

    if (isExactCountryMatch) {
        return countryResults;
    }

    const cityResults = await fetchCitiesFromMapbox(query, locale);
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
    query: string,
    locale?: string,
): Promise<{ success: true; data: AutocompleteResult[] } | { success: false; error: string }> {
    if (!query || query.length < 2) {
        return { success: true, data: [] };
    }

    try {
        // locale is part of the cache args, so each language caches independently.
        const data = await getCachedAutocomplete(query, locale);
        return { success: true, data };
    } catch (error) {
        console.error('[autocompleteDestinations] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Autocomplete failed',
        };
    }
}

/**
 * Resolve a place name (in any language/script) to its English city name via
 * Mapbox. Used by the flight airport search to normalise non-Latin queries
 * ("도쿄" → "Tokyo") before matching the English-keyed airport dataset.
 * Returns null when nothing resolves.
 */
export async function resolveEnglishPlaceName(query: string, locale?: string): Promise<string | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !query.trim()) return null;
    const lang = mapboxLang(locale);
    const language = lang === 'en' ? 'en' : `${lang},en`;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,locality,region&limit=1&language=${language}&access_token=${token}`;
    try {
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) return null;
        const data = await res.json();
        const f = (data.features ?? [])[0];
        if (!f) return null;
        return (f.text_en ?? f.text ?? null) as string | null;
    } catch {
        return null;
    }
}
