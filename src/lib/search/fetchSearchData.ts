/**
 * Server-side data fetching utilities for search page.
 * These are pure functions that can be used in server components.
 */

// unstable_cache removed — edge function has its own 10-min in-memory cache
import { createClient } from '@supabase/supabase-js';
import { type Property } from '@/types';
import { searchTravelgateX } from '@/lib/server/travelgatex';
import { COUNTRY_DEFAULT_CITY, COUNTRY_NAME_TO_CODE } from '@/lib/constants/countries';
import { searchDuffelStays } from '@/lib/server/stays/providers/duffel';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminSupabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

async function fetchHotelRatings(hotelIds: string[]): Promise<Map<string, { rating: number; reviews_count: number }>> {
    const map = new Map<string, { rating: number; reviews_count: number }>();
    if (!adminSupabase || hotelIds.length === 0) return map;
    try {
        const { data } = await adminSupabase
            .from('hotel_reviews')
            .select('hotel_id, rating, reviews_count')
            .in('hotel_id', hotelIds);
        for (const row of (data || [])) {
            map.set(row.hotel_id, { rating: row.rating ?? 0, reviews_count: row.reviews_count ?? 0 });
        }
    } catch (e) {
        console.error('[fetchHotelRatings] error:', e);
    }
    return map;
}

// Types
export interface SearchParams {
    checkIn?: string;
    checkOut?: string;
    checkin?: string;
    checkout?: string;
    destination?: string;
    adults?: string | number;
    children?: string | number;
    childrenAges?: string; // Comma-separated ages (e.g., "5,10,12")
    rooms?: string | number;
    nationality?: string;
    countryCode?: string;
    destinationType?: string;
    currency?: string;
    placeId?: string;
    destinationCode?: string;
    hotelName?: string;
    starRating?: string;
    minRating?: string;
    minReviewsCount?: string;
    facilities?: string;
    strictFacilityFiltering?: string;
}

export interface SearchQueryParams {
    checkin: string;
    checkout: string;
    adults: number;
    children: number;
    childrenAges?: number[]; // Array of children ages for proper LiteAPI occupancy
    rooms: number;
    guest_nationality: string;
    currency: string;
    cityName: string;
    countryCode: string;
    placeId?: string;
    destinationCode?: string;
    query: string;
    hotelName?: string;
    starRating?: number[];
    minRating?: number;
    minReviewsCount?: number;
    facilities?: number[];
    strictFacilityFiltering?: boolean;
}

// Format date as YYYY-MM-DD
export function formatSearchDate(dateInput: string | undefined): string {
    if (!dateInput) return "";
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().split('T')[0];
    } catch {
        return "";
    }
}

// Parse raw check-in date from search params
export function parseCheckInDate(params: SearchParams): string {
    return (typeof params.checkIn === 'string' && params.checkIn ? params.checkIn :
        typeof params.checkin === 'string' && params.checkin ? params.checkin : "2026-06-01");
}

// Parse raw check-out date from search params
export function parseCheckOutDate(params: SearchParams): string {
    return (typeof params.checkOut === 'string' && params.checkOut ? params.checkOut :
        typeof params.checkout === 'string' && params.checkout ? params.checkout : "2026-06-05");
}

// Parse filter parameters
export function parseFilterParams(params: SearchParams) {
    const hotelName = typeof params.hotelName === 'string' ? params.hotelName : undefined;
    const starRating = typeof params.starRating === 'string'
        ? params.starRating.split(',').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 5)
        : undefined;
    const minRating = typeof params.minRating === 'string' ? Number(params.minRating) : undefined;
    const minReviewsCount = typeof params.minReviewsCount === 'string' ? Number(params.minReviewsCount) : undefined;
    const facilities = typeof params.facilities === 'string'
        ? params.facilities.split(',').map(Number).filter(n => !isNaN(n))
        : undefined;
    const strictFacilityFiltering = params.strictFacilityFiltering === 'true';

    return { hotelName, starRating, minRating, minReviewsCount, facilities, strictFacilityFiltering };
}

