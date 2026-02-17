import type { Property } from '@/data/mockProperties';
import { formatCurrency } from '@/lib/utils';

export interface MappableProperty extends Property {
    coordinates: { lat: number; lng: number };
}

export const buildGeoJson = (properties: MappableProperty[]) => {
    return {
        type: 'FeatureCollection' as const,
        features: properties.map((p) => ({
            type: 'Feature' as const,
            properties: {
                id: p.id,
                price: p.price,
                formattedPrice: formatCurrency(p.price),
                // Add other properties if needed for popups/filtering
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
