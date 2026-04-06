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
    showPedestrianRoads?: boolean;
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
const STANDARD_STYLE = {
    version: 8 as const,
    imports: [
        {
            id: 'basemap',
            url: 'mapbox://styles/mapbox/standard',
            config: {
                lightPreset: 'day',
                show3dObjects: true,
                show3dBuildings: true,
                show3dTrees: true,
                show3dLandmarks: true,
                show3dFacades: true,
                showPlaceLabels: true,
                showPointOfInterestLabels: true,
                showRoadLabels: true,
                showTransitLabels: true,
                showPedestrianRoads: true,
            },
        },
    ],
    sources: {} as Record<string, never>,
    layers: [] as never[],
};

import { env } from '@/utils/env';

const Map = React.forwardRef<MapRef, MapProps>(
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
            children,
            onLoad,
            ...props
        },
        ref
    ) => {
        const isStandard = mapStyle === 'standard';
        const internalRef = React.useRef<MapRef>(null);
        const mapRef = (ref as React.RefObject<MapRef | null>) || internalRef;
        const styleReady = React.useRef(false);
        const [firstSymbolId, setFirstSymbolId] = React.useState<string>();

        const token = env.MAPBOX_TOKEN;
        if (!token) {
            console.error('Mapbox token is missing!');
        }

        const handleLoad = React.useCallback(
            (e: mapboxgl.MapboxEvent) => {
                const map = (mapRef as React.RefObject<MapRef | null>).current?.getMap();
                if (!map) {
                    onLoad?.(e);
                    return;
                }

                const setup = () => {
                    try {
                        // Find the first symbol layer to insert 3D buildings underneath
                        const layers = map.getStyle()?.layers;
                        if (layers) {
                            const firstSymbol = layers.find(l => l.type === 'symbol');
                            if (firstSymbol) {
                                setFirstSymbolId(firstSymbol.id);
                            }
                        }

                        // Apply any runtime config overrides (e.g. non-default lightPreset)
                        if (isStandard && standardConfig) {
                            for (const [key, value] of Object.entries(standardConfig)) {
                                if (value !== undefined) {
                                    map.setConfigProperty('basemap', key, value);
                                }
                            }
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

                        styleReady.current = true;
                    } catch {
                        setTimeout(setup, 300);
                    }
                };

                if (map.isStyleLoaded()) {
                    setup();
                } else {
                    map.once('style.load', setup);
                }

                onLoad?.(e);
            },
            [isStandard, standardConfig, enable3DTerrain, terrainExaggeration, mapRef, onLoad]
        );

        // Runtime config updates (e.g. switching lightPreset)
        React.useEffect(() => {
            if (!isStandard || !standardConfig || !styleReady.current) return;

            const map = (mapRef as React.RefObject<MapRef | null>).current?.getMap();
            if (!map) return;

            try {
                for (const [key, value] of Object.entries(standardConfig)) {
                    if (value !== undefined) {
                        map.setConfigProperty('basemap', key, value);
                    }
                }
            } catch {
                // Ignore
            }
        }, [isStandard, standardConfig, mapRef]);

        const resolvedStyle = isStandard ? STANDARD_STYLE : mapStyle;

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
                    {...props}
                >
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
                </MapboxMap>
            </div>
        );
    }
);

Map.displayName = 'Map';

export { Map, Buildings3DLayer };
export type { MapProps, StandardStyleConfig };
