import { unstable_cache } from 'next/cache';
import { extractCountryCode, COUNTRY_SEARCH_LIST } from '@/lib/constants/countries';
import { getSqlAdmin } from '@/lib/db/postgres';
import { CITY_ALIASES, matchAliasQuery, resolveHotelDbCities } from '@/lib/constants/cityAliases';

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
    /** Original district/neighbourhood name when this result is a sub-city area.
     *  e.g. "Gangnam District" — shown in the search bar and results header. */
    districtName?: string;
    /** The canonical city used for the actual hotel search (TGX), when the user searched
     *  a district alias. e.g. "Seoul" when the user searched "Gangnam". */
    canonicalCity?: string;
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

/** Map an app locale ('en'|'ko'|'zh'|'ja') to a Mapbox geocoder language code. */
function mapboxLang(locale?: string): string {
    switch (locale) {
        case 'ko': return 'ko';
        case 'ja': return 'ja';
        case 'zh': return 'zh-Hans';
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
    const types = 'region,place,district,locality,neighborhood,poi';
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=${types}&limit=8&language=${language}&proximity=126.9780,37.5665&access_token=${token}`;

    try {
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return [];
        const data = await res.json();

        const mapped = (data.features ?? []).map((feature: any) => {
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

            // If this result has a known alias, remap it to the canonical city so
            // "Ottavia" → "Rome", "Manhattan" → "New York", etc.
            // We check all rungs (district, poi, AND city) because Mapbox sometimes
            // classifies sub-city areas as 'place' (city rung) rather than 'neighborhood'.
            // Prefix-match handles Mapbox suffixes like "Gangnam District" → key "gangnam".
            let aliasedCity: string | undefined;
            {
                const nameLower = cityName.toLowerCase();
                const placeNameLower = placeName.toLowerCase();
                const countryMap = CITY_ALIASES[countryCode];
                if (countryMap) {
                    // 1. Context-aware qualified match: when Mapbox strips city qualifiers
                    // from the name (e.g. returns text="Midtown" for "Midtown Miami"), find
                    // the longest alias key that starts with nameLower + separator AND whose
                    // qualifier part appears in the full place_name subtitle. This correctly
                    // maps "Midtown" in Miami context → Miami, not New York.
                    const qualifiedKey = Object.keys(countryMap)
                        .filter(key => {
                            if (!key.startsWith(nameLower + ' ') && !key.startsWith(nameLower + '-')) return false;
                            const qualifier = key.slice(nameLower.length + 1);
                            return qualifier.length > 0 && placeNameLower.includes(qualifier);
                        })
                        .sort((a, b) => b.length - a.length)[0];

                    if (qualifiedKey) {
                        aliasedCity = countryMap[qualifiedKey];
                    } else {
                        // 2. Exact match; then longest prefix match so "jamaica plain"
                        // (Boston) beats the shorter "jamaica" (New York) prefix.
                        const exactKey = Object.keys(countryMap).find(key => nameLower === key);
                        if (exactKey) {
                            aliasedCity = countryMap[exactKey];
                        } else {
                            const prefixKey = Object.keys(countryMap)
                                .filter(key => nameLower.startsWith(key + ' ') || nameLower.startsWith(key + '-'))
                                .sort((a, b) => b.length - a.length)[0];
                            aliasedCity = prefixKey ? countryMap[prefixKey] : undefined;
                        }
                    }
                }
            }

            // When an alias fired but Mapbox didn't include a bbox (common for
            // sub-district features), generate an ~5 km radius bbox from the center
            // so the search page can still filter hotels to this neighbourhood.
            let effectiveBbox = bbox;
            if (aliasedCity && !effectiveBbox && center) {
                const [lng, lat] = center;
                const latDelta = 0.045; // ~5 km
                const lngDelta = latDelta / Math.cos(lat * Math.PI / 180);
                effectiveBbox = [
                    +(lng - lngDelta).toFixed(6),
                    +(lat - latDelta).toFixed(6),
                    +(lng + lngDelta).toFixed(6),
                    +(lat + latDelta).toFixed(6),
                ];
            }

            return {
                type: 'city' as const,
                rung: aliasedCity ? 'city' : rung,
                // Show the district name (e.g. "Gangnam District") in the autocomplete
                // so the user sees what they typed — not the canonical city ("Seoul").
                // canonicalCity carries "Seoul" for the actual TGX hotel search.
                title: cityName,
                subtitle: placeName,
                countryCode,
                id: feature.id ?? undefined,
                lat: center ? center[1] : undefined,
                lng: center ? center[0] : undefined,
                bbox: effectiveBbox,
                districtName: aliasedCity ? cityName : undefined,
                canonicalCity: aliasedCity,
            };
        });

        // Deduplicate: multiple Mapbox district features that alias to the same
        // canonical city collapse into one entry (e.g. two Gangnam features → one row).
        const seen = new Set<string>();
        return mapped.filter((r: AutocompleteResult) => {
            // Alias results: dedup on the canonical city so only one Gangnam/Seoul row shows.
            // Non-alias results: dedup on the display title as before.
            const key = r.canonicalCity
                ? `${r.canonicalCity.toLowerCase()}|${r.countryCode}`
                : `${r.title.toLowerCase()}|${r.countryCode}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
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
    cities: Array<{
        title: string;
        countryCode: string;
        canonicalCity?: string;
        rung?: DestinationRung;
        bbox?: [number, number, number, number];
    }>
): Promise<Set<string>> {
    if (!cities.length) return new Set();
    try {
        const sql = getSqlAdmin();
        // Build composite keys "city|countrycode" for exact matching.
        // Use canonicalCity when present (e.g. Ottavia → Rome) so aliased
        // districts are matched against the real city's hotel inventory.
        // Track both the canonical name (for the return Set) and the DB city name
        // (for the hotel_content query). ETG stores German-localized names ("Rom",
        // "Athen") so resolveHotelDbCity maps canonical → DB before querying.
        const pairs = cities.map(c => {
            const canonical = (c.canonicalCity ?? c.title).toLowerCase();
            // A city can be filed under several spellings at once — Seoul is both
            // "Seoul" and "Seúl" — so every one has to be searched or the coverage
            // check reports no hotels for a city we stock thousands in.
            const dbCities: string[] = resolveHotelDbCities(c.canonicalCity ?? c.title, c.countryCode)
                .map((n: string) => n.toLowerCase());
            return { canonical, dbCities, country: c.countryCode.toLowerCase() };
        });
        const cityNames = [...new Set(pairs.flatMap(p => p.dbCities))];
        const rows = await sql`
            SELECT DISTINCT LOWER(city) AS city, LOWER(country) AS country
            FROM hotel_content
            WHERE LOWER(city) = ANY(${cityNames})
        `;
        // Build a set of "dbCity|country" composite keys that have hotels
        const matched = new Set(rows.map((r: any) => `${r.city}|${r.country}`));
        // Return canonical names (what callers look up) for cities that matched
        const result = new Set<string>();
        for (const p of pairs) {
            // Any one spelling having hotels means we cover the city.
            if (p.dbCities.some(n => matched.has(`${n}|${p.country}`))) {
                result.add(p.canonical);
            }
        }
        // Fallback: if no exact country match found, try city-only
        if (result.size === 0) {
            const cityOnlyMatched = new Set(rows.map((r: any) => r.city as string));
            for (const p of pairs) {
                if (p.dbCities.some(n => cityOnlyMatched.has(n))) result.add(p.canonical);
            }
        }

        // An area rung has no hotel_content row under its own name — Palawan's
        // hotels are filed as El Nido, Coron and Puerto Princesa — so the name
        // check above always calls it uncovered, and it sorts below any city that
        // merely resembles the query. Typing "palawan" offered "Palayan", a
        // different city 600km away, ahead of it. Ask geographically instead.
        const areas = cities.filter(c =>
            (c.rung === 'province' || c.rung === 'country')
            && Array.isArray(c.bbox)
            && !result.has((c.canonicalCity ?? c.title).toLowerCase())
        );
        for (const area of areas) {
            const [minLng, minLat, maxLng, maxLat] = area.bbox!;
            try {
                const [row] = await sql<{ present: boolean }[]>`
                    SELECT EXISTS (
                        SELECT 1 FROM hotel_content
                        WHERE lat BETWEEN ${minLat} AND ${maxLat}
                          AND lng BETWEEN ${minLng} AND ${maxLng}
                          AND lat != 0 AND lng != 0
                          AND LOWER(country) = LOWER(${area.countryCode})
                    ) AS present
                `;
                if (row?.present) result.add((area.canonicalCity ?? area.title).toLowerCase());
            } catch { /* coverage is a ranking signal; a failed probe just leaves it unranked */ }
        }
        return result;
    } catch {
        return new Set(cities.map(c => (c.canonicalCity ?? c.title).toLowerCase()));
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
    if (_destCodeCache.has(key)) {
        const cached = _destCodeCache.get(key)!;
        return cached === 'NONE' ? undefined : cached;
    }

    // 2. DB cache (fast, survives server restarts)
    const cityOnlyKey = cityName.toLowerCase().trim();
    try {
        const sql = getSqlAdmin();

        // A real destination code never expires — TGX's city→code mapping is stable and
        // re-resolving costs an 18s round-trip. A NONE Sentinel does: it records only that
        // one destinationSearcher call failed, and it is written on any TGX 5xx including
        // a transient one. Left permanent, a single outage silently routes a city to
        // Hotel-Code Fallback forever at roughly half the inventory (measured: Seoul, 89
        // hotels against 185 via code 3124, after a 5xx burst pinned 3,828 cities at once).
        // 7 days mirrors tgx_failed_dest_codes, which already expires for the same reason.
        const NONE_TTL_DAYS = 7;
        const isLiveNone = (row: { destination_code: string; created_at: Date | string }) =>
            row.destination_code === 'NONE' &&
            Date.now() - new Date(row.created_at).getTime() < NONE_TTL_DAYS * 86_400_000;

        type DestRow = { destination_code: string; created_at: Date | string };
        const readKey = async (k: string): Promise<string | undefined | null> => {
            const rows = await sql<DestRow[]>`
                SELECT destination_code, created_at FROM tgx_destination_cache
                WHERE city_key = ${k} LIMIT 1`;
            if (rows.length === 0) return null;                       // no row — keep looking
            const row = rows[0];
            if (row.destination_code === 'NONE') {
                if (isLiveNone(row)) { _destCodeCache.set(key, 'NONE'); return undefined; }
                return null;                                          // stale NONE — re-ask TGX
            }
            _destCodeCache.set(key, row.destination_code);
            return row.destination_code;
        };

        const hit = await readKey(key);
        if (hit !== null) return hit;
        // Fallback: sync-dest-cache stores codes without the ":countryCode" suffix.
        // When the scoped key misses, check the city-only key so we don't re-hit TGX.
        if (key !== cityOnlyKey) {
            const cityHit = await readKey(cityOnlyKey);
            if (cityHit !== null) return cityHit;
        }
    } catch { /* non-fatal — fall through to TGX */ }
    // 3. TGX API — share the raw fetch with backgroundResolveDestCode so both
    //    callers join the same HTTP request. Race against 18s so the search
    //    stream isn't blocked; runCityFallback will await the same promise for
    //    up to 12s more when this returns undefined.
    return Promise.race([
        _fetchDestCodeRaw(cityName, countryCode),
        new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 18_000)),
    ]);
}