// Build query params object
export function buildSearchQueryParams(params: SearchParams): SearchQueryParams {
    const rawCheckin = parseCheckInDate(params);
    const rawCheckout = parseCheckOutDate(params);
    const destination = typeof params.destination === 'string' ? params.destination : "";
    const filters = parseFilterParams(params);

    // Parse children ages from comma-separated string
    const childrenAges = typeof params.childrenAges === 'string' && params.childrenAges
        ? params.childrenAges.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 17)
        : undefined;

    // countryCode comes from destination selection (autocomplete → URL param)
    let countryCode = typeof params.countryCode === 'string' && params.countryCode
        ? params.countryCode : '';

    // ── Fallback: derive countryCode from known city names when it's missing ──
    // This ensures LiteAPI always gets at least (cityName + countryCode) instead of
    // cityName alone, which causes a 400 "bad request" error for smaller cities.
    if (!countryCode && destination) {
        const CITY_COUNTRY: Record<string, string> = {
            // Vietnam
            'da nang': 'VN', 'danang': 'VN', 'ho chi minh': 'VN', 'saigon': 'VN',
            'hanoi': 'VN', 'hoi an': 'VN', 'hue': 'VN', 'nha trang': 'VN',
            'phu quoc': 'VN', 'vung tau': 'VN', 'ha long': 'VN',
            // Philippines
            'manila': 'PH', 'cebu': 'PH', 'cebu city': 'PH', 'boracay': 'PH',
            'boracay island': 'PH', 'palawan': 'PH', 'el nido': 'PH',
            'davao': 'PH', 'bohol': 'PH', 'baguio': 'PH', 'siargao': 'PH',
            'pasig': 'PH', 'pasig city': 'PH', 'makati': 'PH', 'taguig': 'PH',
            'quezon city': 'PH',
            // Japan
            'tokyo': 'JP', 'osaka': 'JP', 'kyoto': 'JP', 'sapporo': 'JP',
            'fukuoka': 'JP', 'nara': 'JP', 'hiroshima': 'JP', 'okinawa': 'JP',
            // South Korea
            'seoul': 'KR', 'busan': 'KR', 'jeju': 'KR', 'incheon': 'KR',
            'daejeon': 'KR', 'daegu': 'KR', 'gwangju': 'KR', 'ulsan': 'KR',
            'suwon': 'KR', 'jeonju': 'KR', 'gyeongju': 'KR', 'changwon': 'KR',
            'pohang': 'KR', 'chuncheon': 'KR', 'gangneung': 'KR', 'sokcho': 'KR',
            // Thailand
            'bangkok': 'TH', 'phuket': 'TH', 'pattaya': 'TH', 'chiang mai': 'TH',
            'koh samui': 'TH', 'krabi': 'TH',
            // China / Hong Kong / Taiwan
            'hong kong': 'HK', 'beijing': 'CN', 'shanghai': 'CN', 'guangzhou': 'CN',
            'shenzhen': 'CN', 'taipei': 'TW', 'taichung': 'TW',
            // Singapore / Malaysia
            'singapore': 'SG', 'kuala lumpur': 'MY', 'penang': 'MY', 'langkawi': 'MY',
            'kota kinabalu': 'MY', 'johor bahru': 'MY',
            // Indonesia
            'bali': 'ID', 'jakarta': 'ID', 'lombok': 'ID', 'yogyakarta': 'ID',
            'surabaya': 'ID', 'bandung': 'ID',
            // Middle East / India
            'dubai': 'AE', 'abu dhabi': 'AE', 'doha': 'QA', 'istanbul': 'TR',
            'delhi': 'IN', 'new delhi': 'IN', 'mumbai': 'IN', 'goa': 'IN',
            'colombo': 'LK', 'kathmandu': 'NP',
            // Europe
            'london': 'GB', 'paris': 'FR', 'amsterdam': 'NL', 'frankfurt': 'DE',
            'munich': 'DE', 'berlin': 'DE', 'rome': 'IT', 'milan': 'IT',
            'madrid': 'ES', 'barcelona': 'ES', 'zurich': 'CH', 'vienna': 'AT',
            'athens': 'GR', 'lisbon': 'PT', 'brussels': 'BE', 'prague': 'CZ',
            'budapest': 'HU', 'warsaw': 'PL', 'stockholm': 'SE', 'oslo': 'NO',
            'copenhagen': 'DK', 'helsinki': 'FI',
            // Americas
            'new york': 'US', 'los angeles': 'US', 'san francisco': 'US',
            'miami': 'US', 'chicago': 'US', 'toronto': 'CA', 'vancouver': 'CA',
            'cancun': 'MX', 'mexico city': 'MX',
            // Oceania
            'sydney': 'AU', 'melbourne': 'AU', 'auckland': 'NZ',
        };
        const key = destination.toLowerCase().trim();
        // Direct lookup first, then strip common suffixes (City, Island, Province, etc.)
        countryCode = CITY_COUNTRY[key]
            || CITY_COUNTRY[key.replace(/\s+(city|island|province|metro|town)$/i, '')]
            || '';
    }

    // When the user searched by country name (not a city), LiteAPI returns 0
    // results. Detect this by checking if the destination string is a known
    // country name, then swap in the country's top tourist city for the API call.
    const isCountryName = !!COUNTRY_NAME_TO_CODE[destination.toLowerCase().trim()];
    const resolvedCountryCode = isCountryName
        ? (COUNTRY_NAME_TO_CODE[destination.toLowerCase().trim()] ?? countryCode)
        : countryCode;
    if (isCountryName && !countryCode) countryCode = resolvedCountryCode;
    const resolvedCityName = isCountryName
        ? (COUNTRY_DEFAULT_CITY[resolvedCountryCode] ?? destination)
        : destination;

    const placeId = typeof params.placeId === 'string' ? params.placeId : undefined;
    const destinationCode = typeof params.destinationCode === 'string' ? params.destinationCode : undefined;

    // Currency comes from the user's locale preference (URL param), NOT the destination
    const currency = typeof params.currency === 'string' && params.currency
        ? params.currency : 'KRW';

    const queryParams: SearchQueryParams = {
        checkin: formatSearchDate(rawCheckin) || "2026-06-01",
        checkout: formatSearchDate(rawCheckout) || "2026-06-05",
        adults: Number(params.adults) || 2,
        children: Number(params.children) || 0,
        childrenAges,
        rooms: Number(params.rooms) || 1,
        guest_nationality: typeof params.nationality === 'string' && params.nationality ? params.nationality : "KR",
        currency,
        cityName: resolvedCityName,
        // Send countryCode even if placeId exists. LiteAPI sometimes needs it for smaller cities
        countryCode: countryCode,
        placeId,
        destinationCode,
        query: resolvedCityName,
    };

    // Add filter parameters if present
    if (filters.hotelName) queryParams.hotelName = filters.hotelName;
    if (filters.starRating && filters.starRating.length > 0) queryParams.starRating = filters.starRating;
    if (filters.minRating && filters.minRating > 0) queryParams.minRating = filters.minRating;
    if (filters.minReviewsCount && filters.minReviewsCount > 0) queryParams.minReviewsCount = filters.minReviewsCount;
    if (filters.facilities && filters.facilities.length > 0) {
        queryParams.facilities = filters.facilities;
        if (filters.strictFacilityFiltering) queryParams.strictFacilityFiltering = true;
    }

    return queryParams;
}


