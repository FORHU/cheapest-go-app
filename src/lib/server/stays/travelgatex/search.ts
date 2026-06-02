/**
 * TravelgateX hotel search — core logic, no HTTP layer.
 * Called directly by server routes to avoid HTTP self-call overhead.
 */

import { tgxGraphQL, getTgxSettings, getTgxConfig, buildOccupancies, normalizeOption, type TgxOption } from './client';
import { getSqlAdmin } from '@/lib/db/postgres';
import { resolveTgxDestinationCode } from '@/lib/server/search';

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
            LIMIT 200
          `
        : await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern}
            LIMIT 200
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

export async function runTgxSearch(params: TgxSearchParams) {
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
        destinations = [cityName]; // will be overridden by fallback if empty hotels
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

    // OTV destination codes don't work for city-level search — fall back to hotel codes.
    if (hasEmptyHotelsError(gqlErrors) && !hotelCode) {
        const fallbackCity = cityName ?? '';
        if (!fallbackCity) {
            console.warn('[tgx-search] Empty hotels and no cityName to fall back with');
        } else {
            // 1. Try TGX destination code first — gives full city catalog, not just DB snapshot.
            console.warn(`[tgx-search] OTV destination search empty for "${fallbackCity}" — resolving TGX destination code`);
            const resolvedCode = await resolveTgxDestinationCode(fallbackCity);
            if (resolvedCode) {
                console.log(`[tgx-search] Got TGX destination code "${resolvedCode}" for "${fallbackCity}" — searching`);
                const destCriteria = { ...criteria, destinations: [resolvedCode] };
                delete (destCriteria as any).hotels;
                const destResult = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: destCriteria, settings });
                const destOptions: TgxOption[] = destResult?.data?.hotelX?.search?.options || [];
                const destErrors: any[] = destResult?.data?.hotelX?.search?.errors || [];
                const destMerchant = destOptions.filter(
                    (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
                );
                if (destMerchant.length > 0) {
                    console.log(`[tgx-search] Destination-code search returned ${destMerchant.length} options for "${fallbackCity}"`);
                    return buildCityResults(destMerchant, fallbackCity, countryCode);
                }
                if (destErrors.length) {
                    console.warn('[tgx-search] Destination-code search errors:', destErrors.map((e: any) => e.description || e.code).join(', '));
                }
            }

            // 2. DB hotel codes (OTV IDs cached from previous searches / ETG seed)
            console.warn(`[tgx-search] Destination-code search empty for "${fallbackCity}" — trying hotel-code search`);
            let otvCodes = await fetchHotelCodesByCity(fallbackCity, countryCode);

            // 2. OTV hotel portfolio query when DB is empty (new city, never seeded)
            if (otvCodes.length === 0) {
                console.log(`[tgx-search] DB empty for "${fallbackCity}" — querying OTV portfolio`);
                otvCodes = await fetchOtvHotelCodesByCity(fallbackCity, destinationCode ?? destinations?.[0]);
            }

            if (otvCodes.length > 0) {
                console.log(`[tgx-search] Searching TGX with ${otvCodes.length} OTV hotel codes for "${fallbackCity}"`);

                // Batch into chunks of 100 and run in parallel — TGX recommends ≤200 per request.
                const CHUNK = 100;
                const chunks: string[][] = [];
                for (let i = 0; i < otvCodes.length; i += CHUNK) chunks.push(otvCodes.slice(i, i + CHUNK));

                const chunkResults = await Promise.all(chunks.map(async (chunk) => {
                    const fc = { ...criteria, hotels: chunk };
                    delete (fc as any).destinations;
                    const r = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: fc, settings });
                    return {
                        options: (r?.data?.hotelX?.search?.options || []) as TgxOption[],
                        errors:  (r?.data?.hotelX?.search?.errors  || []) as any[],
                    };
                }));

                let fallbackOptions: TgxOption[] = chunkResults.flatMap(r => r.options);
                const fallbackErrors: any[]       = chunkResults.flatMap(r => r.errors);

                // TGX sometimes returns "Empty hotels" on the first hotel-code search for
                // codes it hasn't recently cached. One retry after a short delay fixes this.
                if (hasEmptyHotelsError(fallbackErrors) && fallbackOptions.length === 0) {
                    console.log('[tgx-search] Hotel-code search returned Empty hotels — retrying in 1.5s');
                    await new Promise(r => setTimeout(r, 1500));
                    const retryResults = await Promise.all(chunks.map(async (chunk) => {
                        const fc = { ...criteria, hotels: chunk };
                        delete (fc as any).destinations;
                        const r = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: fc, settings });
                        return (r?.data?.hotelX?.search?.options || []) as TgxOption[];
                    }));
                    fallbackOptions = retryResults.flat();
                }

                if (fallbackErrors.length) {
                    console.warn('[tgx-search] Hotel-code search errors:', fallbackErrors.map((e: any) => e.description || e.code).join(', '));
                }

                const fallbackMerchant = fallbackOptions.filter(
                    (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
                );
                return buildCityResults(fallbackMerchant, fallbackCity, countryCode);
            }
            console.warn(`[tgx-search] No OTV hotel codes found for "${fallbackCity}" — no results`);
        }
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

    // Sort cheapest-first, cap at 300 so DB enrichment stays fast
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
