import { useCallback } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';

interface UseMapInteractionsProps {
    mapRef: React.RefObject<MapRef | null>;
    onSelectId: (id: string | null) => void;
}

export const useMapInteractions = ({
    mapRef,
    onSelectId,
}: UseMapInteractionsProps) => {

    const handleMapClick = useCallback((e: any) => {
        const feature = e.features?.[0];

        if (!feature) {
            // Clicked background -> deselect
            onSelectId(null);
            return;
        }

        const clusterId = feature.properties?.cluster_id;

        if (clusterId) {
            const map = mapRef.current?.getMap();
            if (map) {
                (map.getSource('properties') as any).getClusterExpansionZoom(
                    clusterId,
                    (err: any, zoom: number) => {
                        if (err) return;
                        map.easeTo({
                            center: (feature.geometry as any).coordinates,
                            zoom,
                        });
                    }
                );
            }
            return;
        }

        // Handle single point click
        const id = feature.properties?.id;
        if (id) {
            e.originalEvent.stopPropagation();
            onSelectId(id);
        }
    }, [mapRef, onSelectId]);

    const onMouseEnter = useCallback(() => {
        if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = 'pointer';
        }
    }, [mapRef]);

    const onMouseLeave = useCallback(() => {
        if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = '';
        }
    }, [mapRef]);

    return {
        handleMapClick,
        onMouseEnter,
        onMouseLeave,
    };
};
