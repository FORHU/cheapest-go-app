import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { clusterLayer, clusterCountLayer } from '../utils/mapLayerConfig';

interface ClusterLayerProps {
    geoJsonData: any;
    shouldCluster: boolean;
}

export const ClusterLayer = React.memo(({ geoJsonData, shouldCluster }: ClusterLayerProps) => {
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

