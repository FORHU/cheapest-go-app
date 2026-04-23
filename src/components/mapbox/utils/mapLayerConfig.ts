import { LayerProps } from 'react-map-gl/mapbox';

// ─── Cluster layers ──────────────────────────────────────────────────────────

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

// ─── Unclustered property marker layers ──────────────────────────────────────
// These are GPU-rendered (WebGL) alternatives to per-property React <Marker>
// components. Switching to these layers removes N DOM nodes from the page,
// which eliminates the CSS transform layout thrashing that caused map pan lag.

/**
 * White circle pill background.
 * Uses feature-state "hover" for the blue ring on hover,
 * and feature-state "selected" for the elevated selected look.
 */
export const unclusteredBgLayer: LayerProps = {
    id: 'unclustered-point',           // kept as 'unclustered-point' so existing queryRenderedFeatures checks still match
    type: 'circle',
    source: 'properties',
    filter: ['!', ['has', 'point_count']],
    paint: {
        'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 12,
            15, 18,
        ],
        'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#3b82f6',
            '#ffffff'
        ],
        'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 2.5,
            ['boolean', ['feature-state', 'selected'], false], 0,
            1.5
        ],
        'circle-stroke-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], '#3b82f6',
            '#d1d5db'
        ],
        'circle-opacity': 0.97,
        'circle-translate': [0, 0],
        'circle-pitch-alignment': 'viewport',
    },
};

/**
 * Price text on top of the circle.
 * Colour inverts when the marker is selected (white-on-blue).
 */
export const unclusteredPriceLayer: LayerProps = {
    id: 'unclustered-point-text',
    type: 'symbol',
    source: 'properties',
    filter: ['!', ['has', 'point_count']],
    layout: {
        'text-field': ['get', 'displayPrice'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': [
            'interpolate', ['linear'], ['zoom'],
            10, 9,
            15, 11,
        ],
        'text-anchor': 'center',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-pitch-alignment': 'viewport',
    },
    paint: {
        'text-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#ffffff',
            '#1e293b'
        ],
        'text-halo-color': 'rgba(0,0,0,0)',
        'text-halo-width': 0,
    },
};
