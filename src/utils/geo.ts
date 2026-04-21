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
 * Normalizes Kakao Local API response into a standard POI format used by the app.
 */
export const normalizeKakaoPoi = (item: any) => {
    return {
        id: item.id,
        name: item.place_name,
        address: item.road_address_name || item.address_name,
        category: (item.category_name || '').split(' > ').pop() || 'POI',
        coordinates: {
            lat: parseFloat(item.y),
            lng: parseFloat(item.x),
        },
        externalUrl: item.place_url,
        phone: item.phone || null,
        distance: item.distance ? parseInt(item.distance) : null,
    };
};
