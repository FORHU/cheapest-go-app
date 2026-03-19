import { useRef, useState, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';

export const useMapboxInstance = () => {
    const mapRef = useRef<MapRef>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    const handleMapLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) {
            // Find the first symbol layer to insert buildings beneath labels
            const layers = map.getStyle()?.layers ?? [];
            const firstSymbolId = layers.find((l) => l.type === 'symbol')?.id;

            // Add 3D buildings fill-extrusion layer using the composite source
            // that streets-v12 already provides
            if (!map.getLayer('3d-buildings')) {
                map.addLayer(
                    {
                        id: '3d-buildings',
                        source: 'composite',
                        'source-layer': 'building',
                        type: 'fill-extrusion',
                        minzoom: 12,
                        filter: ['==', 'extrude', 'true'],
                        paint: {
                            'fill-extrusion-color': '#e8d5b0',
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                15.05,
                                ['get', 'height'],
                            ],
                            'fill-extrusion-base': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                15.05,
                                ['get', 'min_height'],
                            ],
                            'fill-extrusion-opacity': 0.6,
                        },
                    },
                    firstSymbolId // insert before labels so text renders on top
                );
            }
        }
        setIsMapLoaded(true);
    }, []);

    return {
        mapRef,
        isMapLoaded,
        handleMapLoad,
    };
};
