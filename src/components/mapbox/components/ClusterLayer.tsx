import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { clusterLayer, clusterCountLayer, unclusteredBgLayer, unclusteredPriceLayer, clusterGlowLayer } from '../utils/mapLayerConfig';

interface ClusterLayerProps {
    geoJsonData: any;
    shouldCluster: boolean;
    targetCurrency: string;
    symbol: string;
}

export const ClusterLayer = React.memo(({ geoJsonData, shouldCluster, targetCurrency, symbol }: ClusterLayerProps) => {
    // Format for abbreviated prices (e.g., 1200 -> 1.2k)
    const priceTextField = [
        'concat',
        symbol,
        [
            'case',
            ['>=', ['get', 'minPrice'], 1000000],
            ['concat', ['round', ['/', ['get', 'minPrice'], 1000000]], 'M'],
            ['>=', ['get', 'minPrice'], 1000],
            ['concat', ['round', ['/', ['get', 'minPrice'], 1000]], 'k'],
            ['to-string', ['round', ['get', 'minPrice']]]
        ],
        '+'
    ];

    return (
        <Source
            id="properties"
            type="geojson"
            data={geoJsonData}
            cluster={shouldCluster}
            clusterMaxZoom={16}
            clusterRadius={60}
            clusterProperties={{
                minPrice: ['min', ['get', 'convertedPrice']]
            }}
            promoteId="id"
        >
            {/* Cluster Layers */}
            <Layer {...clusterGlowLayer as any} />
            <Layer {...clusterLayer as any} />
            <Layer
                {...clusterCountLayer as any}
                layout={{
                    ...clusterCountLayer.layout as any,
                    'text-field': priceTextField as any
                }}
            />

            {/* Unclustered Property Layers (WebGL) - Removed in favor of React MapMarkers */}
        </Source>
    );
});

