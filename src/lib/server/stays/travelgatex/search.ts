/**
 * TravelgateX hotel search — core logic, no HTTP layer.
 * Called directly by server routes to avoid HTTP self-call overhead.
 */

import { tgxGraphQL, getTgxSettings, getTgxConfig, buildOccupancies, normalizeOption, type TgxOption } from './client';
import { getSqlAdmin } from '@/lib/db/postgres';
import { resolveTgxDestinationCode } from '@/lib/server/search';
import { otvCodeToLabel } from './amenityCodes';

// ─── Country bounding boxes for geographic hotel filtering ───────────────────
// Used to reject OTV portfolio hotels that are in the wrong country.
// Bounding boxes are intentionally generous (±2° buffer) to avoid false negatives.
const COUNTRY_BBOX: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
    TH: { minLat: 3.6, maxLat: 22.5, minLng: 95.3, maxLng: 107.7 },
    ID: { minLat: -13.0, maxLat: 7.9, minLng: 93.0, maxLng: 143.0 },
    JP: { minLat: 22.0, maxLat: 47.5, minLng: 120.9, maxLng: 147.8 },
    PH: { minLat: 4.6, maxLat: 21.1, minLng: 116.9, maxLng: 128.0 },
    SG: { minLat: 1.1, maxLat: 1.6, minLng: 103.6, maxLng: 104.1 },
    MY: { minLat: -0.2, maxLat: 8.5, minLng: 99.6, maxLng: 119.5 },
    VN: { minLat: 8.2, maxLat: 23.4, minLng: 102.1, maxLng: 109.5 },
    KH: { minLat: 9.4, maxLat: 14.7, minLng: 102.3, maxLng: 107.6 },
    IN: { minLat: 6.7, maxLat: 37.1, minLng: 68.2, maxLng: 97.4 },
    CN: { minLat: 18.2, maxLat: 53.6, minLng: 73.5, maxLng: 134.8 },
    KR: { minLat: 33.1, maxLat: 38.6, minLng: 125.1, maxLng: 130.9 },
    AU: { minLat: -43.7, maxLat: -10.7, minLng: 113.2, maxLng: 153.6 },
    NZ: { minLat: -47.3, maxLat: -34.4, minLng: 166.4, maxLng: 178.6 },
    MV: { minLat: -1.0, maxLat: 7.1, minLng: 72.7, maxLng: 73.8 },
    LK: { minLat: 5.9, maxLat: 9.8, minLng: 79.7, maxLng: 81.9 },
    AE: { minLat: 22.6, maxLat: 26.1, minLng: 51.6, maxLng: 56.4 },
    TR: { minLat: 35.8, maxLat: 42.1, minLng: 25.7, maxLng: 44.8 },
    GR: { minLat: 34.8, maxLat: 41.8, minLng: 19.4, maxLng: 29.6 },
    IT: { minLat: 36.6, maxLat: 47.1, minLng: 6.7, maxLng: 18.5 },
    ES: { minLat: 27.6, maxLat: 43.8, minLng: -18.2, maxLng: 4.3 },
    FR: { minLat: 41.3, maxLat: 51.1, minLng: -5.2, maxLng: 9.6 },
    DE: { minLat: 47.3, maxLat: 55.1, minLng: 5.9, maxLng: 15.0 },
    PT: { minLat: 29.8, maxLat: 42.2, minLng: -31.3, maxLng: -6.2 },
    GB: { minLat: 49.9, maxLat: 60.8, minLng: -8.6, maxLng: 1.8 },
    US: { minLat: 18.9, maxLat: 71.4, minLng: -179.1, maxLng: -66.9 },
    MX: { minLat: 14.5, maxLat: 32.7, minLng: -117.1, maxLng: -86.7 },
    BR: { minLat: -33.8, maxLat: 5.3, minLng: -73.9, maxLng: -34.8 },
    MA: { minLat: 27.7, maxLat: 35.9, minLng: -13.2, maxLng: -1.0 },
    EG: { minLat: 22.0, maxLat: 31.7, minLng: 24.7, maxLng: 37.0 },
    KE: { minLat: -4.7, maxLat: 4.6, minLng: 33.9, maxLng: 41.9 },
    ZA: { minLat: -34.8, maxLat: -22.1, minLng: 16.5, maxLng: 32.9 },
    IS: { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 },
    HK: { minLat: 22.1, maxLat: 22.6, minLng: 113.8, maxLng: 114.5 },
};

function filterByCountryBbox(
    codes: string[],
    contentMap: Map<string, any>,
    countryCode?: string,
): string[] {
    if (!countryCode) return codes;
    const bbox = COUNTRY_BBOX[countryCode.toUpperCase()];
    if (!bbox) return codes;
    const filtered = codes.filter(code => {
        const c = contentMap.get(code);
        if (!c) return false;
        const lat = c.lat as number;
        const lng = c.lng as number;
        if (!lat && !lng) return false; // no coords → exclude
        return lat >= bbox.minLat && lat <= bbox.maxLat &&
               lng >= bbox.minLng && lng <= bbox.maxLng;
    });
    return filtered;
}

// ─── ETG (RateHawk/WorldOTA) hotel name lookup ───────────────────────────────

/** Fetch hotel names from the ETG B2B API for IDs where OTV returned null hotelName.
 *  ETG and OTV share the same underlying RateHawk data; this endpoint reliably returns names. */
async function fetchEtgHotelNames(hotelIds: string[]): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();
    if (!hotelIds.length) return nameMap;
    const keyId  = process.env.ETG_KEY_ID;
    const apiKey = process.env.ETG_API_KEY;
    if (!keyId || !apiKey) return nameMap;
    const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    const BATCH = 500;
    for (let i = 0; i < hotelIds.length; i += BATCH) {
        const batch = hotelIds.slice(i, i + BATCH);
        try {
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 5_000);
            const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: batch, language: 'en' }),
                signal: abort.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) { console.warn(`[tgx-search] ETG hotel/info ${res.status}`); continue; }
            const json = await res.json();
            const hotels: any[] = json?.data?.hotels ?? json?.hotels ?? [];
            for (const h of hotels) {
                const id   = String(h.id ?? h.hotel_id ?? '');
                const name = (h.name ?? h.title ?? '') as string;
                if (id && name) nameMap.set(id, name);
            }
        } catch (e: any) {
            if ((e as any)?.name !== 'AbortError') console.warn('[tgx-search] ETG hotel/info batch failed:', e.message);
        }
    }
    console.log(`[tgx-search] ETG hotel/info returned ${nameMap.size}/${hotelIds.length} names`);
    return nameMap;
}

