import { useEffect, useMemo, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { getBoundsFromProperties } from '../utils/getBoundsFromProperties';
import { MappableProperty } from '../utils/buildGeoJson';

interface UseMapViewportProps {
    mapRef: React.RefObject<MapRef | null>;
    isMapLoaded: boolean;
    properties: MappableProperty[];
    selectedId?: string | null;
    /** When true, skip the flyTo animation when a property is selected. */
    disableFlyToSelected?: boolean;
    /** When true, skip the auto-fitBounds on initial load (e.g. when a district bbox handles it). */
    disableInitialFit?: boolean;
}

export const useMapViewport = ({
    mapRef,
    isMapLoaded,
    properties,
    selectedId,
    disableFlyToSelected = false,
    disableInitialFit = false,
}: UseMapViewportProps) => {
    const propertiesKey = useMemo(() => properties.map(p => p.id).join(','), [properties]);
    const hasFittedRef = useRef<string | null>(null);

    // 1. Fit bounds on load / properties change
    useEffect(() => {
        if (disableInitialFit) return;
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
                pitch: 0,
                bearing: 0,
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
                pitch: 0,
                bearing: 0,
            }
        );
    }, [isMapLoaded, propertiesKey, mapRef, selectedId, disableInitialFit]);

    // 2. Fly to specific property when selected (skip if caller opted out)
    useEffect(() => {
        if (!isMapLoaded || !selectedId || disableFlyToSelected) return;

        const map = mapRef.current;
        if (!map) return;

        const selectedProperty = properties.find((p) => p.id === selectedId);
        if (selectedProperty && selectedProperty.coordinates) {
            map.flyTo({
                center: [selectedProperty.coordinates.lng, selectedProperty.coordinates.lat],
                zoom: 16,
                pitch: 0,
                bearing: 0,
                duration: 800,
                essential: true
            });
        }
    }, [isMapLoaded, selectedId, properties, mapRef, disableFlyToSelected]);
};