// In-flight raw TGX dest-code fetches, keyed by city_key.
// Shared so resolveTgxDestinationCode (18s race) and backgroundResolveDestCode
// both await the SAME underlying HTTP call — no duplicate TGX requests.
const _bgResolvingPromises = new Map<string, Promise<string | undefined>>();

/**
 * Shared raw TGX destinationSearcher fetch — no AbortSignal, no timeout.
 * Next.js request-context signals would abort the call when the stream closes;
 * raw fetch runs until TGX responds (can take 30-60s for cold destinations).
 * Result is cached in _destCodeCache and DB so future calls are instant.
 */
function _fetchDestCodeRaw(cityName: string, countryCode?: string): Promise<string | undefined> {
    const key = countryCode
        ? `${cityName.toLowerCase().trim()}:${countryCode.toLowerCase()}`
        : cityName.toLowerCase().trim();

    if (_destCodeCache.has(key)) {
        const cached = _destCodeCache.get(key)!;
        return Promise.resolve(cached === 'NONE' ? undefined : cached);
    }
    const existing = _bgResolvingPromises.get(key);
    if (existing) return existing;

    const promise = (async (): Promise<string | undefined> => {
        try {
            const { getTgxConfig } = await import('@/lib/server/stays/travelgatex/client');
            const cfg = getTgxConfig();
            if (!cfg.apiKey) return undefined;
            const DEST_QUERY = `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
                   hotelX {
                     destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
                       ... on DestinationData { code type texts { text language } }
                     }
                   }
                 }`;
            const res = await fetch(cfg.endpoint, {
                method:  'POST',
                headers: { 'Authorization': `Apikey ${cfg.apiKey}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
                body:    JSON.stringify({ query: DEST_QUERY, variables: { access: cfg.accessCode, text: cityName, maxSize: 50 } }),
            });
            if (!res.ok) {
                console.warn(`[dest-resolve] HTTP ${res.status} for "${cityName}"`);
                // 5xx from TGX (e.g. 580 = "not found in access") means their
                // destinationSearcher has no coverage for this city. Cache NONE so
                // future searches skip the 30s wait entirely.
                if (res.status >= 500) {
                    try {
                        const sql = getSqlAdmin();
                        await sql`INSERT INTO tgx_destination_cache (city_key, destination_code)
                                  VALUES (${key}, 'NONE') ON CONFLICT (city_key) DO NOTHING`;
                        console.log(`[dest-resolve] Marked "${cityName}" as NONE (HTTP ${res.status})`);
                    } catch { /* non-fatal */ }
                }
                return undefined;
            }
            const result = await res.json();
            const items: any[] = result?.data?.hotelX?.destinationSearcher ?? [];
            const exactName = cityName.toLowerCase();
            const matchesName = (i: any) =>
                (i.texts ?? []).some((t: any) => t.language === 'en' && t.text.toLowerCase() === exactName);
            const cityItem = items.find((i: any) => i.type === 'CITY' && matchesName(i)) ?? items.find((i: any) => i.type === 'CITY');
            const zoneItem = items.find((i: any) => i.type === 'ZONE' && matchesName(i)) ?? items.find((i: any) => i.type === 'ZONE');
            const selectedItem = countryCode ? (zoneItem ?? cityItem) : (cityItem ?? zoneItem);
            const code      = selectedItem?.code as string | undefined;
            const dest_type = selectedItem?.type as string | undefined;
            if (code) {
                _destCodeCache.set(key, code);
                try {
                    const sql = getSqlAdmin();
                    await sql`INSERT INTO tgx_destination_cache (city_key, destination_code, dest_type)
                        VALUES (${key}, ${code}, ${dest_type ?? 'CITY'})
                        -- A fresh NONE Sentinel is still protected: it was written
                        -- deliberately and should stand for its 7 days. A stale one must be
                        -- overwritable, or a city whose sentinel the readers now ignore would
                        -- re-resolve from scratch on every single search — an 18s round-trip
                        -- each time, because the real code could never be written back.
                        ON CONFLICT (city_key) DO UPDATE SET
                            destination_code = EXCLUDED.destination_code,
                            dest_type        = EXCLUDED.dest_type,
                            created_at       = now()
                        WHERE tgx_destination_cache.destination_code != 'NONE'
                           OR tgx_destination_cache.created_at <= now() - INTERVAL '7 days'`;
                    console.log(`[dest-resolve] Resolved "${cityName}" → ${code} (${dest_type ?? 'CITY'})`);
                } catch { /* non-fatal */ }
            } else {
                console.warn(`[dest-resolve] No code found for "${cityName}"`);
            }
            return code;
        } catch (e: any) {
            console.warn(`[dest-resolve] Raw fetch failed for "${cityName}":`, e.message?.slice(0, 100));
            return undefined;
        } finally {
            _bgResolvingPromises.delete(key);
        }
    })();

    _bgResolvingPromises.set(key, promise);
    return promise;
}

/**
 * Start (or join) a background dest-code resolution and return its Promise.
 * Callers that need the code can await the returned Promise with their own timeout.
 * Previously fire-and-forget (void); now returns Promise so runCityFallback can
 * await the same ongoing fetch with extra budget after the 18s fast-path times out.
 */
export function backgroundResolveDestCode(cityName: string, countryCode?: string): Promise<string | undefined> {
    return _fetchDestCodeRaw(cityName, countryCode);
}

/** Forward-geocode a canonical city name to its centre and bounds, scoped to one
 *  country. Used to give query-side alias hits real geometry — the alias dict
 *  stores names only. Returns null when Mapbox can't place the city either. */
async function geocodeCanonicalCity(
    name: string,
    countryCode: string,
): Promise<{ lat: number; lng: number; bbox?: [number, number, number, number]; placeName: string } | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !name.trim()) return null;
    const country = countryCode ? `&country=${countryCode.toLowerCase()}` : '';
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json`
        + `?types=place,region,locality&limit=1&language=en${country}&access_token=${token}`;
    try {
        const res = await fetch(url, { next: { revalidate: 86_400 } });
        if (!res.ok) return null;
        const feature = ((await res.json()).features ?? [])[0];
        if (!feature || !Array.isArray(feature.center)) return null;
        return {
            lng: feature.center[0],
            lat: feature.center[1],
            bbox: Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox : undefined,
            placeName: feature.place_name ?? name,
        };
    } catch {
        return null;
    }
}

/** Title-case an alias key for display: 'clark freeport' → 'Clark Freeport'. */
function titleCaseAlias(alias: string): string {
    return alias.replace(/(^|[\s\-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Suggestions derived from the alias dict by matching the *user's query*, for
 * destinations Mapbox cannot return at all (e.g. "Clark" PH → Clark, New Jersey).
 * `covered` maps country code → destination names Mapbox already produced, so we
 * never emit a duplicate row for a place that resolved normally.
 */
async function fetchAliasSuggestions(
    query: string,
    covered: Map<string, string[]>,
): Promise<AutocompleteResult[]> {
    const matches = matchAliasQuery(query, 3).filter(m => {
        const canonical = m.canonicalCity.toLowerCase();
        // Suppress when Mapbox already covers this destination under a slightly
        // different name — "Boracay" (Mapbox) vs "Boracay Island" (dict). Compared
        // on whole leading words only, so "York" never swallows "New York".
        return !(covered.get(m.countryCode) ?? []).some(name =>
            name === canonical
            || canonical.startsWith(name + ' ')
            || name.startsWith(canonical + ' ')
        );
    });
    // Cap the extra geocodes: this runs inside the 300s-cached autocomplete path,
    // but an uncached keystroke shouldn't fan out into several Mapbox round-trips.
    const geocoded = await Promise.all(
        matches.slice(0, 2).map(async (m): Promise<AutocompleteResult | null> => {
            const geo = await geocodeCanonicalCity(m.canonicalCity, m.countryCode);
            if (!geo) return null;
            const displayName = titleCaseAlias(m.alias);
            const isSubArea = displayName.toLowerCase() !== m.canonicalCity.toLowerCase();
            // place_name usually already leads with the canonical city ("Angeles,
            // Philippines"), which alongside the alias title is signal enough that
            // the search runs against Angeles. Only prepend when it doesn't.
            const namesCanonical = geo.placeName.toLowerCase().startsWith(m.canonicalCity.toLowerCase());
            return {
                type: 'city' as const,
                // Alias hits search the canonical city's inventory, matching how
                // Mapbox-side alias remapping is rung'd in fetchCitiesFromMapbox.
                rung: 'city' as const,
                title: displayName,
                subtitle: isSubArea && !namesCanonical ? `${m.canonicalCity} · ${geo.placeName}` : geo.placeName,
                countryCode: m.countryCode,
                lat: geo.lat,
                lng: geo.lng,
                // Deliberately the canonical city's own bounds, not a synthetic circle
                // around the alias: we don't know where the alias sits, and guessing
                // produces a bbox that filters out every hotel in the city.
                bbox: geo.bbox,
                districtName: isSubArea ? displayName : undefined,
                canonicalCity: m.canonicalCity,
            };
        })
    );
    return geocoded.filter((r): r is AutocompleteResult => r !== null);
}

async function fetchAutocomplete(query: string, locale?: string): Promise<AutocompleteResult[]> {
    const countryResults = matchCountries(query);

    const cityResults = await fetchCitiesFromMapbox(query, locale);

    // Fill gaps in Mapbox's index from the alias dict, matched against the raw
    // query rather than Mapbox's output.
    const covered = new Map<string, string[]>();
    for (const c of cityResults) {
        const names = covered.get(c.countryCode) ?? [];
        names.push((c.canonicalCity ?? c.title).toLowerCase());
        // Also index the display title: an alias may collide with the raw Mapbox
        // name even when that result carries a different canonical city.
        if (c.canonicalCity) names.push(c.title.toLowerCase());
        covered.set(c.countryCode, names);
    }
    const aliasResults = await fetchAliasSuggestions(query, covered);

    const allCities = [...cityResults, ...aliasResults];
    if (!allCities.length) return countryResults;

    // Sort cities with hotels in our TGX inventory (hotel_content) to the top.
    // Cities we don't cover are still shown, below those we do.
    const citiesWithHotels = await filterCitiesWithHotels(allCities);
    const sorted = [
        ...allCities.filter(c => citiesWithHotels.has((c.canonicalCity ?? c.title).toLowerCase())),
        ...allCities.filter(c => !citiesWithHotels.has((c.canonicalCity ?? c.title).toLowerCase())),
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