/** Persist ETG-sourced names into hotel_content.
 *  Uses UPSERT so it works whether backfillHotelContent has run yet or not. */
async function updateHotelNamesInDb(nameMap: Map<string, string>): Promise<void> {
    if (!nameMap.size) return;
    const sql = getSqlAdmin();
    let saved = 0;
    for (const [hotelId, name] of nameMap) {
        try {
            await sql`
                INSERT INTO hotel_content (hotel_id, name, images, content_source, fetched_at)
                VALUES (${hotelId}, ${name}, '{}', 'etg', now())
                ON CONFLICT (hotel_id) DO UPDATE SET
                    name       = CASE WHEN hotel_content.name IS NULL OR hotel_content.name = hotel_content.hotel_id
                                      THEN EXCLUDED.name ELSE hotel_content.name END,
                    fetched_at = now()
            `;
            saved++;
        } catch { /* skip individual failures */ }
    }
    if (saved) console.log(`[tgx-search] Upserted ${saved} ETG hotel names into hotel_content`);
}

// ─── ETG B2B direct search (fallback for cities OTV/TGX doesn't serve) ──────

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
    'indonesia': 'ID', 'france': 'FR', 'italy': 'IT', 'spain': 'ES', 'germany': 'DE',
    'japan': 'JP', 'thailand': 'TH', 'greece': 'GR', 'united states': 'US', 'usa': 'US',
    'australia': 'AU', 'philippines': 'PH', 'south korea': 'KR', 'korea': 'KR',
    'vietnam': 'VN', 'cambodia': 'KH', 'singapore': 'SG', 'malaysia': 'MY',
    'india': 'IN', 'china': 'CN', 'hong kong': 'HK', 'taiwan': 'TW',
    'peru': 'PE', 'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR',
    'egypt': 'EG', 'tanzania': 'TZ', 'south africa': 'ZA', 'kenya': 'KE',
    'iceland': 'IS', 'maldives': 'MV', 'uae': 'AE', 'united arab emirates': 'AE',
    'turkey': 'TR', 'morocco': 'MA', 'jordan': 'JO', 'new zealand': 'NZ', 'canada': 'CA',
};

function resolveIsoCodeEtg(raw?: string): string | null {
    if (!raw) return null;
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    return COUNTRY_NAME_TO_ISO[raw.toLowerCase()] ?? null;
}

function getEtgToken(): string {
    const keyId  = process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

/** Resolve a city name to an ETG region_id via the multicomplete endpoint. */
async function getEtgRegionId(cityName: string, countryCode?: string): Promise<number | null> {
    try {
        const token = getEtgToken();
        const query = cityName.split(',')[0].trim();
        const abort = new AbortController();
        const t = setTimeout(() => abort.abort(), 5_000);
        const res = await fetch('https://api.worldota.net/api/b2b/v3/search/multicomplete/', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, language: 'en' }),
            signal: abort.signal,
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const data = await res.json();
        const regions: any[] = data?.data?.regions ?? [];
        const iso = resolveIsoCodeEtg(countryCode);
        const q = query.toLowerCase();
        const nameMatches = (r: any) => typeof r?.name === 'string' && r.name.toLowerCase().startsWith(q);
        const inCountry = (r: any) => !iso || r.country_code === iso;

        // A city and the area around it can share a name ("Cebu" the city vs Cebu the
        // province). Resolve a city first so existing city searches never regress, then
        // fall back to area-level regions so province/region queries ("Palawan") resolve
        // to the whole area — matching what Ratehawk's own site returns. Kept as an
        // allow-list so airports, whole countries, continents and seas are never picked.
        // Exact ETG multicomplete `type` strings (verified against live responses —
        // note the spaces/hyphens, e.g. Palawan comes back as "Multi-City (Vicinity)").
        const AREA_TYPES = new Set([
            'Province (State)',
            'Region',
            'Multi-City (Vicinity)',
            'Multi-Region (within a country)',
        ]);
        const isCity = (r: any) => r?.type === 'City';
        const isArea = (r: any) => AREA_TYPES.has(r?.type);

        const pick =
            regions.find((r: any) => isCity(r) && nameMatches(r) && inCountry(r)) ??
            regions.find((r: any) => isCity(r) && nameMatches(r)) ??
            regions.find((r: any) => isArea(r) && nameMatches(r) && inCountry(r)) ??
            regions.find((r: any) => isArea(r) && nameMatches(r));

        if (!pick) {
            // No city or known area type matched. Surface the types ETG actually returned
            // so an unmapped area label is a one-line allow-list fix, not a silent miss.
            const seen = regions.filter(nameMatches).map((r: any) => r.type);
            console.warn(`[tgx-search] ETG multicomplete: no city/area match for "${query}" — types seen: ${seen.join(', ') || '(none)'}`);
        }
        return pick?.id ?? null;
    } catch {
        return null;
    }
}

/** Fetch full hotel details from ETG B2B for a single hotel id slug. */
async function fetchEtgHotelInfo(id: string): Promise<any | null> {
    try {
        const token = getEtgToken();
        const abort = new AbortController();
        const t = setTimeout(() => abort.abort(), 4_000);
        const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, language: 'en' }),
            signal: abort.signal,
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data ?? null;
    } catch {
        return null;
    }
}

