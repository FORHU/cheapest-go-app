import type { NearbyPlace } from './useMapNearbyPlaces';

/**
 * TEMPORARY SCAFFOLDING — delete this file once POI discovery returns results.
 *
 * Both discovery sources used by useNearbyGems currently come back empty:
 *   - GET /api/places/discover        → { features: [] }
 *   - Mapbox Search Box /category/... → HTTP 200 with features: []
 *
 * With no places, the circular POI icons could never render, so there was no way
 * to see or iterate on the marker + preview-card UI. These stand-ins give the map
 * something to draw. They are only used in development, and only when real
 * discovery returns nothing — see PropertyMapView's nearbyPlaceMarkers memo.
 */

/** Offset a coordinate by `meters` along a compass `bearingDeg`. */
function offsetCoord(lat: number, lng: number, meters: number, bearingDeg: number) {
    const R = 6371000;
    const br = (bearingDeg * Math.PI) / 180;
    const dLat = (meters * Math.cos(br)) / R;
    const dLng = (meters * Math.sin(br)) / (R * Math.cos((lat * Math.PI) / 180));
    return {
        lat: lat + (dLat * 180) / Math.PI,
        lng: lng + (dLng * 180) / Math.PI,
    };
}

// Spread across bearings and distances so the smallest (1 km) radius still shows
// several, and the category mix exercises every marker colour.
const PLACEHOLDER_SPEC: Array<{
    name: string;
    category: string;
    meters: number;
    bearing: number;
    rating?: number;
}> = [
    { name: 'Sample Restaurant', category: 'restaurant', meters: 260, bearing: 20, rating: 4.5 },
    { name: 'Sample Cafe', category: 'cafe', meters: 420, bearing: 75, rating: 4.2 },
    { name: 'Sample Park', category: 'park', meters: 350, bearing: 140, rating: 4.7 },
    { name: 'Sample Museum', category: 'museum', meters: 610, bearing: 200, rating: 4.4 },
    { name: 'Sample Supermarket', category: 'supermarket', meters: 480, bearing: 255, rating: 4.0 },
    { name: 'Sample Pharmacy', category: 'pharmacy', meters: 300, bearing: 310, rating: 3.9 },
    { name: 'Sample Station', category: 'train_station', meters: 720, bearing: 355, rating: 4.1 },
    { name: 'Sample Gallery', category: 'attraction', meters: 880, bearing: 105, rating: 4.6 },
];

/** Build stand-in nearby places arranged around the given anchor coordinate. */
export function buildPlaceholderNearbyPlaces(lat: number, lng: number): NearbyPlace[] {
    return PLACEHOLDER_SPEC.map((spec) => {
        const { lat: pLat, lng: pLng } = offsetCoord(lat, lng, spec.meters, spec.bearing);
        return {
            name: spec.name,
            category: spec.category,
            lat: pLat,
            lng: pLng,
            rating: spec.rating,
            vicinity: 'Placeholder — POI discovery returned no results',
        };
    });
}
