import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';

interface TripRouteLayerProps {
    routeGeometry: GeoJSON.Geometry | null;
}

/**
 * Renders a glowing route line on the map — ported from mirror-app's RouteLayer.
 * Uses 4 stacked layers (outer glow → core) for the cyan glow effect.
 */
export const TripRouteLayer = ({ routeGeometry }: TripRouteLayerProps) => {
    if (!routeGeometry) return null;

    const geojson: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: routeGeometry,
    };

    return (
        <Source id="trip-route" type="geojson" data={geojson}>
            {/* Outer glow */}
            <Layer
                id="trip-route-glow-outer"
                type="line"
                paint={{
                    'line-color': '#4fc3f7',
                    'line-width': 22,
                    'line-opacity': 0.18,
                    'line-blur': 8,
                }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
            {/* Mid glow */}
            <Layer
                id="trip-route-glow-mid"
                type="line"
                paint={{
                    'line-color': '#29b6f6',
                    'line-width': 12,
                    'line-opacity': 0.45,
                    'line-blur': 4,
                }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
            {/* Inner glow */}
            <Layer
                id="trip-route-glow-inner"
                type="line"
                paint={{
                    'line-color': '#81d4fa',
                    'line-width': 6,
                    'line-opacity': 0.8,
                    'line-blur': 1,
                }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
            {/* Core line */}
            <Layer
                id="trip-route-core"
                type="line"
                paint={{
                    'line-color': '#ffffff',
                    'line-width': 3,
                    'line-opacity': 1,
                }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
        </Source>
    );
};