// Extract price — TravelgateX: top-level number; LiteAPI: nested in roomTypes
function extractPrice(hotel: any): { price: number; originalPrice?: number; currency?: string } {
    let result: { price: number; originalPrice?: number; currency?: string } = { price: 0 };

    if (typeof hotel.price === 'number' && hotel.price > 0) {
        result.price = hotel.price;
        result.currency = hotel.currency || hotel.priceCurrency || hotel.currencyCode;
    } else if (hotel.roomTypes?.length > 0) {
        const total = hotel.roomTypes[0]?.rates?.[0]?.retailRate?.total;
        if (Array.isArray(total) && total.length > 0) {
            const amountObj = total[0] as any;
            result.price = amountObj.amount || 0;
            result.currency = amountObj.currency;
        } else if (typeof total === 'object' && total !== null && 'amount' in total) {
            result.price = (total as any).amount || 0;
            result.currency = (total as any).currency;
        } else if (typeof total === 'number') {
            result.price = total;
            result.currency = hotel.roomTypes[0]?.rates?.[0]?.retailRate?.currency;
        }
    }

    if (hotel.originalPrice) result.originalPrice = hotel.originalPrice;

    return result;
}

// Extract refundable tag — TravelgateX sets top-level; LiteAPI sets in roomTypes/rates
function extractRefundableTag(hotel: any): string | undefined {
    if (hotel.refundableTag) return hotel.refundableTag;
    for (const room of hotel.roomTypes ?? []) {
        if (room.refundableTag) return room.refundableTag;
        const tag = room.rates?.[0]?.refundableTag;
        if (tag) return tag;
    }
    return undefined;
}

