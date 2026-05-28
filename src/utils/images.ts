/**
 * Returns a URL for a POI image.
 *
 * Routes through the /api/poi-photo proxy which tries:
 *   1. Google Places Photo API  (prefers real photos)
 *   2. Foursquare Photos API    (cross-provider fallback)
 *   3. Styled text placeholder  (absolute last resort — no map tiles)
 *
 * Accepts an optional placeId / fsqId so the proxy can skip the
 * name-based search step and hit the correct provider directly.
 */
export const getPoiImageUrl = (
    name: string,
    lat: number,
    lng: number,
    options?: {
        category?: string;
        placeId?: string;
        fsqId?: string;
    }
): string => {
    const params = new URLSearchParams({
        name,
        lat: String(lat),
        lng: String(lng),
    });
    if (options?.category) params.set('category', options.category);
    if (options?.placeId)  params.set('placeId',  options.placeId);
    if (options?.fsqId)    params.set('fsqId',    options.fsqId);
    return `/api/poi-photo?${params.toString()}`;
};

/**
 * @deprecated Use `getPoiImageUrl` instead.
 * Kept for backwards-compatibility — now delegates to the smart proxy
 * rather than returning a Mapbox static map tile.
 */
export const getMapboxPoiImage = (
    name: string,
    lat: number,
    lng: number,
    category?: string
): string => getPoiImageUrl(name, lat, lng, { category });
