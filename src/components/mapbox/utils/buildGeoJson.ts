import { type Property } from '@/types';
import { formatCurrency } from '@/lib/utils';

export interface MappableProperty extends Property {
    coordinates: { lat: number; lng: number };
}

/**
 * Builds a GeoJSON FeatureCollection from mappable properties.
 *
 * @param properties     Filtered, valid properties.
 * @param displayPrices  Optional map of property ID to a pre-formatted price string
 *                       (e.g. currency-converted). Falls back to the property's own
 *                       price + currency when absent.
 */
export const buildGeoJson = (
    properties: MappableProperty[],
    displayPrices?: Record<string, string>,
) => {
    return {
        type: 'FeatureCollection' as const,
        features: properties.map((p) => ({
            type: 'Feature' as const,
            // Top-level id is required for setFeatureState / promoteId
            id: p.id,
            properties: {
                id: p.id,
                price: p.price,
                // Pre-formatted string consumed by the GL symbol layer
                displayPrice: displayPrices?.[p.id] ?? formatCurrency(p.price, p.currency),
                name: p.name,
                rating: p.rating,
                image: p.images[0],
            },
            geometry: {
                type: 'Point' as const,
                coordinates: [p.coordinates.lng, p.coordinates.lat],
            },
        })),
    };
};
