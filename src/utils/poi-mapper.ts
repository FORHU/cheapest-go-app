import { Landmark } from 'lucide-react';
import { POI_ICON_MAP, MAP_FILTER_CONFIG } from '@/config/map-discovery';

/**
 * Maps Mapbox feature properties to a standardized POI format.
 */
export const mapPoiDetails = (feature: any) => {
    const { properties } = feature;
    const category = properties?.class || properties?.type || properties?.category || 'attraction';
    const poiName = properties?.name || properties?.name_en || 'Point of Interest';

    const matchedClass = Object.keys(POI_ICON_MAP).find(key => 
        category.toLowerCase().includes(key)
    ) || 'attraction';

    return {
        name: poiName,
        icon: POI_ICON_MAP[matchedClass] || Landmark,
        category: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' '),
        coordinates: {
            lng: feature.geometry.coordinates[0],
            lat: feature.geometry.coordinates[1],
        },
    };
};

/**
 * Determines the general category ID for a Mapbox feature based on its class/type/category.
 */
export const getMapPoiCategory = (mapboxFeature: any) => {
    const { properties } = mapboxFeature;
    const category = (properties?.class || properties?.type || properties?.category || '').toLowerCase();
    const matched = MAP_FILTER_CONFIG.find(filter =>
        filter.keywords.some(keyword => category.includes(keyword))
    );
    return matched?.id || null;
};
