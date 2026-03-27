import { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { getBoundsFromProperties } from '../utils/getBoundsFromProperties';
import { MappableProperty } from '../utils/buildGeoJson';

interface UseMapViewportProps {
    mapRef: React.RefObject<MapRef | null>; // Fix: Allow null in RefObject type
    isMapLoaded: boolean;
    properties: MappableProperty[];
    selectedId?: string | null;
}

export const useMapViewport = ({
    mapRef,
    isMapLoaded,
    properties,
    selectedId,
}: UseMapViewportProps) => {
    const propertiesKey = properties.map(p => p.id).join(',');
    const hasFittedRef = useRef<string | null>(null);

    // 1. Fit bounds on load / properties change
    useEffect(() => {
        if (!isMapLoaded || properties.length === 0) return;
        // If we have a selection, don't refit bounds (prevents jumping if properties update while selected)
        if (selectedId) return;

        // Only fit bounds if the property list has actually changed (prevents zooming out when dialogs close)
        if (hasFittedRef.current === propertiesKey) return;

        const map = mapRef.current;
        if (!map) return;

        const bounds = getBoundsFromProperties(properties);
        hasFittedRef.current = propertiesKey;

        if (properties.length === 1) {
            map.flyTo({
                center: [bounds.centerLng, bounds.centerLat],
                zoom: 15,
                pitch: 45,
                bearing: -10,
                duration: 1000,
            });
            return;
        }

        map.fitBounds(
            [
                [bounds.minLng, bounds.minLat],
                [bounds.maxLng, bounds.maxLat],
            ],
            {
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                maxZoom: 16,
                duration: 1000,
                pitch: 45,
                bearing: -10,
            }
        );
    }, [isMapLoaded, propertiesKey, mapRef, selectedId]);

    // 2. Fly to specific property when selected
    useEffect(() => {
        if (!isMapLoaded || !selectedId) return;

        const map = mapRef.current;
        if (!map) return;

        const selectedProperty = properties.find((p) => p.id === selectedId);
        if (selectedProperty && selectedProperty.coordinates) {
            map.flyTo({
                center: [selectedProperty.coordinates.lng, selectedProperty.coordinates.lat],
                zoom: 17, // Zoom in for 3D view
                pitch: 60, // Higher pitch for 3D effect
                bearing: -20, // Slight rotation
                duration: 1200, // Smooth animation
                essential: true
            });
        }
    }, [isMapLoaded, selectedId, properties, mapRef]);
};
