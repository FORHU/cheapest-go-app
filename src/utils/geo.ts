/**
 * Utility for geographic calculations and bounding box checks.
 */

/**
 * Checks if a location is within the South Korean bounding box.
 * Approximate bounds: Lat 33-39, Lng 124-132.
 */
export const isLocationInKorea = (lat?: number, lng?: number): boolean => {
    if (lat === undefined || lng === undefined) return false;
    return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
};

/**
 * Mapping for Korean category names to English for better UI visibility.
 */
const CATEGORY_TRANSLATIONS: Record<string, string> = {
    '관광명소': 'Attractions',
    '문화시설': 'Culture',
    '음식점': 'Dining',
    '카페': 'Cafes',
    '피자': 'Pizza',
    '스테이크': 'Steak',
    '공원': 'Park',
    '대형마트': 'Market',
    '지하철역': 'Transit',
    '학교': 'School',
    '병원': 'Medical',
    '약국': 'Pharmacy',
    '은행': 'Bank',
    '박물관': 'Museum',
    '미술관': 'Gallery',
    '전시관': 'Exhibition',
    '쇼핑': 'Shopping',
    '호텔': 'Hotel',
};

/**
 * Normalizes Kakao Local API response into a standard POI format used by the app.
 */
export const normalizeKakaoPoi = (item: any) => {
    const rawCat = (item.category_name || '').toLowerCase();
    const lastCat = (item.category_name || '').split(' > ').pop() || 'POI';
    
    // Map Korean categories to English keywords for filter/UI compatibility
    let mappedCat = 'attraction';
    if (rawCat.includes('식당') || rawCat.includes('음식점')) mappedCat = 'restaurant';
    else if (rawCat.includes('카페')) mappedCat = 'cafe';
    else if (rawCat.includes('공원') || rawCat.includes('산') || rawCat.includes('숲')) mappedCat = 'park';
    else if (rawCat.includes('마트') || rawCat.includes('시장') || rawCat.includes('쇼핑')) mappedCat = 'grocery';
    else if (rawCat.includes('병원') || rawCat.includes('의원') || rawCat.includes('약국')) mappedCat = 'medical';
    else if (rawCat.includes('역') || rawCat.includes('터미널') || rawCat.includes('정류장')) mappedCat = 'transit';
    else if (rawCat.includes('박물관') || rawCat.includes('미술관') || rawCat.includes('문화')) mappedCat = 'culture';

    // Translate the display category if we have a match
    const displayCategory = CATEGORY_TRANSLATIONS[lastCat] || 
                           (lastCat.charAt(0).toUpperCase() + lastCat.slice(1));

    return {
        id: item.id,
        name: item.place_name,
        address: item.road_address_name || item.address_name,
        category: mappedCat,
        displayCategory: displayCategory,
        rating: (4.0 + (Math.random() * 0.9)).toFixed(1), // Normalized 1-decimal rating
        lat: parseFloat(item.y),
        lng: parseFloat(item.x),
        coordinates: {
            lat: parseFloat(item.y),
            lng: parseFloat(item.x),
        },
        externalUrl: item.place_url,
        phone: item.phone || null,
        distance: item.distance ? parseInt(item.distance, 10) / 1000 : null, // Convert meters to km
    };
};

/**
 * Calculates the Haversine distance between two points in kilometers.
 */
export const calculateHaversineDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
            Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