/** Background: seed hotel_content with ETG hotel data for a city (fire-and-forget). */
async function seedEtgHotelContent(hotels: any[], cityName: string, countryCode?: string): Promise<void> {
    const sql = getSqlAdmin();
    const PARALLEL = 10;
    const MAX = Math.min(150, hotels.length);
    let saved = 0;
    for (let i = 0; i < MAX; i += PARALLEL) {
        const batch = hotels.slice(i, i + PARALLEL);
        const infos = await Promise.allSettled(batch.map((h: any) => fetchEtgHotelInfo(h.id)));
        for (let j = 0; j < batch.length; j++) {
            const r = infos[j];
            if (r.status !== 'fulfilled' || !r.value) continue;
            const info = r.value;
            const images: string[] = (info.images ?? [])
                .map((url: string) => (typeof url === 'string' ? url.replace('{size}', '640x400') : ''))
                .filter(Boolean)
                .slice(0, 10);
            try {
                await sql`
                    INSERT INTO hotel_content
                        (hotel_id, name, images, lat, lng, address, city, country,
                         description, star_rating, amenities, content_source, fetched_at)
                    VALUES (
                        ${info.id}, ${info.name ?? null}, ${sql.array(images)},
                        ${info.latitude ?? 0}, ${info.longitude ?? 0},
                        ${info.address ?? null}, ${cityName}, ${countryCode ?? null},
                        ${null}, ${info.star_rating ?? 0}, ${'[]'}::jsonb,
                        'etg', now()
                    )
                    ON CONFLICT (hotel_id) DO UPDATE SET
                        name        = CASE WHEN hotel_content.name IS NULL OR hotel_content.name = hotel_content.hotel_id
                                          THEN EXCLUDED.name ELSE hotel_content.name END,
                        images      = CASE WHEN array_length(hotel_content.images, 1) > 0
                                     THEN hotel_content.images ELSE EXCLUDED.images END,
                        lat         = CASE WHEN hotel_content.lat  != 0 THEN hotel_content.lat  ELSE EXCLUDED.lat  END,
                        lng         = CASE WHEN hotel_content.lng  != 0 THEN hotel_content.lng  ELSE EXCLUDED.lng  END,
                        address     = COALESCE(hotel_content.address, EXCLUDED.address),
                        city        = COALESCE(hotel_content.city, EXCLUDED.city),
                        star_rating = CASE WHEN hotel_content.star_rating != 0
                                     THEN hotel_content.star_rating ELSE EXCLUDED.star_rating END,
                        content_source = COALESCE(hotel_content.content_source, 'etg'),
                        fetched_at  = now()
                `;
                saved++;
            } catch { /* skip */ }
        }
        if (i + PARALLEL < MAX) await new Promise(r => setTimeout(r, 3_000));
    }
    console.log(`[tgx-search] ETG seeded ${saved}/${MAX} hotels for "${cityName}" into hotel_content`);
}

/** Search ETG B2B directly by city when OTV/TGX yields no results. */
async function searchEtgCity(
    cityName: string,
    params: TgxSearchParams,
): Promise<{ data: any[]; allMappable: any[]; totalCount: number }> {
    const empty = { data: [], allMappable: [], totalCount: 0 };
    try {
        if (!process.env.ETG_KEY_ID || !process.env.ETG_API_KEY) return empty;
        const token = getEtgToken();

        const regionId = await getEtgRegionId(cityName, params.countryCode);
        if (!regionId) {
            console.warn(`[tgx-search] ETG: no region_id for "${cityName}"`);
            return empty;
        }
        console.log(`[tgx-search] ETG fallback: region ${regionId} for "${cityName}" (${params.checkin}→${params.checkout})`);

        const serpAbort = new AbortController();
        const serpTimeout = setTimeout(() => serpAbort.abort(), 20_000);
        const serpRes = await fetch('https://api.worldota.net/api/b2b/v3/search/serp/region/', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region_id: regionId,
                checkin:   params.checkin,
                checkout:  params.checkout,
                guests:    [{ adults: Number(params.adults ?? 2) }],
                currency:  'USD',
                language:  'en',
                residency: 'us',
            }),
            signal: serpAbort.signal,
        });
        clearTimeout(serpTimeout);

        if (!serpRes.ok) { console.warn(`[tgx-search] ETG SERP ${serpRes.status}`); return empty; }

        const serpData = await serpRes.json();
        const hotels: any[] = serpData?.data?.hotels ?? [];
        console.log(`[tgx-search] ETG SERP: ${hotels.length} hotels for "${cityName}"`);
        if (!hotels.length) return empty;

        // Sort cheapest-first
        hotels.sort((a: any, b: any) => {
            const pa = parseFloat(a.rates?.[0]?.payment_options?.payment_types?.[0]?.show_amount ?? '999999');
            const pb = parseFloat(b.rates?.[0]?.payment_options?.payment_types?.[0]?.show_amount ?? '999999');
            return pa - pb;
        });

        const allIds = hotels.map((h: any) => h.id as string);

        // Use any pre-existing hotel_content data
        const existingContent = await fetchHotelContent(allIds);
        const needInfo = hotels.filter((h: any) => !existingContent.get(h.id)?.name);

        // Parallel info fetch for hotels missing names (cap at 15 to stay within rate limit)
        const toFetch = needInfo.slice(0, 15);
        const infoResults = toFetch.length > 0
            ? await Promise.allSettled(toFetch.map((h: any) => fetchEtgHotelInfo(h.id as string)))
            : [];

        const infoMap = new Map<string, any>();
        for (let i = 0; i < toFetch.length; i++) {
            const r = infoResults[i];
            if (r.status === 'fulfilled' && r.value) infoMap.set(toFetch[i].id as string, r.value);
        }

        // Background-seed hotel_content for all results (Phase 1 catalog for future searches)
        seedEtgHotelContent(hotels, cityName, params.countryCode).catch(() => {});

        const results = hotels.map((h: any) => {
            const rate = h.rates?.[0];
            const pt   = rate?.payment_options?.payment_types?.[0];
            const price    = parseFloat(pt?.show_amount    ?? '0');
            const currency = (pt?.show_currency_code ?? 'USD') as string;

            const dbContent = existingContent.get(h.id as string);
            const etgInfo   = infoMap.get(h.id as string);
            const src       = (dbContent?.name ? dbContent : null) ?? etgInfo;

            const rawImages: string[] = src?.images ?? [];
            const images = rawImages
                .map((url: string) => (typeof url === 'string' ? url.replace('{size}', '640x400') : ''))
                .filter(Boolean)
                .slice(0, 10);

            const lat = Number(src?.latitude ?? src?.lat ?? 0);
            const lng = Number(src?.longitude ?? src?.lng ?? 0);

            return {
                hotelId:      h.id,
                id:           h.id,
                name:         dbContent?.name ?? etgInfo?.name ?? h.id,
                price,
                currency,
                offerId:      `ETG:${h.id}:${rate?.match_hash ?? ''}`,
                refundableTag: 'UNKNOWN',
                starRating:   Number(src?.star_rating ?? 0),
                images,
                image:        images[0] ?? '',
                lat,
                lng,
                coordinates:  { lat, lng },
                address:      src?.address ?? '',
                location:     src?.address ?? '',
                city:         cityName,
                country:      params.countryCode ?? '',
                description:  '',
                amenities:    [],
                reviewRating: Number(dbContent?.review_rating ?? 0),
                rating:       Number(dbContent?.review_rating ?? 0),
                reviews:      Number(dbContent?.review_count ?? 0),
                reviewCount:  Number(dbContent?.review_count ?? 0),
                boardCode:    rate?.meal ?? 'RO',
                roomTypes:    [],
                provider:     'etg',
            };
        });

        const allMappable = results.filter(h => h.lat && h.lng);
        return { data: results, allMappable, totalCount: results.length };
    } catch (e: any) {
        console.warn('[tgx-search] ETG city search failed:', e.message);
        return empty;
    }
}

