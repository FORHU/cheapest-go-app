/**
 * Determines how to display a trip map based on the distance between the
 * user's current GPS position and the hotel's coordinates.
 *
 * ground   < 50 km   → draw route + offer navigation
 * regional 50–500 km → too far to drive directly, show destination overview
 * air      > 500 km  → likely flying, show destination area map only
 */

export type TravelMode = 'ground' | 'regional' | 'air' | 'resolving';

interface Coords {
    lat: number;
    lng: number;
}

const GROUND_THRESHOLD_KM  = 50;
const AIR_THRESHOLD_KM     = 500;

function haversineKm(a: Coords, b: Coords): number {
    const R  = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h =
        sinLat * sinLat +
        Math.cos((a.lat * Math.PI) / 180) *
            Math.cos((b.lat * Math.PI) / 180) *
            sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface TravelModeResult {
    mode: TravelMode;
    distanceKm: number | null;
}

export function resolveTravelMode(
    userCoords: Coords | null,
    hotelCoords: Coords | null,
): TravelModeResult {
    if (!userCoords || !hotelCoords) return { mode: 'resolving', distanceKm: null };

    const distanceKm = haversineKm(userCoords, hotelCoords);

    let mode: TravelMode;
    if (distanceKm < GROUND_THRESHOLD_KM)       mode = 'ground';
    else if (distanceKm < AIR_THRESHOLD_KM)     mode = 'regional';
    else                                          mode = 'air';

    return { mode, distanceKm };
}
