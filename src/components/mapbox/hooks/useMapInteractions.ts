import { useCallback, useRef, useMemo } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';

export interface PoiData {
    name: string;
    category: string;
    coordinates: { lat: number; lng: number };
}

interface UseMapInteractionsOptions {
    mapRef: React.RefObject<MapRef | null>;
    onSelectId: (id: string | null) => void;
    onSelectPoi: (poi: PoiData | null) => void;
    onHoverPoi: (poi: PoiData | null) => void;
}

// ─── Shared helpers (module-level — no re-creation on render) ───────────────

/** Returns the first feature that looks like a named POI from Mapbox Standard or a discovery layer. */
const findPoiFeature = (features: any[]): any | undefined =>
    features.find((f: any) => {
        const name = f.properties?.name || f.properties?.name_en || f.properties?.text;
        const layerId: string = f.layer?.id || '';
        const isPoiLayer =
            layerId.includes('poi') ||
            layerId.includes('place') ||
            layerId.includes('transit') ||
            layerId.includes('landmark') ||
            layerId === 'discovery-poi-layer';
        const isPoiSource =
            f.sourceLayer === 'poi' ||
            f.sourceLayer === 'transit' ||
            f.source?.id === 'discovery-source';
        return name && (isPoiLayer || isPoiSource);
    });

/** Extracts lng/lat from a Point feature; falls back to the map cursor position. */
const extractPoiCoords = (
    feature: any,
    fallback: { lng: number; lat: number }
): { lng: number; lat: number } => {
    if (feature.geometry?.type === 'Point') {
        return {
            lng: feature.geometry.coordinates[0],
            lat: feature.geometry.coordinates[1],
        };
    }
    return fallback;
};

/** Builds a PoiData object from a rendered feature + cursor fallback. */
const buildPoiData = (
    feature: any,
    fallback: { lng: number; lat: number }
): PoiData => {
    const name =
        feature.properties?.name ||
        feature.properties?.name_en ||
        feature.properties?.text;
    const category =
        feature.properties?.class ||
        feature.properties?.category ||
        feature.properties?.type ||
        'Point of Interest';
    const coordinates = extractPoiCoords(feature, fallback);
    return { name, category, coordinates };
};

// Layers we care about for click/hover detection.
// Restricting queryRenderedFeatures to these avoids hit-testing thousands of
// Standard-style building/road/label layers on every pointer event.
const INTERACTIVE_LAYERS = [
    'unclustered-point',
    'unclustered-point-text',
    'clusters',
    'discovery-poi-layer',
];

// Broader set for POI detection (symbol layers from Standard style)
const POI_QUERY_RADIUS = 4; // px — small bbox around cursor for POI detection

// ─── Hook ───────────────────────────────────────────────────────────────────

export const useMapInteractions = ({
    mapRef,
    onSelectId,
    onSelectPoi,
    onHoverPoi,
}: UseMapInteractionsOptions) => {

    const handleMapClick = useCallback((e: any) => {
        const map = e.target;
        if (!map || !e.point) return;

        try {
            // 1. Fast path: check only our interactive layers first
            const interactiveHits = map.queryRenderedFeatures(e.point, {
                layers: INTERACTIVE_LAYERS.filter(id => {
                    try { return !!map.getLayer(id); } catch { return false; }
                }),
            });

            const propertyFeature = interactiveHits.find((f: any) =>
                f.layer?.id === 'unclustered-point' ||
                f.layer?.id === 'unclustered-point-text' ||
                f.layer?.id === 'clusters'
            );

            if (propertyFeature) {
                if (propertyFeature.layer.id === 'clusters') {
                    onSelectPoi(null);
                    const clusterId = propertyFeature.properties.cluster_id;
                    const mapboxSource = map.getSource('properties') as any;
                    mapboxSource.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                        if (err) return;
                        map.easeTo({ center: propertyFeature.geometry.coordinates, zoom });
                    });
                } else {
                    onSelectId(propertyFeature.properties.id);
                    onSelectPoi(null);
                }
                return;
            }

            // 2. Discovery layer hit?
            const discoveryHit = interactiveHits.find((f: any) => f.layer?.id === 'discovery-poi-layer');
            if (discoveryHit) {
                onSelectPoi(buildPoiData(discoveryHit, { lng: e.lngLat.lng, lat: e.lngLat.lat }));
                return;
            }

            // 3. Slow path: small bbox query for Standard-style POI symbols
            const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
                [e.point.x - POI_QUERY_RADIUS, e.point.y - POI_QUERY_RADIUS],
                [e.point.x + POI_QUERY_RADIUS, e.point.y + POI_QUERY_RADIUS],
            ];
            const poiHits = map.queryRenderedFeatures(bbox);
            const poiFeature = findPoiFeature(poiHits);

            if (poiFeature) {
                onSelectPoi(buildPoiData(poiFeature, { lng: e.lngLat.lng, lat: e.lngLat.lat }));
            } else {
                // Clicked blank space — clear both selections
                onSelectId(null);
                onSelectPoi(null);
            }

        } catch (err) {
            console.error('Error querying features:', err);
        }
    }, [onSelectId, onSelectPoi]);

    // Throttled hover handler — keep map interaction smooth under heavy marker density.
    // Only queries our known interactive layers, not the full Standard style.
    const lastMoveTime = useRef<number>(0);
    const lastPoiName = useRef<string | null>(null);
    const onMouseMove = useCallback((e: any) => {
        const now = Date.now();
        // Increased throttle to ~150ms (~7fps) — hover tooltips don't need 60fps
        if (now - lastMoveTime.current < 150) return;
        lastMoveTime.current = now;

        const map = e.target;
        if (!map || !e.point) return;

        try {
            // Skip expensive POI hit-testing while map is actively panning/zooming.
            if (map.isMoving() || map.isZooming() || map.isRotating()) {
                map.getCanvas().style.cursor = '';
                if (lastPoiName.current !== null) {
                    lastPoiName.current = null;
                    onHoverPoi(null);
                }
                return;
            }

            // Fast path: only query our known interactive layers
            const activeLayers = INTERACTIVE_LAYERS.filter(id => {
                try { return !!map.getLayer(id); } catch { return false; }
            });

            const interactiveHits = activeLayers.length > 0
                ? map.queryRenderedFeatures(e.point, { layers: activeLayers })
                : [];

            // Over a property marker?
            const isProperty = interactiveHits.some((f: any) =>
                f.layer?.id === 'unclustered-point' ||
                f.layer?.id === 'unclustered-point-text' ||
                f.layer?.id === 'clusters'
            );

            if (isProperty) {
                map.getCanvas().style.cursor = 'pointer';
                if (lastPoiName.current !== null) {
                    lastPoiName.current = null;
                    onHoverPoi(null);
                }
                return;
            }

            // Over a discovery POI?
            const discoveryHit = interactiveHits.find((f: any) => f.layer?.id === 'discovery-poi-layer');
            if (discoveryHit) {
                map.getCanvas().style.cursor = 'pointer';
                const nextName = discoveryHit.properties?.name || null;
                if (nextName !== lastPoiName.current) {
                    lastPoiName.current = nextName;
                    onHoverPoi(buildPoiData(discoveryHit, { lng: e.lngLat.lng, lat: e.lngLat.lat }));
                }
                return;
            }

            // Not over any interactive element — clear hover state
            map.getCanvas().style.cursor = '';
            if (lastPoiName.current !== null) {
                lastPoiName.current = null;
                onHoverPoi(null);
            }
        } catch {
            // Ignore transient rendering-query errors during style transitions
        }
    }, [onHoverPoi]);

    return { handleMapClick, onMouseMove };
};