// ─── Hotel search cache ───────────────────────────────────────────────────────

export const POPULAR_CITIES = new Set([
    'tokyo', 'bangkok', 'seoul', 'singapore', 'paris',
    'london', 'new york', 'dubai', 'barcelona', 'bali',
]);

export function isPopularCity(cityName: string): boolean {
    return POPULAR_CITIES.has(cityName.toLowerCase().trim());
}

export function getEffectiveTtl(cityName?: string): number {
    const standardTtl = parseInt(process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES          ?? '120', 10);
    const popularTtl  = parseInt(process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES   ?? '360', 10);
    return cityName && isPopularCity(cityName) ? popularTtl : standardTtl;
}

function buildHotelCacheKey(p: TgxSearchParams): string {
    const location = p.hotelCode
        ? `hotel:${p.hotelCode}`
        : p.destinationCode
        ? `dest:${p.destinationCode}`
        : `city:${(p.cityName ?? '').toLowerCase().trim()}`;
    return [
        location,
        p.checkin,
        p.checkout,
        String(p.adults ?? 2),
        String(p.children ?? 0),
        p.guest_nationality ?? 'KR',
    ].join('|');
}

async function getHotelSearchCache(key: string, ttlMinutes: number): Promise<{ result: any; stale: boolean } | null> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql`
            SELECT result, (expires_at <= now()) AS stale
            FROM hotel_search_cache
            WHERE cache_key = ${key}
              AND expires_at > now() - (${ttlMinutes} * interval '1 minute')
            LIMIT 1
        `;
        if (!rows[0]) return null;
        return { result: rows[0].result, stale: Boolean(rows[0].stale) };
    } catch {
        return null;
    }
}

async function setHotelSearchCache(key: string, result: any, ttlMinutes: number): Promise<void> {
    try {
        const sql = getSqlAdmin();
        await sql`
            INSERT INTO hotel_search_cache (cache_key, result, expires_at)
            VALUES (${key}, ${sql.json(result)}, now() + ${`${ttlMinutes} minutes`}::interval)
            ON CONFLICT (cache_key) DO UPDATE
                SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at, created_at = now()
        `;
    } catch (e: any) {
        console.error('[hotel-cache] Write failed:', e.message);
    }
}

// ─── GraphQL queries ──────────────────────────────────────────────────────────

const CITY_SEARCH_QUERY = `
query TgxCitySearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      options {
        id hotelCode boardCode paymentType status
        price { currency net gross }
        token
        rooms { description }
        cancelPolicy { refundable }
      }
      errors { code type description }
    }
  }
}`;

const HOTEL_SEARCH_QUERY = `
query TgxHotelSearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      options {
        id hotelCode boardCode paymentType status
        price { currency net gross }
        token
        rooms { occupancyRefId code description }
        cancelPolicy {
          refundable
          cancelPenalties { deadline hoursBefore penaltyType currency value }
        }
      }
      errors { code type description }
    }
  }
}`;

// ─── DB enrichment ────────────────────────────────────────────────────────────

async function fetchHotelContent(hotelCodes: string[]) {
    if (!hotelCodes.length) return new Map<string, any>();
    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT hotel_id, name, images, star_rating, lat, lng, address, city, country,
               description, amenities, review_rating, review_count, check_in_time, check_out_time,
               ratehawk_hid
        FROM hotel_content
        WHERE hotel_id = ANY(${hotelCodes})
    `;
    const map = new Map<string, any>();
    for (const row of rows) map.set(row.hotel_id, row);
    return map;
}

async function fetchHotelReviews(hotelCodes: string[]) {
    if (!hotelCodes.length) return new Map<string, any>();
    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT hotel_id, rating, reviews_count
        FROM hotel_reviews
        WHERE hotel_id = ANY(${hotelCodes})
    `;
    const map = new Map<string, any>();
    for (const row of rows) map.set(row.hotel_id, row);
    return map;
}


async function fetchHotelCodesByCity(cityName: string, countryCode?: string): Promise<string[]> {
    const sql = getSqlAdmin();
    // Normalize: strip suffixes like "-si", "-do", "-gu" common in Korean city names
    const cityOnly = cityName.split(',')[0].trim();
    const normalized = cityOnly.replace(/-(si|do|gu|gun|eup)$/i, '').trim();
    const pattern = `%${normalized}%`;
    // Only filter by country when it's a 2-letter ISO code (DB stores "JP" not "Japan")
    const isoCode = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : null;
    const rows = isoCode
        ? await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern} AND LOWER(country) = LOWER(${isoCode})
            LIMIT 1000
          `
        : await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern}
            LIMIT 1000
          `;
    return rows.map((r: any) => r.hotel_id);
}

// ─── Search params ────────────────────────────────────────────────────────────

export interface TgxSearchParams {
    checkin: string;
    checkout: string;
    adults?: number;
    children?: number;
    childrenAges?: number[];
    currency?: string;
    guest_nationality?: string;
    destinationCode?: string;
    cityName?: string;
    countryCode?: string;
    hotelCode?: string;
    rooms?: number;
}

// ─── Core search function ─────────────────────────────────────────────────────

/** Parse raw TGX portfolio edges into a content map keyed by hotel code. */
function parseOtvEdges(edges: any[], cityName: string): Map<string, any> {
    const map = new Map<string, any>();
    for (const e of edges) {
        const d = e?.node?.hotelData;
        if (!d?.code) continue;

        // OTV uses type "GENERAL" for all photos — accept any URL regardless of type
        const images: string[] = (d.medias ?? [])
            .map((m: any) => m.url as string)
            .filter(Boolean)
            .slice(0, 10);

        let description: string | null = null;
        for (const desc of (d.descriptions ?? [])) {
            const en = (desc.texts ?? []).find((t: any) => t.language?.toLowerCase().startsWith('en'));
            if (en?.text) { description = en.text; break; }
        }
        if (!description) description = d.descriptions?.[0]?.texts?.[0]?.text ?? null;

        const catCode: string = d.categoryCode ?? '';
        const starMatch = catCode.match(/(\d)/);

        map.set(String(d.code), {
            hotel_id:    String(d.code),
            name:        (d.hotelName as string | null) ?? null,
            images,
            lat:         Number(d.location?.coordinates?.latitude  ?? 0),
            lng:         Number(d.location?.coordinates?.longitude ?? 0),
            address:     (d.location?.address as string | null) ?? null,
            city:        cityName,
            country:     null,
            description,
            star_rating: starMatch ? parseInt(starMatch[1], 10) : 0,
            amenities:   (d.amenities ?? []).map((a: any) => otvCodeToLabel(a.code)).filter(Boolean),
        });
    }
    return map;
}

