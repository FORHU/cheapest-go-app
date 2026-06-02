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
    const rows = countryCode
        ? await sql`
            SELECT hotel_id FROM hotel_content
            WHERE LOWER(city) = LOWER(${cityName}) AND LOWER(country) = LOWER(${countryCode})
            LIMIT 300
          `
        : await sql`
            SELECT hotel_id FROM hotel_content
            WHERE LOWER(city) = LOWER(${cityName})
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

async function resolveCityDestination(cityName: string): Promise<string[]> {
    try {
        const cfg = getTgxConfig();
        const destResult = await tgxGraphQL(
            `query TgxResolveDestination($access: ID!, $text: String!) {
               hotelX {
                 destinationSearcher(criteria: { access: $access, text: $text, maxSize: 50 }) {
                   ... on DestinationData { code type }
                 }
               }
             }`,
            { access: cfg.accessCode, text: cityName }
        );
        const items: any[] = destResult?.data?.hotelX?.destinationSearcher ?? [];
        const city = items.find((i) => i.type === 'CITY');
        const zone = items.find((i) => i.type === 'ZONE');
        const resolved = city?.code ?? zone?.code;
        if (resolved) {
            console.log(`[tgx-search] Resolved "${cityName}" → ${resolved}`);
            return [resolved];
        }
        console.warn(`[tgx-search] No TGX code for "${cityName}", using raw name`);
        return [cityName];
    } catch (e: any) {
        console.warn('[tgx-search] Destination resolution failed:', e.message);
        return [cityName];
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
        // Resolve TGX destination code from city name — one extra API call.
        // The autocomplete enriches results with TGX codes, so this path
        // should only trigger for direct URL navigation without a code.
        destinations = await resolveCityDestination(cityName);
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

    // When a stored destinationCode produces "Empty hotels", the URL code may be
    // stale or not mapped to the OTV supplier.
    if (hasEmptyHotelsError(gqlErrors) && !hotelCode) {
        // 1. Try fresh city resolution first (handles stale URL codes)
        if (cityName) {
            console.warn(`[tgx-search] destinationCode "${destinationCode ?? 'n/a'}" got Empty hotels — retrying with cityName "${cityName}"`);
            const freshDestinations = await resolveCityDestination(cityName);
            if (freshDestinations[0] !== destinationCode) {
                const retryCriteria = { ...criteria, destinations: freshDestinations };
                delete (retryCriteria as any).hotels;
                const retryResult = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: retryCriteria, settings });
                const retryOptions: TgxOption[] = retryResult?.data?.hotelX?.search?.options || [];
                const retryErrors = retryResult?.data?.hotelX?.search?.errors || [];
                if (!hasEmptyHotelsError(retryErrors) && retryOptions.length > 0) {
                    const retryMerchant = retryOptions.filter(
                        (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
                    );
                    return buildCityResults(retryMerchant, cityName, countryCode);
                }
                if (retryErrors.length) {
                    console.warn('[tgx-search] Retry GraphQL errors:', retryErrors.map((e: any) => e.description || e.code).join(', '));
                }
            }
        }

        // 2. Destination code is a genuine OTV catalog gap — search by hotel codes from DB
        const fallbackCity = cityName ?? '';
        if (fallbackCity) {
            console.warn(`[tgx-search] Destination "${destinationCode ?? fallbackCity}" not in OTV catalog — falling back to hotel-code search from DB`);
            const dbHotelCodes = await fetchHotelCodesByCity(fallbackCity, countryCode);
            if (dbHotelCodes.length > 0) {
                console.log(`[tgx-search] Found ${dbHotelCodes.length} hotel codes in DB for "${fallbackCity}" — searching TGX by hotel code`);
                const fallbackCriteria = { ...criteria, hotels: dbHotelCodes };
                delete (fallbackCriteria as any).destinations;
                const fallbackResult = await tgxGraphQL(CITY_SEARCH_QUERY, { criteria: fallbackCriteria, settings });
                const fallbackOptions: TgxOption[] = fallbackResult?.data?.hotelX?.search?.options || [];
                const fallbackErrors = fallbackResult?.data?.hotelX?.search?.errors || [];
                if (fallbackErrors.length) {
                    console.warn('[tgx-search] Hotel-code fallback errors:', fallbackErrors.map((e: any) => e.description || e.code).join(', '));
                }
                const fallbackMerchant = fallbackOptions.filter(
                    (o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
                );
                return buildCityResults(fallbackMerchant, fallbackCity, countryCode);
            } else {
                console.warn(`[tgx-search] No hotel codes found in DB for "${fallbackCity}" — no TGX results`);
            }
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
        return { data: { roomTypes } };
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
        return {
            hotelId:     code,
            name:        content?.name || code,
            price:       opt.price.gross || opt.price.net,
            currency:    opt.price.currency,
            offerId:     `TGX:${tokenId}`,
            refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
            starRating:  content?.star_rating ?? 0,
            images:      content?.images ?? [],
            lat:         content?.lat ?? 0,
            lng:         content?.lng ?? 0,
            address:     content?.address ?? '',
            city:        content?.city ?? cityName ?? '',
            country:     content?.country ?? countryCode ?? '',
            description: content?.description ?? '',
            amenities:   content?.amenities ?? [],
            reviewRating: reviews?.rating ?? content?.review_rating ?? 0,
            reviewCount:  reviews?.reviews_count ?? content?.review_count ?? 0,
            checkInTime: content?.check_in_time ?? null,
            checkOutTime: content?.check_out_time ?? null,
            boardCode:   opt.boardCode,
            roomTypes:   [normalizeOption(opt)],
            _tgxToken:   opt.token,
        };
    });

    const allMappable = hotels_result.filter((h) => h.lat && h.lng);
    return { data: hotels_result, allMappable, totalCount: hotels_result.length };
}
