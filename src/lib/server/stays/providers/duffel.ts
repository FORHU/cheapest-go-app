import { SearchQueryParams } from '@/lib/search/fetchSearchData';
import type { Property } from '@/types';

const DUFFEL_API = 'https://api.duffel.com';

async function duffelFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = process.env.DUFFEL_ACCESS_TOKEN;
    if (!token) throw new Error('DUFFEL_ACCESS_TOKEN not set');

    const res = await fetch(`${DUFFEL_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Duffel-Version': 'v2',
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(init.headers ?? {}),
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Duffel ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
}

// Coordinates for popular destinations — Duffel Stays uses geographic search
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    // Korea
    'seoul': { lat: 37.5665, lng: 126.9780 },
    'busan': { lat: 35.1796, lng: 129.0756 },
    'jeju': { lat: 33.4890, lng: 126.4983 },
    'incheon': { lat: 37.4563, lng: 126.7052 },
    // Japan
    'tokyo': { lat: 35.6762, lng: 139.6503 },
    'osaka': { lat: 34.6937, lng: 135.5023 },
    'kyoto': { lat: 35.0116, lng: 135.7681 },
    'sapporo': { lat: 43.0618, lng: 141.3545 },
    'fukuoka': { lat: 33.5904, lng: 130.4017 },
    'nara': { lat: 34.6851, lng: 135.8050 },
    'hiroshima': { lat: 34.3853, lng: 132.4553 },
    'okinawa': { lat: 26.2124, lng: 127.6809 },
    // Southeast Asia
    'bangkok': { lat: 13.7563, lng: 100.5018 },
    'phuket': { lat: 7.9519, lng: 98.3381 },
    'pattaya': { lat: 12.9236, lng: 100.8825 },
    'chiang mai': { lat: 18.7883, lng: 98.9853 },
    'koh samui': { lat: 9.5120, lng: 100.0136 },
    'krabi': { lat: 8.0863, lng: 98.9063 },
    'singapore': { lat: 1.3521, lng: 103.8198 },
    'kuala lumpur': { lat: 3.1390, lng: 101.6869 },
    'penang': { lat: 5.4141, lng: 100.3288 },
    'langkawi': { lat: 6.3500, lng: 99.8000 },
    'kota kinabalu': { lat: 5.9749, lng: 116.0724 },
    'bali': { lat: -8.3405, lng: 115.0920 },
    'jakarta': { lat: -6.2088, lng: 106.8456 },
    'yogyakarta': { lat: -7.7956, lng: 110.3695 },
    'manila': { lat: 14.5995, lng: 120.9842 },
    'cebu': { lat: 10.3157, lng: 123.8854 },
    'boracay': { lat: 11.9674, lng: 121.9248 },
    'da nang': { lat: 16.0544, lng: 108.2022 },
    'ho chi minh': { lat: 10.8231, lng: 106.6297 },
    'hanoi': { lat: 21.0285, lng: 105.8542 },
    'hoi an': { lat: 15.8801, lng: 108.3380 },
    // East Asia
    'hong kong': { lat: 22.3193, lng: 114.1694 },
    'taipei': { lat: 25.0330, lng: 121.5654 },
    'beijing': { lat: 39.9042, lng: 116.4074 },
    'shanghai': { lat: 31.2304, lng: 121.4737 },
    'guangzhou': { lat: 23.1291, lng: 113.2644 },
    'shenzhen': { lat: 22.5431, lng: 114.0579 },
    // South Asia / Middle East
    'dubai': { lat: 25.2048, lng: 55.2708 },
    'abu dhabi': { lat: 24.4539, lng: 54.3773 },
    'doha': { lat: 25.2854, lng: 51.5310 },
    'istanbul': { lat: 41.0082, lng: 28.9784 },
    'delhi': { lat: 28.6139, lng: 77.2090 },
    'new delhi': { lat: 28.6139, lng: 77.2090 },
    'mumbai': { lat: 19.0760, lng: 72.8777 },
    'goa': { lat: 15.2993, lng: 74.1240 },
    'colombo': { lat: 6.9271, lng: 79.8612 },
    'kathmandu': { lat: 27.7172, lng: 85.3240 },
    // Europe
    'london': { lat: 51.5074, lng: -0.1278 },
    'paris': { lat: 48.8566, lng: 2.3522 },
    'amsterdam': { lat: 52.3676, lng: 4.9041 },
    'frankfurt': { lat: 50.1109, lng: 8.6821 },
    'munich': { lat: 48.1351, lng: 11.5820 },
    'berlin': { lat: 52.5200, lng: 13.4050 },
    'rome': { lat: 41.9028, lng: 12.4964 },
    'milan': { lat: 45.4654, lng: 9.1859 },
    'madrid': { lat: 40.4168, lng: -3.7038 },
    'barcelona': { lat: 41.3851, lng: 2.1734 },
    'zurich': { lat: 47.3769, lng: 8.5417 },
    'vienna': { lat: 48.2082, lng: 16.3738 },
    'athens': { lat: 37.9838, lng: 23.7275 },
    'lisbon': { lat: 38.7223, lng: -9.1393 },
    'brussels': { lat: 50.8503, lng: 4.3517 },
    'prague': { lat: 50.0755, lng: 14.4378 },
    'budapest': { lat: 47.4979, lng: 19.0402 },
    'warsaw': { lat: 52.2297, lng: 21.0122 },
    'stockholm': { lat: 59.3293, lng: 18.0686 },
    'oslo': { lat: 59.9139, lng: 10.7522 },
    'copenhagen': { lat: 55.6761, lng: 12.5683 },
    'helsinki': { lat: 60.1699, lng: 24.9384 },
    // Americas
    'new york': { lat: 40.7128, lng: -74.0060 },
    'los angeles': { lat: 34.0522, lng: -118.2437 },
    'san francisco': { lat: 37.7749, lng: -122.4194 },
    'miami': { lat: 25.7617, lng: -80.1918 },
    'chicago': { lat: 41.8781, lng: -87.6298 },
    'toronto': { lat: 43.6532, lng: -79.3832 },
    'vancouver': { lat: 49.2827, lng: -123.1207 },
    'cancun': { lat: 21.1619, lng: -86.8515 },
    'mexico city': { lat: 19.4326, lng: -99.1332 },
    // Oceania
    'sydney': { lat: -33.8688, lng: 151.2093 },
    'melbourne': { lat: -37.8136, lng: 144.9631 },
    'auckland': { lat: -36.8485, lng: 174.7633 },
};

interface DuffelStayRate {
    id: string;
    total_amount: string;
    total_currency: string;
    tax_amount?: string;
    board_type?: string;
    conditions?: {
        refund_policies?: { refund_type: string; before?: string }[];
    };
    supported_loyalty_programmes?: { reference: string; name: string }[];
}

interface DuffelStayRoom {
    id: string;
    name?: string;
    beds?: { type: string; count: number }[];
    rates: DuffelStayRate[];
}

interface DuffelStayResult {
    accommodation: {
        id: string;
        name: string;
        description?: string;
        rating?: number;
        review_score?: number;
        review_count?: number;
        photos?: { url: string }[];
        amenities?: { type: string; description?: string }[];
        location?: {
            address?: {
                city_name?: string;
                line_1?: string;
                country_code?: string;
            };
            geographic?: { latitude: number; longitude: number };
        };
        check_in_information?: {
            check_in_before_time?: string;
            check_in_after_time?: string;
        };
    };
    rooms: DuffelStayRoom[];
}

function transformDuffelStay(result: DuffelStayResult, params: SearchQueryParams): Property | null {
    const { accommodation, rooms } = result;

    // Pick cheapest rate across all rooms
    let cheapestRate: DuffelStayRate | null = null;
    let cheapestPrice = Infinity;

    for (const room of rooms) {
        for (const rate of room.rates ?? []) {
            const amount = parseFloat(rate.total_amount);
            if (!isNaN(amount) && amount > 0 && amount < cheapestPrice) {
                cheapestPrice = amount;
                cheapestRate = rate;
            }
        }
    }

    if (!cheapestRate || cheapestPrice <= 0) return null;

    const refundType = cheapestRate.conditions?.refund_policies?.[0]?.refund_type;
    const refundableTag = refundType === 'full_refund' ? 'RFN' :
        refundType === 'no_refund' ? 'NRFN' : undefined;

    // Duffel review_score is 0–10; rating (stars) is 1–5 → convert to 0–10
    const rating = accommodation.review_score ??
        (accommodation.rating ? accommodation.rating * 2 : 0);

    const boardType = cheapestRate.board_type?.replace(/_/g, ' ') ?? 'room only';

    return {
        id: accommodation.id,
        name: accommodation.name,
        location: accommodation.location?.address?.line_1 ??
            accommodation.location?.address?.city_name ?? params.cityName,
        description: accommodation.description ?? 'No description available',
        rating,
        reviews: accommodation.review_count ?? 0,
        price: cheapestPrice,
        currency: cheapestRate.total_currency,
        image: accommodation.photos?.[0]?.url ??
            'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
        images: (accommodation.photos ?? []).map(p => p.url),
        amenities: (accommodation.amenities ?? []).map(a => a.description ?? a.type),
        badges: cheapestRate.supported_loyalty_programmes?.length
            ? ['Loyalty eligible']
            : [],
        type: 'hotel',
        coordinates: {
            lat: accommodation.location?.geographic?.latitude ?? 0,
            lng: accommodation.location?.geographic?.longitude ?? 0,
        },
        refundableTag,
        boardTypes: [boardType],
        city: params.cityName,
        provider: 'duffel',
        rateId: cheapestRate.id,
    };
}

/** Geocode a city name to lat/lng via Google Geocoding API as a fallback. */
async function geocodeCity(
    cityName: string,
    countryCode?: string
): Promise<{ lat: number; lng: number } | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    try {
        const query = countryCode ? `${cityName}, ${countryCode}` : cityName;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
        const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24 h
        if (!res.ok) return null;

        const json = await res.json();
        const location = json.results?.[0]?.geometry?.location;
        if (!location) return null;

        return { lat: location.lat, lng: location.lng };
    } catch {
        return null;
    }
}

/**
 * Search Duffel Stays and return results in the unified Property format.
 * Coordinates come from the built-in lookup table first; unknown cities are
 * geocoded via Google Geocoding API so any destination works.
 */
export async function searchDuffelStays(params: SearchQueryParams): Promise<Property[]> {
    if (!process.env.DUFFEL_ACCESS_TOKEN) return [];

    const key = params.cityName.toLowerCase().trim();
    let coords: { lat: number; lng: number } | null = CITY_COORDS[key] ?? CITY_COORDS[key.split(' ')[0]] ?? null;

    if (!coords) {
        coords = await geocodeCity(params.cityName, params.countryCode);
        if (!coords) {
            console.log(`[DuffelStays] Could not resolve coordinates for "${params.cityName}" — skipping`);
            return [];
        }
        console.log(`[DuffelStays] Geocoded "${params.cityName}" → ${coords.lat}, ${coords.lng}`);
    }

    try {
        // Build guests array
        const guests: { type: string; age?: number }[] = [];
        for (let i = 0; i < params.adults; i++) guests.push({ type: 'adult' });
        if (params.childrenAges?.length) {
            for (const age of params.childrenAges) guests.push({ type: 'child', age });
        } else {
            for (let i = 0; i < (params.children ?? 0); i++) guests.push({ type: 'child', age: 10 });
        }

        // Step 1: Create search
        const createRes = await duffelFetch<{ data: { id: string } }>('/stays/searches', {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    check_in_date: params.checkin,
                    check_out_date: params.checkout,
                    rooms: params.rooms,
                    guests,
                    location: {
                        geographic: {
                            latitude: coords.lat,
                            longitude: coords.lng,
                            radius: 10,
                        },
                    },
                },
            }),
        });

        const searchId = createRes.data.id;

        // Step 2: Poll until complete (max ~8 s)
        let results: DuffelStayResult[] = [];
        for (let attempt = 0; attempt < 4; attempt++) {
            await new Promise(r => setTimeout(r, 2000));
            const res = await duffelFetch<{
                data: { results: DuffelStayResult[]; search_status?: string };
            }>(`/stays/searches/${searchId}/results`);

            results = res.data?.results ?? [];
            if (results.length > 0 || res.data?.search_status === 'complete') break;
        }

        const properties = results
            .map(r => transformDuffelStay(r, params))
            .filter((p): p is Property => p !== null);

        console.log(`[DuffelStays] "${params.cityName}": ${properties.length} results`);
        return properties;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 404 = Stays product not enabled on this Duffel account (contact Duffel to activate)
        if (msg.includes('404')) {
            console.warn('[DuffelStays] Stays API not enabled on this account — skipping');
        } else {
            console.error('[DuffelStays] Search failed:', msg);
        }
        return [];
    }
}
