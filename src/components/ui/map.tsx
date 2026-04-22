'use client';

import * as React from 'react';
import MapboxMap, {
    type MapRef,
    type MapProps as MapboxMapProps,
    Source,
    Layer,
} from 'react-map-gl/mapbox';
import { cn } from '@/lib/utils';

/** Standard style config properties */
interface StandardStyleConfig {
    lightPreset?: 'dawn' | 'day' | 'dusk' | 'night';
    theme?: 'default' | 'faded' | 'monochrome';
    show3dObjects?: boolean;
    show3dBuildings?: boolean;
    show3dTrees?: boolean;
    show3dLandmarks?: boolean;
    show3dFacades?: boolean;
    showPlaceLabels?: boolean;
    showPointOfInterestLabels?: boolean;
    showRoadLabels?: boolean;
    showTransitLabels?: boolean;
    showTraffic?: boolean;
    showTransit?: boolean;
    showPedestrianRoads?: boolean;
    language?: string;
    colorBuildings?: string;
    colorLand?: string;
    colorWater?: string;
    colorRoads?: string;
}

interface MapProps extends Omit<MapboxMapProps, 'mapStyle' | 'terrain'> {
    className?: string;
    mapStyle?: 'standard' | string;
    standardConfig?: StandardStyleConfig;
    enable3DTerrain?: boolean;
    terrainExaggeration?: number;
    enable3DBuildings?: boolean;
    buildingColor?: string;
    buildingOpacity?: number;
    antialias?: boolean;
    onStyleReady?: (map: mapboxgl.Map) => void;
}

function Buildings3DLayer({
    color = '#aaa',
    opacity = 0.8,
    beforeId,
}: {
    color?: string;
    opacity?: number;
    beforeId?: string;
}) {
    return (
        <Layer
            id="3d-buildings"
            beforeId={beforeId}
            source="composite"
            source-layer="building"
            filter={['==', 'extrude', 'true']}
            type="fill-extrusion"
            minzoom={15}
            paint={{
                'fill-extrusion-color': color,
                'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.5,
                    ['get', 'height'],
                ],
                'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.5,
                    ['get', 'min_height'],
                ],
                'fill-extrusion-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.5,
                    opacity,
                ],
            }}
        />
    );
}

/**
 * Standard style with ALL 3D features baked into the initial config.
 * This ensures facades, landmarks, trees are loaded from the start.
 * Runtime changes (lightPreset) are applied via setConfigProperty.
 */
const STANDARD_STYLE_URL = 'mapbox://styles/mapbox/standard';

import { env } from '@/utils/env';