// Transform API hotel to Property
function transformHotelToProperty(hotel: any, cityName: string, requestedCurrency: string): Property {
    const { price, originalPrice, currency: extractedCurrency } = extractPrice(hotel);
    const currency = extractedCurrency || requestedCurrency;
    const refundableTag = extractRefundableTag(hotel);

    // Get review data - reviewRating is typically 0-10 scale
    // If no reviewRating, convert starRating (1-5) to 10-scale
    const starRating = hotel.starRating || hotel.details?.star_rating || hotel.details?.hotel_star_rating || 0;
    let rating = hotel.reviewRating || 0;
    if (!rating && starRating > 0) {
        // Convert star rating to approximate review score (e.g., 3 stars = ~6.0, 4 stars = ~7.5, 5 stars = ~9.0)
        rating = starRating * 1.8;
    }

    const reviewCount = hotel.reviewCount || hotel.details?.review_count || 0;

    const lat = hotel.coordinates?.lat || hotel.latitude || hotel.details?.latitude || hotel.details?.location?.latitude || 0;
    const lng = hotel.coordinates?.lng || hotel.longitude || hotel.details?.longitude || hotel.details?.location?.longitude || 0;

    return {
        id: hotel.hotelId,
        name: hotel.name || `Hotel ${hotel.hotelId}`,
        location: hotel.location || cityName,
        description: hotel.description || hotel.details?.description || hotel.details?.hotel_description ||
            hotel.details?.hotelDescription || hotel.details?.short_description || "No description available",
        rating: rating,
        reviews: reviewCount,
        price,
        currency,
        originalPrice,
        image: hotel.thumbnailUrl || hotel.image || '',
        images: (hotel.images?.length > 0 ? hotel.images : null)
            || (hotel.details?.hotel_images_photos ? hotel.details.hotel_images_photos.map((p: any) => p.url) : []),
        amenities: hotel.hotelFacilities || hotel.details?.hotelFacilities || hotel.details?.facilities || [],
        badges: [],
        type: 'hotel',
        coordinates: { lat, lng },
        refundableTag,
        distance: hotel.distance || hotel.details?.distance_from_center || hotel.details?.distance || undefined,
        boardTypes: hotel.boardTypes || [],
        city: cityName,
    } as Property;
}

async function fetchSearchPropertiesInner(queryParams: SearchQueryParams): Promise<{ properties: Property[]; totalCount: number; allMappable: any[] }> {
    // Run TGX and Duffel in parallel (LiteAPI dropped)
    const [tgxSettled, duffelSettled] = await Promise.allSettled([
        searchTravelgateX({ ...(queryParams as unknown as Record<string, unknown>), limit: 100, offset: 0 }),
        searchDuffelStays(queryParams),
    ]);

    const tgxResults: Property[] = [];
    let tgxTotalCount = 0;
    let tgxAllMappable: any[] = [];
    if (tgxSettled.status === 'fulfilled') {
        const data = tgxSettled.value as any;
        tgxTotalCount = data?.totalCount ?? 0;
        tgxAllMappable = data?.allMappable || [];
        if (data?.data && Array.isArray(data.data)) {
            tgxResults.push(
                ...data.data
                    .map((hotel: any) => {
                        const prop = transformHotelToProperty(hotel, queryParams.cityName, queryParams.currency);
                        if (hotel._tgx) {
                            (prop as any).provider = 'travelgatex';
                            (prop as any)._tgx = hotel._tgx;
                        } else if (hotel._etg) {
                            (prop as any).provider = 'etg';
                            (prop as any)._etg = hotel._etg;
                        }
                        return prop;
                    })
                    .filter((p: Property) => p.name && p.price > 0)
            );
        }
    } else {
        console.error('[Search] TravelgateX failed:', tgxSettled.reason?.message);
    }

    const duffelResults: Property[] = duffelSettled.status === 'fulfilled'
        ? duffelSettled.value
        : [];

    // Merge: TGX first, then Duffel (deduplicated by name)
    const seenNames = new Set(tgxResults.map(p => p.name.toLowerCase().trim()));
    const uniqueDuffel = duffelResults.filter(
        p => !seenNames.has(p.name.toLowerCase().trim())
    );

    const combined = [...tgxResults, ...uniqueDuffel];
    if (combined.length === 0) throw new Error('NO_RESULTS');

    const tgxIds = tgxResults.map(p => p.id).filter(Boolean);
    const ratingsMap = await fetchHotelRatings(tgxIds);
    if (ratingsMap.size > 0) {
        for (const prop of combined) {
            const etg = ratingsMap.get(prop.id);
            if (etg && etg.rating > 0) {
                prop.rating = etg.rating;
                prop.reviews = etg.reviews_count;
            }
        }
    }

    return {
        properties: combined,
        totalCount: tgxTotalCount || combined.length,
        allMappable: tgxAllMappable.length > 0 ? tgxAllMappable : combined
    };
}

/**
 * Main search function - fetches properties from TravelgateX + Duffel Stays in parallel.
 * Results are cached for 5 minutes per unique combination of search params.
 * Empty results and errors are never cached so the next search retries live.
 */
export async function fetchSearchProperties(params: SearchParams): Promise<{ properties: Property[]; totalCount: number; allMappable: any[] }> {
    const queryParams = buildSearchQueryParams(params);
    try {
        const result = await fetchSearchPropertiesInner(queryParams);
        return result;
    } catch (e) {
        if (e instanceof Error && e.message !== 'NO_RESULTS') {
            console.error("Failed to fetch properties:", e);
        }
        return { properties: [], totalCount: 0, allMappable: [] };
    }
}
