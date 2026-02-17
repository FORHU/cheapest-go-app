import { MapRef } from 'react-map-gl/mapbox';

export const mapFlyTo = (
    map: MapRef,
    coordinates: { lat: number; lng: number },
    zoom: number = 15
) => {
    map.flyTo({
        center: [coordinates.lng, coordinates.lat],
        zoom,
        pitch: 60,
        duration: 1200,
        essential: true, // Animation is essential
    });
};

export const mapEaseTo = (
    map: MapRef,
    coordinates: { lat: number; lng: number },
    zoom: number
) => {
    map.easeTo({
        center: [coordinates.lng, coordinates.lat],
        zoom,
        duration: 800,
        essential: true,
    });
};
