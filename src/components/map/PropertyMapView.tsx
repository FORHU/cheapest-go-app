'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { NavigationControl } from 'react-map-gl/mapbox';
import { Map } from '@/components/ui/map';
import { MapMarker } from './MapMarker';
import { MapPopup } from './MapPopup';
import { computeBounds } from './types';
import type { MappableProperty } from './types';

interface PropertyMapViewProps {
    properties: MappableProperty[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string | null) => void;
    onHover: (id: string | null) => void;
    onViewDetails: (id: string) => void;
}

const PropertyMapView = React.memo(function PropertyMapView({
    properties,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
    onViewDetails,
}: PropertyMapViewProps) {
    const mapRef = useRef<MapRef>(null);

    const bounds = useMemo(() => computeBounds(properties), [properties]);

    const selectedProperty = useMemo(
        () => (selectedId ? properties.find((p) => p.id === selectedId) ?? null : null),
        [selectedId, properties]
    );

    const handleMarkerClick = useCallback(
        (id: string) => {
            const property = properties.find((p) => p.id === id);
            if (!property) return;

            onSelect(id);
            mapRef.current?.flyTo({
                center: [property.coordinates.lng, property.coordinates.lat],
                zoom: 15,
                pitch: 45,
                duration: 1200,
            });
        },
        [properties, onSelect]
    );

    const handlePopupClose = useCallback(() => {
        onSelect(null);
    }, [onSelect]);

    const handleMapClick = useCallback(() => {
        onSelect(null);
    }, [onSelect]);

    const handleMapLoad = useCallback(() => {
        if (properties.length === 0) return;

        const map = mapRef.current;
        if (!map) return;

        if (properties.length === 1) {
            map.flyTo({
                center: [bounds.centerLng, bounds.centerLat],
                zoom: 14,
                duration: 0,
            });
            return;
        }

        // Fit bounds with padding
        map.fitBounds(
            [
                [bounds.minLng, bounds.minLat],
                [bounds.maxLng, bounds.maxLat],
            ],
            {
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                maxZoom: 15,
                duration: 0,
            }
        );
    }, [properties.length, bounds]);

    return (
        <div className="relative w-full h-full">
            <Map
                ref={mapRef}
                mapStyle="standard"
                standardConfig={{
                    lightPreset: 'day',
                    show3dObjects: true,
                    show3dBuildings: true,
                }}
                initialViewState={{
                    longitude: bounds.centerLng || 120.596,
                    latitude: bounds.centerLat || 16.402,
                    zoom: 12,
                    pitch: 0,
                    bearing: 0,
                }}
                maxPitch={60}
                onClick={handleMapClick}
                onLoad={handleMapLoad}
                className="rounded-none"
            >
                <NavigationControl position="top-right" showCompass visualizePitch />

                {properties.map((property) => (
                    <MapMarker
                        key={property.id}
                        property={property}
                        isSelected={selectedId === property.id}
                        isHovered={hoveredId === property.id}
                        onClick={handleMarkerClick}
                        onHover={onHover}
                    />
                ))}

                {selectedProperty && (
                    <MapPopup
                        property={selectedProperty}
                        onClose={handlePopupClose}
                        onViewDetails={onViewDetails}
                    />
                )}
            </Map>

            {/* Property count badge */}
            <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-slate-900 dark:text-white px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-xs font-medium">
                {properties.length} {properties.length === 1 ? 'property' : 'properties'} on map
            </div>
        </div>
    );
});

export { PropertyMapView };
export type { PropertyMapViewProps };
