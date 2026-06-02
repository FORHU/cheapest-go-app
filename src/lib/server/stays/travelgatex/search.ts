/**
 * TravelgateX hotel search — core logic, no HTTP layer.
 * Called directly by server routes to avoid HTTP self-call overhead.
 */

import { tgxGraphQL, getTgxSettings, getTgxConfig, buildOccupancies, normalizeOption, type TgxOption } from './client';
import { getSqlAdmin } from '@/lib/db/postgres';

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
            LIMIT 300
          `
        : await sql`
            SELECT hotel_id FROM hotel_content
            WHERE city ILIKE ${pattern}
            LIMIT 300
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
        const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: 300 };
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
            // 1. DB hotel codes (OTV IDs cached from previous searches / ETG seed)
            console.warn(`[tgx-search] OTV destination search empty for "${fallbackCity}" — trying hotel-code search`);
            let otvCodes = await fetchHotelCodesByCity(fallbackCity, countryCode);

            // 2. OTV hotel portfolio query when DB is empty (new city, never seeded)
            if (otvCodes.length === 0) {
                console.log(`[tgx-search] DB empty for "${fallbackCity}" — querying OTV portfolio`);
                otvCodes = await fetchOtvHotelCodesByCity(fallbackCity, destinationCode ?? destinations?.[0]);
            }

            if (otvCodes.length > 0) {
                console.log(`[tgx-search] Searching TGX with ${otvCodes.length} OTV hotel codes for "${fallbackCity}"`);
                const fallbackCriteria = { ...criteria, hotels: otvCodes };
                delete (fallbackCriteria as any).destinations;

                let fallbackResult = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: fallbackCriteria, settings });
                let fallbackOptions: TgxOption[] = fallbackResult?.data?.hotelX?.search?.options || [];
                let fallbackErrors: any[]         = fallbackResult?.data?.hotelX?.search?.errors || [];

                // TGX sometimes returns "Empty hotels" on the first hotel-code search for
                // codes it hasn't recently cached. One retry after a short delay fixes this.
                if (hasEmptyHotelsError(fallbackErrors) && fallbackOptions.length === 0) {
                    console.log('[tgx-search] Hotel-code search returned Empty hotels — retrying in 1.5s');
                    await new Promise(r => setTimeout(r, 1500));
                    fallbackResult  = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: fallbackCriteria, settings });
                    fallbackOptions = fallbackResult?.data?.hotelX?.search?.options || [];
                    fallbackErrors  = fallbackResult?.data?.hotelX?.search?.errors || [];
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
    const byHotel = new Map<string, TgxOption>();
    for (const opt of merchantOptions) {
        const existing = byHotel.get(opt.hotelCode);
        const price = opt.price.gross || opt.price.net;
        if (!existing || price < (existing.price.gross || existing.price.net)) {
            byHotel.set(opt.hotelCode, opt);
        }
    }

    const hotelCodes = Array.from(byHotel.keys());
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
