import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { clusterLayer, clusterCountLayer, unclusteredPointLayer, unclusteredPointTextLayer } from '../utils/mapLayerConfig';

interface ClusterLayerProps {
    geoJsonData: any;
    shouldCluster: boolean;
    selectedId: string | null;
    hoveredId: string | null;
}

export const ClusterLayer = React.memo(({
    geoJsonData,
    shouldCluster,
    selectedId,
    hoveredId,
}: ClusterLayerProps) => {
    return (
        <Source
            id="properties"
            type="geojson"
            data={geoJsonData}
            cluster={shouldCluster}
            clusterMaxZoom={16}
            clusterRadius={60}
        >
            {/* Cluster Layers */}
            <Layer {...clusterLayer as any} />
            <Layer {...clusterCountLayer as any} />
        </Source>
    );
});

