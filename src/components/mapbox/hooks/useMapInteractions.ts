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
    onSelectPoi: (poi: PoiData | null) => void;
    onHoverPoi: (poi: PoiData | null) => void;
}

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
            const allFeatures = map.queryRenderedFeatures(e.point);
            
            // 1. Check for Property Clicks first
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
                        map.easeTo({
                            center: propertyFeature.geometry.coordinates,
                            zoom: zoom
                        });
                    });
                    return;
                } else {
                    onSelectId(propertyFeature.properties.id);
                    onSelectPoi(null);
                    return;
                }
            }

            // 2. Check for POI Clicks (Mapbox Standard obscures true layer IDs)
            const poiFeature = allFeatures.find((f: any) => {
                const name = f.properties?.name || f.properties?.name_en || f.properties?.text;
                // Look for typical POI indicators in layer ID or source Layer
                const layerId = f.layer?.id || '';
                const isPoiLayer = layerId.includes('poi') || layerId.includes('place') || layerId.includes('transit') || layerId.includes('landmark');
                const isPoiSource = f.sourceLayer === 'poi' || f.sourceLayer === 'transit';
                return name && (isPoiLayer || isPoiSource);
            });

            if (poiFeature) {
                const name = poiFeature.properties?.name || poiFeature.properties?.name_en || poiFeature.properties?.text;
                let lng, lat;
                
                if (poiFeature.geometry?.type === 'Point') {
                    lng = poiFeature.geometry.coordinates[0];
                    lat = poiFeature.geometry.coordinates[1];
                } else {
                    lng = e.lngLat.lng;
                    lat = e.lngLat.lat;
                }

                onSelectPoi({
                    name,
                    category: poiFeature.properties?.class || poiFeature.properties?.category || poiFeature.properties?.type || 'Point of Interest',
                    coordinates: { lng, lat }
                });
            } else {
                // Clicked blank space
                onSelectId(null);
                onSelectPoi(null);
            }

        } catch (err) {
            console.error("Error querying features:", err);
        }
    }, [onSelectId, onSelectPoi]);

    // Handle hover states manually to bypass interactiveLayerIds limitations in Standard style
    const lastMoveTime = useRef<number>(0);
    const onMouseMove = useCallback((e: any) => {
        const now = Date.now();
        if (now - lastMoveTime.current < 80) return; // throttle to ~12fps
        lastMoveTime.current = now;

        const map = e.target;
        if (!map || !e.point) return;

        try {
            const allFeatures = map.queryRenderedFeatures(e.point);
            
            // Is over property?
            const isProperty = allFeatures.some((f: any) => 
                f.layer?.id === 'unclustered-point' || 
                f.layer?.id === 'unclustered-point-text' || 
                f.layer?.id === 'clusters'
            );

            if (isProperty) {
                map.getCanvas().style.cursor = 'pointer';
                onHoverPoi(null);
                return;
            }

            // Is over POI?
            const poiFeature = allFeatures.find((f: any) => {
                const name = f.properties?.name || f.properties?.name_en || f.properties?.text;
                const layerId = f.layer?.id || '';
                const isPoiLayer = layerId.includes('poi') || layerId.includes('place') || layerId.includes('transit') || layerId.includes('landmark');
                const isPoiSource = f.sourceLayer === 'poi' || f.sourceLayer === 'transit';
                return name && (isPoiLayer || isPoiSource);
            });

            if (poiFeature) {
                map.getCanvas().style.cursor = 'pointer';
                const name = poiFeature.properties?.name || poiFeature.properties?.name_en || poiFeature.properties?.text;
                
                let lng, lat;
                if (poiFeature.geometry?.type === 'Point') {
                    lng = poiFeature.geometry.coordinates[0];
                    lat = poiFeature.geometry.coordinates[1];
                } else {
                    lng = e.lngLat.lng;
                    lat = e.lngLat.lat;
                }

                onHoverPoi({
                    name,
                    category: poiFeature.properties?.class || poiFeature.properties?.category || poiFeature.properties?.type || 'Point of Interest',
                    coordinates: { lng, lat }
                });
            } else {
                map.getCanvas().style.cursor = '';
                onHoverPoi(null);
            }
        } catch (err) {
            // Ignore temporary rendering query errors
        }
    }, [onHoverPoi]);

    return {
        handleMapClick,
        onMouseMove,
    };
};