const Map = React.memo(
    React.forwardRef<MapRef, MapProps>(
        (
            {
                className,
                mapStyle = 'standard',
                standardConfig,
                enable3DTerrain = false,
                terrainExaggeration = 1.5,
                enable3DBuildings = false,
                buildingColor = '#aaa',
                buildingOpacity = 0.8,
                antialias = true,
                children,
                onLoad,
                onStyleReady,
                ...props
            },
            ref
        ) => {
            const isStandard = mapStyle === 'standard';
            const internalRef = React.useRef<MapRef>(null);
            const mapRef = (ref as React.RefObject<MapRef | null>) || internalRef;
            const [isStyleLoaded, setIsStyleLoaded] = React.useState(false);
            const [mapReady, setMapReady] = React.useState(false);
            const [firstSymbolId, setFirstSymbolId] = React.useState<string>();

            // Handle style loading and configuration
            React.useEffect(() => {
                const map = mapRef.current?.getMap();
                if (!map || !mapReady) return;

                setIsStyleLoaded(false);

                const setup = () => {
                    if (!map || !map.getStyle()) return;

                    try {
                        const style = map.getStyle();
                        
                        // Global language set (Standard + others)
                        if (!isStandard && style?.layers) {
                            style.layers.forEach((layer: any) => {
                                if (layer.type === 'symbol' && layer.layout?.['text-field']) {
                                    map.setLayoutProperty(layer.id, 'text-field', [
                                        'coalesce',
                                        ['get', 'name_en'],
                                        ['get', 'name'],
                                    ]);
                                }
                            });
                        }

                        // Find the first symbol layer to insert 3D buildings underneath
                        if (style?.layers) {
                            const firstSymbol = style.layers.find((l) => l.type === 'symbol');
                            if (firstSymbol) {
                                setFirstSymbolId(firstSymbol.id);
                            }
                        }

                        // Apply initial runtime config for standard style
                        if (isStandard && standardConfig) {
                            Object.entries(standardConfig).forEach(([key, value]) => {
                                if (value !== undefined) {
                                    try {
                                        const current = (map as any).getConfigProperty?.('basemap', key);
                                        if (current !== value) {
                                            map.setConfigProperty('basemap', key, value);
                                        }
                                    } catch (e) {
                                        // Ignore errors during initial burst
                                    }
                                }
                            });
                        }

                        // Add terrain programmatically after style loads
                        if (enable3DTerrain) {
                            if (!map.getSource('mapbox-dem')) {
                                map.addSource('mapbox-dem', {
                                    type: 'raster-dem',
                                    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                                    tileSize: 512,
                                    maxzoom: 14,
                                });
                            }
                            map.setTerrain({
                                source: 'mapbox-dem',
                                exaggeration: terrainExaggeration,
                            });
                        }

                        setIsStyleLoaded(true);
                        onStyleReady?.(map);
                    } catch (err) {
                        console.warn('Map setup failed, retrying...', err);
                        setTimeout(setup, 300);
                    }
                };

                if (map.isStyleLoaded()) {
                    setup();
                } else {
                    map.once('style.load', setup);

                    // Polling fallback: with reuseMaps + Standard style, the
                    // style.load event may have already fired before we
                    // registered the listener, and isStyleLoaded() can briefly
                    // return false. Poll a few times to catch this race.
                    let attempts = 0;
                    const poll = setInterval(() => {
                        attempts++;
                        if (map.isStyleLoaded()) {
                            clearInterval(poll);
                            map.off('style.load', setup);
                            setup();
                        } else if (attempts >= 20) {
                            clearInterval(poll);
                        }
                    }, 250);

                    // Clean up on unmount or effect re-run
                    return () => {
                        clearInterval(poll);
                        map.off('style.load', setup);
                    };
                }
            }, [
                mapStyle,
                mapReady,
                isStandard,
                // Note: standardConfig is excluded here to avoid setup reset on every config change.
                enable3DTerrain,
                terrainExaggeration,
            ]);

            const token = env.MAPBOX_TOKEN;
            if (!token) {
                console.error('Mapbox token is missing!');
            }

            const handleLoad = React.useCallback(
                (e: mapboxgl.MapboxEvent) => {
                    setMapReady(true);
                    onLoad?.(e);
                },
                [onLoad]
            );

            // Optimized runtime config updates (e.g. switching lightPreset)
            // Uses a separate effect to apply properties without triggering the full setup logic.
            const lastConfigRef = React.useRef<string>('');
            React.useEffect(() => {
                if (!isStandard || !standardConfig || !isStyleLoaded) return;

                const map = mapRef.current?.getMap();
                if (!map) return;

                const configStr = JSON.stringify(standardConfig);
                if (configStr === lastConfigRef.current) return;
                lastConfigRef.current = configStr;

                try {
                    const map = mapRef.current?.getMap();
                    if (!map || !map.isStyleLoaded()) return;

                    Object.entries(standardConfig).forEach(([key, value]) => {
                        if (value !== undefined) {
                            try {
                                const current = (map as any).getConfigProperty?.('basemap', key);
                                if (current !== value) {
                                    map.setConfigProperty('basemap', key, value);
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    });
                } catch (err) {
                    console.warn('Failed to update config property', err);
                }
            }, [isStandard, standardConfig, isStyleLoaded, mapRef]);

            const resolvedStyle = isStandard ? STANDARD_STYLE_URL : mapStyle;

            return (
                <div
                    className={cn(
                        'relative w-full h-full min-h-[200px] rounded-lg overflow-hidden',
                        className
                    )}
                >
                    <MapboxMap
                        ref={mapRef}
                        mapboxAccessToken={env.MAPBOX_TOKEN}
                        mapStyle={resolvedStyle as MapboxMapProps['mapStyle']}
                        onLoad={handleLoad}
                        reuseMaps
                        antialias={antialias}
                        {...props}
                    >
                        {isStyleLoaded && (
                            <>
                                {!isStandard && enable3DTerrain && (
                                    <Source
                                        id="mapbox-dem"
                                        type="raster-dem"
                                        url="mapbox://mapbox.mapbox-terrain-dem-v1"
                                        tileSize={512}
                                        maxzoom={14}
                                    />
                                )}
                                {!isStandard && enable3DBuildings && (
                                    <Buildings3DLayer
                                        color={buildingColor}
                                        opacity={buildingOpacity}
                                        beforeId={firstSymbolId}
                                    />
                                )}
                                {children}
                            </>
                        )}
                    </MapboxMap>
                </div>
            );
        }
    )
);

Map.displayName = 'Map';

export { Map, Buildings3DLayer };
export type { MapProps, StandardStyleConfig };
