import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { clusterLayer, clusterCountLayer, unclusteredBgLayer, unclusteredPriceLayer, clusterGlowLayer } from '../utils/mapLayerConfig';

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
            promoteId="id"
        >
            {/* Cluster Layers */}
            <Layer {...clusterGlowLayer as any} />
            <Layer {...clusterLayer as any} />
            <Layer {...clusterCountLayer as any} />

            {/* Unclustered Property Layers (WebGL) */}
            <Layer {...unclusteredBgLayer as any} />
            <Layer {...unclusteredPriceLayer as any} />
        </Source>
    );
});

