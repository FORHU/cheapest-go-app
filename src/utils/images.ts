/**
 * Image and asset related utilities.
 */

/**
 * Creates a Mapbox-native 'Real' visual URL for a location.
 * Uses Mapbox Static Images API to provide a geographical pinpoint of the spot.
 */
export const getMapboxPoiImage = (name: string, lat: number, lng: number): string => {
    return `/api/poi-photo?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}`;
};