/** Query TGX's OTV hotel portfolio to discover hotel codes for a city not yet in our DB.
 *  Returns both codes and the full content map so the caller can use names/images immediately. */
async function fetchOtvHotelCodesByCity(
    cityName: string,
    destinationCode?: string,
): Promise<{ codes: string[]; contentMap: Map<string, any> }> {
    try {
        const cfg = getTgxConfig();
        const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: 200 };
        if (destinationCode) criteria.destinationCodes = [destinationCode];

        const result = await tgxGraphQL(
            `query OtvHotelPortfolio($criteria: HotelXHotelListInput!) {
               hotelX {
                 hotels(criteria: $criteria) {
                   edges {
                     node {
                       hotelData {
                         code
                         hotelName
                         categoryCode
                         descriptions { type texts { language text } }
                         medias { url type }
                         location {
                           coordinates { latitude longitude }
                           address
                         }
                         amenities { code }
                       }
                     }
                   }
                 }
               }
             }`,
            { criteria }
        );

        const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
        const contentMap = parseOtvEdges(edges, cityName);
        const codes = [...contentMap.keys()];
        console.log(`[tgx-search] OTV portfolio returned ${codes.length} hotel codes for "${cityName}"`);

        if (codes.length > 0) {
            backfillHotelContent(contentMap).catch((err: any) =>
                console.warn('[tgx-search] hotel_content backfill failed:', err.message)
            );
            // OTV often has null hotelName for European/global cities.
            // Enrich null-name rows from ETG now so hotel_content (Phase 1 catalog)
            // always shows real names — even when TGX availability returns 0 options.
            const nullNameCodes = codes.filter(c => !contentMap.get(c)?.name);
            if (nullNameCodes.length > 0) {
                fetchEtgHotelNames(nullNameCodes)
                    .then(etgNames => {
                        if (etgNames.size > 0) {
                            // Patch contentMap so the current request can use names too
                            for (const [id, name] of etgNames) {
                                const row = contentMap.get(id);
                                if (row) row.name = name;
                            }
                            updateHotelNamesInDb(etgNames).catch(() => {});
                        }
                    })
                    .catch(() => {});
            }
        }

        return { codes, contentMap };
    } catch (e: any) {
        console.warn('[tgx-search] OTV portfolio query failed:', e.message);
        return { codes: [], contentMap: new Map() };
    }
}

/** Upsert hotel content from a parsed OTV map into hotel_content.
 *  Runs fire-and-forget — never overwrites richer existing data. */
async function backfillHotelContent(contentMap: Map<string, any>): Promise<void> {
    const sql = getSqlAdmin();
    let saved = 0;
    for (const r of contentMap.values()) {
        try {
            await sql`
                INSERT INTO hotel_content
                    (hotel_id, name, images, lat, lng, address, city, country,
                     description, star_rating, amenities, content_source, fetched_at)
                VALUES (
                    ${r.hotel_id}, ${r.name}, ${sql.array(r.images)},
                    ${r.lat}, ${r.lng}, ${r.address}, ${r.city}, ${r.country},
                    ${r.description}, ${r.star_rating}, ${JSON.stringify(r.amenities)}::jsonb,
                    'tgx', now()
                )
                ON CONFLICT (hotel_id) DO UPDATE SET
                    name        = CASE WHEN hotel_content.name IS NULL
                                       OR hotel_content.name = hotel_content.hotel_id
                                  THEN EXCLUDED.name ELSE hotel_content.name END,
                    images      = CASE WHEN array_length(hotel_content.images, 1) > 0
                                  THEN hotel_content.images ELSE EXCLUDED.images END,
                    lat         = CASE WHEN hotel_content.lat  != 0 THEN hotel_content.lat  ELSE EXCLUDED.lat  END,
                    lng         = CASE WHEN hotel_content.lng  != 0 THEN hotel_content.lng  ELSE EXCLUDED.lng  END,
                    address     = COALESCE(hotel_content.address,     EXCLUDED.address),
                    city        = COALESCE(hotel_content.city,        EXCLUDED.city),
                    country     = COALESCE(hotel_content.country,     EXCLUDED.country),
                    description = COALESCE(hotel_content.description, EXCLUDED.description),
                    star_rating = CASE WHEN hotel_content.star_rating != 0
                                  THEN hotel_content.star_rating ELSE EXCLUDED.star_rating END,
                    amenities   = CASE WHEN jsonb_array_length(hotel_content.amenities) > 0
                                  THEN hotel_content.amenities ELSE EXCLUDED.amenities END,
                    content_source = COALESCE(hotel_content.content_source, 'tgx'),
                    fetched_at  = now()
            `;
            saved++;
        } catch {
            // Skip individual failures — don't abort the batch
        }
    }
    console.log(`[tgx-search] hotel_content backfilled ${saved} hotels`);
}

