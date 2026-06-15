/**
 * TravelgateX hotel search — core logic, no HTTP layer.
 * Called directly by server routes to avoid HTTP self-call overhead.
 */

import { tgxGraphQL, getTgxSettings, getTgxConfig, buildOccupancies, normalizeOption, type TgxOption } from './client';
import { getSqlAdmin } from '@/lib/db/postgres';
import { resolveTgxDestinationCode } from '@/lib/server/search';

// ─── Hotel search cache ───────────────────────────────────────────────────────

const HOTEL_CACHE_TTL_MINUTES = parseInt(
    process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES ?? '30',
    10,
);

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

async function getHotelSearchCache(key: string): Promise<any | null> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql`
            SELECT result FROM hotel_search_cache
            WHERE cache_key = ${key} AND expires_at > now()
            LIMIT 1
        `;
        return rows[0]?.result ?? null;
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
               description, amenities, review_rating, review_count, check_in_time, check_out_time
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
    const normalized = cityName.replace(/-(si|do|gu|gun|eup)$/i, '').trim();
    const pattern = `%${normalized}%`;
    const rows = countryCode
        ? await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern} AND LOWER(country) = LOWER(${countryCode})
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

/** Query TGX's OTV hotel portfolio to discover hotel codes for a city not yet in our DB. */
async function fetchOtvHotelCodesByCity(cityName: string, destinationCode?: string): Promise<string[]> {
    try {
        const cfg = getTgxConfig();
        const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: 200 };
        if (destinationCode) criteria.destinationCodes = [destinationCode];

        const result = await tgxGraphQL(
            `query OtvHotelPortfolio($criteria: HotelXHotelListInput!) {
               hotelX {
                 hotels(criteria: $criteria) {
                   hotels { hotelCode }
                 }
               }
             }`,
            { criteria }
        );

        const hotels: any[] = result?.data?.hotelX?.hotels?.hotels ?? [];
        const codes = hotels.map((h: any) => String(h.hotelCode)).filter(Boolean);
        console.log(`[tgx-search] OTV portfolio returned ${codes.length} hotel codes for "${cityName}"`);
        return codes;
    } catch (e: any) {
        console.warn('[tgx-search] OTV portfolio query failed:', e.message);
        return [];
    }
}

function hasEmptyHotelsError(errors: any[]): boolean {
    return errors.some(
        (e) => e.code === 'WRONG_FIELD' && e.description?.toLowerCase().includes('empty hotels')
    );
}

// In-process set of TGX destination codes that returned "Empty hotels" for OTV.
// Avoids a wasted 18-22s TGX round-trip when the same code is tried again within
// the same server process lifetime (warm Vercel function).
const _failedDestCodes = new Set<string>();

// In-flight deduplication: when two requests arrive with the same cache key before
// either has written a result (cache stampede), the second waits for the first
// promise instead of firing a second TGX call that OTV will throttle.
const _inflight = new Map<string, Promise<any>>();

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
) {
    // 1. Try TGX destination code first — gives full city catalog, not just DB snapshot.
    console.warn(`[tgx-search] OTV destination search empty for "${cityName}" — resolving TGX destination code`);
    const resolvedCode = await prefetchDestCode;
    if (resolvedCode) {
        console.log(`[tgx-search] Got TGX destination code "${resolvedCode}" for "${cityName}" — searching`);
        if (_failedDestCodes.has(resolvedCode)) {
            console.log(`[tgx-search] Skipping dest-code "${resolvedCode}" for "${cityName}" — known OTV miss`);
        } else {
            const destResult = await tgxGraphQL(CITY_SEARCH_QUERY, {
                criteria: { ...baseCriteria, destinations: [resolvedCode] },
                settings,
            });
            const destOptions: TgxOption[] = destResult?.data?.hotelX?.search?.options || [];
            const destErrors: any[] = destResult?.data?.hotelX?.search?.errors || [];
            const destMerchant = destOptions.filter(
                (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
            );
            if (destMerchant.length > 0) {
                console.log(`[tgx-search] Destination-code search returned ${destMerchant.length} options for "${cityName}"`);
                return buildCityResults(destMerchant, cityName, countryCode);
            }
            if (hasEmptyHotelsError(destErrors)) {
                _failedDestCodes.add(resolvedCode);
                console.warn(`[tgx-search] Dest code "${resolvedCode}" returned Empty hotels — recorded as OTV miss`);
            } else if (destErrors.length) {
                console.warn('[tgx-search] Destination-code search errors:', destErrors.map((e: any) => e.description || e.code).join(', '));
            }
        }
    }

    // 2. DB hotel codes (prefetch resolves in <1s — typically already done by now)
    console.warn(`[tgx-search] Destination-code search empty for "${cityName}" — trying hotel-code search`);
    let otvCodes = await prefetchHotelCodes;

    if (otvCodes.length === 0) {
        console.log(`[tgx-search] DB empty for "${cityName}" — querying OTV portfolio`);
        otvCodes = await fetchOtvHotelCodesByCity(cityName);
    }

    if (otvCodes.length > 0) {
        console.log(`[tgx-search] Searching TGX with ${otvCodes.length} OTV hotel codes for "${cityName}"`);

        const CHUNK = 100;
        const CONCURRENCY = 2;
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
        return buildCityResults(fallbackMerchant, cityName, countryCode);
    }

    console.warn(`[tgx-search] No OTV hotel codes found for "${cityName}" — no results`);
    return buildCityResults([], cityName, countryCode);
}

export async function runTgxSearch(params: TgxSearchParams) {
    const key = buildHotelCacheKey(params);

    // 1. DB cache hit
    if (HOTEL_CACHE_TTL_MINUTES > 0) {
        const cached = await getHotelSearchCache(key);
        if (cached !== null) {
            console.log(`[hotel-cache] HIT ${key}`);
            return cached;
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
            if (HOTEL_CACHE_TTL_MINUTES > 0) {
                const hotelCount = Array.isArray(result?.data) ? result.data.length : 0;
                if (hotelCount > 0) {
                    setHotelSearchCache(key, result, HOTEL_CACHE_TTL_MINUTES).catch(() => {});
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
            resolveTgxDestinationCode(cityName).catch(() => undefined),
            fetchHotelCodesByCity(cityName, countryCode).catch(() => []),
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

    const hotels_result = hotelCodes.map((code) => {
        const opt     = byHotel.get(code)!;
        const content = contentMap.get(code);
        const reviews = reviewMap.get(code);
        const tokenId = opt.token || opt.id;
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);
        const imageList: string[] = content?.images ?? [];
        return {
            hotelId:      code,
            id:           code,
            name:         content?.name || code,
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

    const allMappable = hotels_result.filter((h) => h.lat && h.lng);
    return { data: hotels_result, allMappable, totalCount: hotels_result.length };
}
