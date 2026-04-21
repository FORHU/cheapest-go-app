import { LayerProps } from 'react-map-gl/mapbox';

export const clusterLayer: LayerProps = {
    id: 'clusters',
    type: 'circle',
    source: 'properties',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': ['step', ['get', 'point_count'], '#3b82f6', 10, '#2563eb', 30, '#1d4ed8'],
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
    },
};

export const clusterCountLayer: LayerProps = {
    id: 'cluster-count',
    type: 'symbol',
    source: 'properties',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
    },
    paint: {
        'text-color': '#ffffff',
    },
};