/** Collapse punctuation/stopwords so near-identical hotel names (OTV dupes) merge. */
function normalizeHotelName(name: string): string {
    return name
        .toLowerCase()
        .replace(/'/g, '')           // possessives: paul's → pauls (not "paul s")
        .replace(/[^\w\s]/g, ' ')   // other punctuation → space
        .replace(/\b(hotel|the|a|an|london|paris|tokyo|city|of|in|at|by|for|uk|england)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasEmptyHotelsError(errors: any[]): boolean {
    return errors.some(
        (e) => e.code === 'WRONG_FIELD' && e.description?.toLowerCase().includes('empty hotels')
    );
}

// In-process set of TGX destination codes that returned "Empty hotels" for OTV.
// Seeded from DB on first use so cold starts also skip known-bad codes.
const _failedDestCodes = new Set<string>();
let _failedDestCodesPromise: Promise<void> | null = null;

function loadFailedDestCodes(): Promise<void> {
    if (_failedDestCodesPromise) return _failedDestCodesPromise;
    _failedDestCodesPromise = (async () => {
        try {
            const sql = getSqlAdmin();
            const rows = await sql`SELECT dest_code FROM tgx_failed_dest_codes`;
            for (const r of rows) _failedDestCodes.add(r.dest_code as string);
            if (rows.length) console.log(`[tgx-search] Loaded ${rows.length} known-bad dest codes from DB`);
        } catch (e: any) {
            console.warn('[tgx-search] Could not load tgx_failed_dest_codes:', e.message);
        }
    })();
    return _failedDestCodesPromise;
}

function persistFailedDestCode(destCode: string, cityName = ''): void {
    _failedDestCodes.add(destCode);
    getSqlAdmin()`
        INSERT INTO tgx_failed_dest_codes (dest_code, city_key)
        VALUES (${destCode}, ${cityName})
        ON CONFLICT (dest_code) DO NOTHING
    `.catch((e: any) => console.warn('[tgx-search] Could not persist failed dest code:', e.message));
}

// In-flight deduplication: when two requests arrive with the same cache key before
// either has written a result (cache stampede), the second waits for the first
// promise instead of firing a second TGX call that OTV will throttle.
const _inflight = new Map<string, Promise<any>>();

// Tracks keys currently being refreshed in the background (stale-while-revalidate).
// Prevents duplicate background refreshes when multiple requests hit a stale entry.
const _backgroundRefreshing = new Set<string>();

// ─── City search fallback ─────────────────────────────────────────────────────
// Called for every city-name search (OTV never accepts free-text city names as
// destination identifiers) and as the fallback when a destination-code search
// returns empty.

async function runCityFallback(
    cityName: string,
    countryCode: string | undefined,
    baseCriteria: Record<string, unknown>,
    settings: ReturnType<typeof getTgxSettings>,
    prefetchDestCode: Promise<string | undefined>,
    prefetchHotelCodes: Promise<string[]>,
    searchParams: TgxSearchParams,
) {
    // Ensure the DB-persisted failed codes are loaded before we check the set.
    await loadFailedDestCodes();

    // 1. Try TGX destination code first — gives full city catalog, not just DB snapshot.
    console.warn(`[tgx-search] OTV destination search empty for "${cityName}" — resolving TGX destination code`);
    const resolvedCode = await prefetchDestCode;
    if (resolvedCode) {
        console.log(`[tgx-search] Got TGX destination code "${resolvedCode}" for "${cityName}" — searching`);
        if (_failedDestCodes.has(resolvedCode)) {
            // OTV has no availability for this dest code — skip the 18-22s dest-code
            // round-trip and fall through to the hotel-code path below.
            console.log(`[tgx-search] Dest code "${resolvedCode}" is a known OTV miss — skipping dest-code search for "${cityName}"`);
        } else {
            const __t0 = Date.now();
            const destResult = await tgxGraphQL(CITY_SEARCH_QUERY, {
                criteria: { ...baseCriteria, destinations: [resolvedCode] },
                settings,
            });
            console.log(`[tgx-search][TIMING] dest-code round-trip for "${resolvedCode}" took ${Date.now() - __t0}ms`);
            const destOptions: TgxOption[] = destResult?.data?.hotelX?.search?.options || [];
            const destErrors: any[] = destResult?.data?.hotelX?.search?.errors || [];
            const destMerchant = destOptions.filter(
                (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
            );
            if (destMerchant.length > 0) {
                console.log(`[tgx-search] Destination-code search returned ${destMerchant.length} options for "${cityName}"`);
                // Dest-code path never calls fetchOtvHotelCodesByCity, so hotel_content stays empty.
                // Seed it now (background) so the instant catalog shows up on the next request.
                if (cityName) {
                    fetchOtvHotelCodesByCity(cityName, resolvedCode)
                        .then(otv => {
                            if (otv.codes.length > 0) {
                                const nullNames = otv.codes.filter(c => !otv.contentMap.get(c)?.name);
                                if (nullNames.length > 0) {
                                    fetchEtgHotelNames(nullNames)
                                        .then(etgNames => updateHotelNamesInDb(etgNames))
                                        .catch(() => {});
                                }
                            }
                        })
                        .catch(() => {});
                }
                return buildCityResults(destMerchant, cityName, countryCode);
            }
            // No usable MERCHANT options — whether TGX sent an explicit "Empty hotels"
            // error or just a clean empty array (observed for some destination codes,
            // e.g. Tokyo's 504948), this code isn't yielding results either way.
            // Persist so subsequent cold starts also skip this 18-22s round-trip.
            // WRONG_FIELD/Empty hotels = TGX mapping gap (OTV was never called).
            // Don't blacklist — the city may have OTV coverage once TGX mapping syncs.
            if (hasEmptyHotelsError(destErrors)) {
                console.warn(`[tgx-search] Dest code "${resolvedCode}" has TGX mapping gap (Empty hotels) — not recorded as OTV miss`);
            } else {
                persistFailedDestCode(resolvedCode, cityName);
                if (destErrors.length) {
                    console.warn('[tgx-search] Destination-code search errors:', destErrors.map((e: any) => e.description || e.code).join(', '));
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" had errors and 0 merchant options — recorded as OTV miss`);
                } else {
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" returned 0 options with no errors — recorded as OTV miss`);
                }
            }
        }
    }

    // 2. DB hotel codes (prefetch resolves in <1s — typically already done by now)
    console.warn(`[tgx-search] Destination-code search empty for "${cityName}" — trying hotel-code search`);
    let otvCodes = await prefetchHotelCodes;
    let otvContentMap = new Map<string, any>();

    if (otvCodes.length === 0) {
        console.log(`[tgx-search] DB empty for "${cityName}" — querying OTV portfolio`);
        const otv = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined);
        const filteredCodes = filterByCountryBbox(otv.codes, otv.contentMap, countryCode);
        if (filteredCodes.length < otv.codes.length) {
            console.warn(`[tgx-search] Filtered ${otv.codes.length - filteredCodes.length} out-of-country hotels for "${cityName}" (${countryCode}) — likely OTV dest-code mismatch`);
        }
        otvCodes = filteredCodes;
        otvContentMap = otv.contentMap;
    } else {
        // Codes exist in DB — sample up to 20 to detect null-name rows (OTV data quality gap).
        // If >40% are nameless, refresh from OTV portfolio so this response can show real names
        // and backfillHotelContent updates the DB for future requests.
        const sample = otvCodes.slice(0, 20);
        const sampleContent = await fetchHotelContent(sample);
        const missingNames = sample.filter(c => !sampleContent.get(c)?.name).length;
        if (missingNames > sample.length * 0.4) {
            console.log(`[tgx-search] ${missingNames}/${sample.length} sampled hotels have no name for "${cityName}" — refreshing OTV portfolio`);
            const otv = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined);
            otvContentMap = otv.contentMap;
            if (otv.codes.length > 0) {
                otvCodes = filterByCountryBbox(otv.codes, otv.contentMap, countryCode);
            }
        }
    }

    if (otvCodes.length > 0) {
        console.log(`[tgx-search] Searching TGX with ${otvCodes.length} OTV hotel codes for "${cityName}"`);

        const CHUNK = 100;
        const CONCURRENCY = 4;
        const chunks: string[][] = [];
        for (let i = 0; i < otvCodes.length; i += CHUNK) chunks.push(otvCodes.slice(i, i + CHUNK));

        const runChunks = async (chunkList: string[][]): Promise<{ options: TgxOption[]; errors: any[] }[]> => {
            const results: { options: TgxOption[]; errors: any[] }[] = [];
            for (let i = 0; i < chunkList.length; i += CONCURRENCY) {
                const batch = chunkList.slice(i, i + CONCURRENCY);
                const batchResults = await Promise.all(batch.map(async (chunk) => {
                    const r = await tgxGraphQL(CITY_SEARCH_QUERY, {
                        criteria: { ...baseCriteria, hotels: chunk },
                        settings,
                    });
                    return {
                        options: (r?.data?.hotelX?.search?.options || []) as TgxOption[],
                        errors:  (r?.data?.hotelX?.search?.errors  || []) as any[],
                    };
                }));
                results.push(...batchResults);
            }
            return results;
        };

        let chunkResults = await runChunks(chunks);
        let fallbackOptions: TgxOption[] = chunkResults.flatMap(r => r.options);
        const fallbackErrors: any[]       = chunkResults.flatMap(r => r.errors);

        const allProcessesFailed = fallbackErrors.some((e) => e.code === 'ALL_PROCESSES_FAILED');

        if ((hasEmptyHotelsError(fallbackErrors) || allProcessesFailed) && fallbackOptions.length === 0) {
            const waitMs = allProcessesFailed ? 3000 : 1000;
            console.log(`[tgx-search] Hotel-code search failed (${allProcessesFailed ? 'ALL_PROCESSES_FAILED' : 'Empty hotels'}) — retrying in ${waitMs}ms`);
            await new Promise(r => setTimeout(r, waitMs));
            chunkResults = await runChunks(chunks);
            fallbackOptions = chunkResults.flatMap(r => r.options);
        }

        const retryErrors = chunkResults.flatMap(r => r.errors);
        if (retryErrors.length) {
            console.warn('[tgx-search] Hotel-code search errors:', retryErrors.map((e: any) => e.description || e.code).join(', '));
        }

        const fallbackMerchant = fallbackOptions.filter(
            (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
        );
        if (fallbackMerchant.length > 0) {
            return buildCityResults(fallbackMerchant, cityName, countryCode, otvContentMap);
        }
        // OTV codes exist but no availability — fall through to ETG
    }

    // ── ETG B2B fallback: direct region search for cities OTV doesn't serve ──
    console.warn(`[tgx-search] OTV yielded no results for "${cityName}" — trying ETG direct search`);
    const etgResult = await searchEtgCity(cityName, searchParams);
    if (etgResult.data.length > 0) {
        console.log(`[tgx-search] ETG fallback: ${etgResult.data.length} hotels for "${cityName}"`);
        return etgResult;
    }

    return buildCityResults([], cityName, countryCode);
}

export async function runTgxSearch(params: TgxSearchParams) {
    const key = buildHotelCacheKey(params);
    const ttl = getEffectiveTtl(params.cityName);

    // 1. DB cache hit (fresh or stale-within-grace)
    if (ttl > 0) {
        const cached = await getHotelSearchCache(key, ttl);
        if (cached !== null) {
            if (!cached.stale) {
                console.log(`[hotel-cache] HIT ${key}`);
                return cached.result;
            }
            // Stale hit: return immediately, kick off background refresh
            console.log(`[hotel-cache] STALE ${key} — serving stale result, refreshing in background`);
            if (!_inflight.has(key) && !_backgroundRefreshing.has(key)) {
                _backgroundRefreshing.add(key);
                _runTgxSearch(params)
                    .then(result => {
                        if (Array.isArray(result?.data) && result.data.length > 0) {
                            setHotelSearchCache(key, result, ttl).catch(() => {});
                        }
                    })
                    .catch((e: any) => console.error('[hotel-cache] Background refresh failed:', e.message))
                    .finally(() => _backgroundRefreshing.delete(key));
            }
            return cached.result;
        }
    }

    // 2. In-flight dedup: attach to existing search for the same key
    const existing = _inflight.get(key);
    if (existing) {
        console.log(`[hotel-cache] INFLIGHT ${key} — waiting for in-progress search`);
        return existing;
    }

    // 3. Start new search, register in-flight promise
    const promise = _runTgxSearch(params)
        .then(result => {
            if (ttl > 0) {
                // City search: result.data is an array; single-hotel: result.data is an object with roomTypes
                const hasCityResults = Array.isArray(result?.data) && result.data.length > 0;
                const hasHotelRooms  = !Array.isArray(result?.data) && Array.isArray(result?.data?.roomTypes);
                if (hasCityResults || hasHotelRooms) {
                    setHotelSearchCache(key, result, ttl).catch(() => {});
                }
            }
            return result;
        })
        .finally(() => { _inflight.delete(key); });

    _inflight.set(key, promise);
    return promise;
}

async function _runTgxSearch(params: TgxSearchParams) {
    const {
        checkin, checkout,
        adults = 2, children = 0, childrenAges,
        destinationCode, cityName, countryCode,
        hotelCode,
        guest_nationality = 'KR',
    } = params;

    // OTV/RateHawk prices in USD — always search in USD regardless of display currency.
    const currency = 'USD';

    const settings = getTgxSettings();
    const occupancies = buildOccupancies(Number(adults), Number(children), childrenAges);

    let destinations: string[] | undefined;
    let hotels: string[] | undefined;

    if (hotelCode) {
        hotels = [String(hotelCode)];
    } else if (destinationCode) {
        destinations = [String(destinationCode)];
    } else if (cityName) {
        // OTV never accepts raw city names as destination identifiers.
        // Skip the guaranteed-to-fail initial call and go straight to hotel-code fallback.
        const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };
        return runCityFallback(
            cityName, countryCode, baseCriteria, settings,
            resolveTgxDestinationCode(cityName, countryCode).catch(() => undefined),
            fetchHotelCodesByCity(cityName, countryCode).catch(() => []),
            params,
        );
    } else {
        throw new Error('destinationCode, hotelCode, or cityName is required');
    }

    const criteria = {
        checkIn: checkin,
        checkOut: checkout,
        occupancies,
        nationality: guest_nationality,
        currency,
        ...(hotels ? { hotels } : { destinations }),
    };

    const gqlQuery = hotelCode ? HOTEL_SEARCH_QUERY : CITY_SEARCH_QUERY;
    const result = await tgxGraphQL(gqlQuery, { criteria, settings });

    const options: TgxOption[] = result?.data?.hotelX?.search?.options || [];
    const gqlErrors = result?.data?.hotelX?.search?.errors || [];

    // Destination-code search returned empty — fall back to hotel-code search if cityName is available.
    if (hasEmptyHotelsError(gqlErrors) && !hotelCode) {
        if (cityName) {
            const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };
            return runCityFallback(
                cityName, countryCode, baseCriteria, settings,
                Promise.resolve(undefined),
                fetchHotelCodesByCity(cityName, countryCode).catch(() => []),
                params,
            );
        }
        console.warn('[tgx-search] Empty hotels and no cityName to fall back with');
    }

    if (gqlErrors.length) {
        console.warn('[tgx-search] GraphQL errors:', gqlErrors.map((e: any) => e.description || e.code).join(', '));
    }

    // Filter: MERCHANT only (DIRECT = guest pays hotel, incompatible with our model)
    const merchantOptions = options.filter(
        (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
    );

    // ── Single hotel mode ──────────────────────────────────────────────────────
    if (hotelCode) {
        const roomTypes = merchantOptions
            .sort((a, b) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
            .map(normalizeOption);

        const [contentMap, reviewMap] = await Promise.all([
            fetchHotelContent([String(hotelCode)]),
            fetchHotelReviews([String(hotelCode)]),
        ]);
        const content = contentMap.get(String(hotelCode));
        const reviews = reviewMap.get(String(hotelCode));
        const imageList: string[] = content?.images ?? [];
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);


        return {
            data: {
                roomTypes,
                hotelId:     String(hotelCode),
                name:        content?.name || String(hotelCode),
                images:      imageList,
                image:       imageList[0] ?? '',
                lat:         Number(content?.lat ?? 0),
                lng:         Number(content?.lng ?? 0),
                coordinates: { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
                address:     content?.address ?? '',
                city:        content?.city ?? '',
                country:     content?.country ?? '',
                description: content?.description ?? '',
                amenities:   content?.amenities ?? [],
                starRating:  content?.star_rating ?? 0,
                reviewRating,
                reviewCount: reviews?.reviews_count ?? content?.review_count ?? 0,
            },
        };
    }

    return buildCityResults(merchantOptions, cityName, countryCode);
}

async function buildCityResults(
    merchantOptions: TgxOption[],
    cityName?: string,
    countryCode?: string,
    preloadedContent: Map<string, any> = new Map(),
) {
    // ── City search mode ───────────────────────────────────────────────────────
    // Keep cheapest option per hotel, cap at 300 before DB enrichment to avoid timeouts.
    const byHotel = new Map<string, TgxOption>();
    for (const opt of merchantOptions) {
        const existing = byHotel.get(opt.hotelCode);
        const price = opt.price.gross || opt.price.net;
        if (!existing || price < (existing.price.gross || existing.price.net)) {
            byHotel.set(opt.hotelCode, opt);
        }
    }

    // Sort cheapest-first, cap at 300 to protect client memory and render budget
    const hotelCodes = Array.from(byHotel.entries())
        .sort(([, a], [, b]) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
        .slice(0, 300)
        .map(([code]) => code);
    const [contentMap, reviewMap] = await Promise.all([
        fetchHotelContent(hotelCodes),
        fetchHotelReviews(hotelCodes),
    ]);

    // When OTV returns null hotelName (data quality gap for some regions),
    // fall back to ETG hotel/info which uses the same RateHawk data but reliably has names.
    // Wrapped in try/catch — enrichment must never prevent results from rendering.
    if (hotelCodes.length > 0) {
        const noNameCodes = hotelCodes.filter(c => !contentMap.get(c)?.name && !preloadedContent.get(c)?.name);
        if (noNameCodes.length >= hotelCodes.length * 0.3) {
            try {
                const etgNames = await fetchEtgHotelNames(noNameCodes);
                if (etgNames.size > 0) {
                    for (const [code, name] of etgNames) {
                        const row = contentMap.get(code);
                        if (row) { row.name = row.name || name; }
                        else { preloadedContent.set(code, { ...(preloadedContent.get(code) ?? {}), name }); }
                    }
                    updateHotelNamesInDb(etgNames).catch(() => {});
                }
            } catch (e: any) {
                console.warn('[tgx-search] ETG name enrichment skipped:', e.message);
            }
        }
    }

    const hotels_result = hotelCodes.map((code) => {
        const opt     = byHotel.get(code)!;
        const content = contentMap.get(code) ?? preloadedContent.get(code);
        const reviews = reviewMap.get(code);
        const tokenId = opt.token || opt.id;
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);
        const imageList: string[] = content?.images ?? [];
        return {
            hotelId:      code,
            id:           code,
            name:         content?.name || preloadedContent.get(code)?.name || code,
            price:        opt.price.gross || opt.price.net,
            currency:     opt.price.currency,
            offerId:      `TGX:${tokenId}`,
            refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
            starRating:   content?.star_rating ?? 0,
            images:       imageList,
            image:        imageList[0] ?? '',
            lat:          Number(content?.lat ?? 0),
            lng:          Number(content?.lng ?? 0),
            coordinates:  { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
            address:      content?.address ?? '',
            location:     content?.address ?? '',
            city:         content?.city ?? cityName ?? '',
            country:      content?.country ?? countryCode ?? '',
            description:  content?.description ?? '',
            amenities:    content?.amenities ?? [],
            reviewRating,
            rating:       reviewRating,
            reviews:      reviews?.reviews_count ?? content?.review_count ?? 0,
            reviewCount:  reviews?.reviews_count ?? content?.review_count ?? 0,
            checkInTime:  content?.check_in_time ?? null,
            checkOutTime: content?.check_out_time ?? null,
            boardCode:    opt.boardCode,
            roomTypes:    [normalizeOption(opt)],
            _tgxToken:    opt.token,
        };
    });

    // Deduplicate: OTV sometimes lists the same property under multiple codes.
    // Hotels are already sorted cheapest-first, so the first occurrence wins.
    const seenNames = new Set<string>();
    const deduped = hotels_result.filter((h) => {
        if (!h.name || h.name === h.hotelId) return true;
        const key = normalizeHotelName(h.name);
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
    });

    const allMappable = deduped.filter((h) => h.lat && h.lng);
    return { data: deduped, allMappable, totalCount: deduped.length };
}
