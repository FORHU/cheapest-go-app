/**
 * Server-side data fetching utilities for search page.
 * These are pure functions that can be used in server components.
 */

import { type Property } from '@/types';
import { searchLiteApi } from '@/utils/supabase/functions';

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
    currency?: string;
    placeId?: string;
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
            // Thailand
            'bangkok': 'TH', 'phuket': 'TH', 'pattaya': 'TH', 'chiang mai': 'TH',
            'koh samui': 'TH', 'krabi': 'TH',
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

    const placeId = typeof params.placeId === 'string' ? params.placeId : undefined;

    // Currency comes from the user's locale preference (URL param), NOT the destination
    const currency = typeof params.currency === 'string' && params.currency
        ? params.currency : 'KRW';

    const queryParams: SearchQueryParams = {
        checkin: formatSearchDate(rawCheckin) || "2026-06-01",
        checkout: formatSearchDate(rawCheckout) || "2026-06-05",
        adults: Number(params.adults) || 2,
        children: Number(params.children) || 0,
        childrenAges, // Pass children ages for proper LiteAPI occupancy
        rooms: Number(params.rooms) || 1,
        guest_nationality: typeof params.nationality === 'string' && params.nationality ? params.nationality : "KR",
        currency,
        cityName: destination,
        // Send countryCode even if placeId exists. LiteAPI sometimes needs it for smaller cities
        countryCode: countryCode,
        placeId,
        query: destination,
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


// Extract price from hotel room types
function extractPrice(hotel: any): { price: number; originalPrice?: number } {
    let price = 0;
    let originalPrice = undefined;

    if (hotel.roomTypes && hotel.roomTypes.length > 0) {
        const firstRoom = hotel.roomTypes[0];
        if (firstRoom.rates && firstRoom.rates.length > 0) {
            const total = firstRoom.rates[0]?.retailRate?.total;

            if (Array.isArray(total) && total.length > 0 && typeof total[0] === 'object' && 'amount' in total[0]) {
                price = (total[0] as any).amount || 0;
            } else if (typeof total === 'object' && total !== null && 'amount' in total) {
                price = (total as any).amount || 0;
            } else if (typeof total === 'number') {
                price = total;
            }
        }
    }

    return { price, originalPrice };
}

// Extract refundable tag from hotel
function extractRefundableTag(hotel: any): string | undefined {
    // First check hotel-level refundableTag (set by edge function)
    let refundableTag = hotel.refundableTag;

    // Fallback: check roomTypes if not found
    if (!refundableTag && hotel.roomTypes && hotel.roomTypes.length > 0) {
        for (const roomType of hotel.roomTypes) {
            // Check roomType level
            if (roomType.refundableTag) {
                refundableTag = roomType.refundableTag;
                break;
            }
            // Check rate level
            if (roomType.rates && roomType.rates.length > 0) {
                const rate = roomType.rates[0];
                if (rate.refundableTag) {
                    refundableTag = rate.refundableTag;
                    break;
                }
            }
        }
    }
    return refundableTag;
}

// Transform API hotel to Property
function transformHotelToProperty(hotel: any, cityName: string, currency: string): Property {
    const { price, originalPrice } = extractPrice(hotel);
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
        image: hotel.thumbnailUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
        images: hotel.details?.hotel_images_photos ? hotel.details.hotel_images_photos.map((p: any) => p.url) : [],
        amenities: hotel.hotelFacilities || hotel.details?.hotelFacilities || hotel.details?.facilities || [],
        badges: [],
        type: 'hotel',
        coordinates: {
            lat: hotel.latitude || hotel.details?.latitude || hotel.details?.location?.latitude || 0,
            lng: hotel.longitude || hotel.details?.longitude || hotel.details?.location?.longitude || 0,
        },
        refundableTag,
        distance: hotel.distance || hotel.details?.distance_from_center || hotel.details?.distance || undefined,
        boardTypes: hotel.boardTypes || [],
    } as Property;
}

/**
 * Main search function - fetches properties from LiteAPI.
 */
export async function fetchSearchProperties(params: SearchParams): Promise<Property[]> {
    const queryParams = buildSearchQueryParams(params);

    try {
        const data = await searchLiteApi(queryParams);

        if (data?.data && Array.isArray(data.data)) {
            const properties = data.data.map((hotel: any) =>
                transformHotelToProperty(hotel, queryParams.cityName, queryParams.currency)
            );

            // Filter out hotels with incomplete data (ID-like names indicate missing details)
            const filteredProperties = properties.filter((prop: Property) => {
                // Exclude hotels where name looks like an ID (e.g., "Hotel lp38f17b", "Hotel lpe13f0")
                const hasValidName = prop.name &&
                    !prop.name.match(/^Hotel\s+lp[a-z0-9]+$/i) &&
                    !prop.name.match(/^lp[a-z0-9]+$/i);
                return hasValidName;
            });

            return filteredProperties;
        }
    } catch (e) {
        console.error("Failed to fetch properties:", e);
    }

    return [];
}
