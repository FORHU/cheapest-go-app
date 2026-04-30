import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';

interface MapSourceLayersProps {
    routeGeojson: any;
    gemsGeojson: any;
    activeRouteGeometry: any;
    showDirections: boolean;
}

export const MapSourceLayers: React.FC<MapSourceLayersProps> = ({
    routeGeojson,
    gemsGeojson,
    activeRouteGeometry,
    showDirections
}) => {
    const hasRoute = routeGeojson?.geometry || (routeGeojson?.features && routeGeojson.features.length > 0);

    return (
        <>
            {hasRoute && (
                <Source id="route-source" type="geojson" data={routeGeojson}>
                    <Layer
                        id="route-layer-casing"
                        type="line"
                        layout={{ 
                            'line-cap': 'round', 
                            'line-join': 'round', 
                        }}
                        paint={{ 
                            'line-color': showDirections ? '#ffffff' : 'transparent', 
                            'line-width': 8, 
                            'line-opacity': 0.6 
                        }}
                    />
                    <Layer
                        id="route-layer"
                        type="line"
                        layout={{ 
                            'line-cap': 'round', 
                            'line-join': 'round', 
                        }}
                        paint={{ 
                            'line-color': ['case', ['boolean', ['get', 'isOptimized'], false], '#10b981', '#3b82f6'], 
                            'line-width': showDirections ? 5 : 6, 
                            'line-opacity': showDirections ? 0.9 : 0.8,
                            'line-dasharray': ['case', ['boolean', ['get', 'isOptimized'], false], ['literal', [2, 2]], ['literal', [1]]]
                        }}
                    />
                </Source>
            )}

            <Source id="gems-source" type="geojson" data={gemsGeojson}>
                <Layer
                    id="gems-layer"
                    type="symbol"
                    layout={{
                        'icon-image': [
                            'match',
                            ['get', 'category'],
                            'Restaurant', 'restaurant',
                            'Dining', 'restaurant',
                            'Cafe', 'cafe',
                            'Park', 'park',
                            'Shopping', 'shop',
                            'Grocery', 'shop',
                            'Hospital', 'hospital',
                            'Transit', 'bus',
                            'attraction'
                        ],
                        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 1.2],
                        'icon-allow-overlap': true,
                        'text-field': ['get', 'name'],
                        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
                        'text-size': 10,
                        'text-offset': [0, 1.5],
                        'text-anchor': 'top',
                        'text-optional': true
                    }}
                    minzoom={8}
                    paint={{
                        'text-color': '#1e293b',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1.5,
                        'icon-opacity': [
                            'case',
                            ['boolean', ['feature-state', 'active'], false], 1.0,
                            0.8
                        ]
                    }}
                />
            </Source>
        </>
    );
};
