import { useCallback, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';

export interface PoiData {
    name: string;
    category: string;
    coordinates: { lat: number; lng: number };
}

interface UseMapInteractionsOptions {
    mapRef: React.RefObject<MapRef | null>;
    onSelectId: (id: string | null) => void;
    onHoverId: (id: string | null) => void;
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

// ─── Hook ───────────────────────────────────────────────────────────────────

export const useMapInteractions = ({
    mapRef,
    onSelectId,
    onHoverId,
    onSelectPoi,
    onHoverPoi,
}: UseMapInteractionsOptions) => {

    const handleMapClick = useCallback((e: any) => {
        const map = e.target;
        if (!map || !e.point) return;

        try {
            const allFeatures = map.queryRenderedFeatures(e.point);

            // 1. Property / cluster clicks take priority
            const propertyFeature = allFeatures.find((f: any) =>
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

            // 2. POI clicks (Mapbox Standard obscures true layer IDs)
            const poiFeature = findPoiFeature(allFeatures);

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
    const lastMoveTime = useRef<number>(0);
    const lastPoiName = useRef<string | null>(null);
    const onMouseMove = useCallback((e: any) => {
        const now = Date.now();
        if (now - lastMoveTime.current < 200) return;
        lastMoveTime.current = now;

        const map = e.target;
        if (!map || !e.point) return;

        try {
            // Skip expensive POI hit-testing while map is actively panning/zooming.
            if (map.isMoving()) {
                map.getCanvas().style.cursor = '';
                if (lastPoiName.current !== null) {
                    lastPoiName.current = null;
                    onHoverPoi(null);
                }
                return;
            }

            const allRendered = map.queryRenderedFeatures(e.point);
            const propertyFeatures = allRendered.filter((f: any) => 
                f.layer?.id === 'unclustered-point' || 
                f.layer?.id === 'unclustered-point-text' || 
                f.layer?.id === 'clusters'
            );

            // Over a property marker?
            const isProperty = propertyFeatures.length > 0;

            if (isProperty) {
                map.getCanvas().style.cursor = 'pointer';
                const propFeature = propertyFeatures.find((f: any) => f.layer.id !== 'clusters');
                if (propFeature) {
                    onHoverId(propFeature.properties.id);
                }
                
                if (lastPoiName.current !== null) {
                    lastPoiName.current = null;
                    onHoverPoi(null);
                }
                return;
            }

            // Not over a property marker
            onHoverId(null);

            // Over a POI?
            const poiFeature = findPoiFeature(allRendered);

            if (poiFeature) {
                map.getCanvas().style.cursor = 'pointer';
                const nextName =
                    poiFeature.properties?.name ||
                    poiFeature.properties?.name_en ||
                    poiFeature.properties?.text ||
                    null;
                if (nextName !== lastPoiName.current) {
                    lastPoiName.current = nextName;
                    onHoverPoi(buildPoiData(poiFeature, { lng: e.lngLat.lng, lat: e.lngLat.lat }));
                }
            } else {
                map.getCanvas().style.cursor = '';
                if (lastPoiName.current !== null) {
                    lastPoiName.current = null;
                    onHoverPoi(null);
                }
            }
        } catch {
            // Ignore transient rendering-query errors during style transitions
        }
    }, [onHoverPoi]);

    return { handleMapClick, onMouseMove };
};
