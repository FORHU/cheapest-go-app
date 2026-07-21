import React from 'react';
import { Marker, Source, Layer } from 'react-map-gl/mapbox';
import type { GpsPosition } from '../hooks/useGpsTracking';

interface GpsMarkerProps {
    position: GpsPosition;
}

/**
 * Renders the user's real-time GPS position on the map.
 *
 * Visual elements:
 * - Blue pulsing accuracy circle (radius = GPS accuracy radius in metres)
 * - Solid blue dot with white border at the exact location
 * - Directional heading indicator (compass arrow) when heading data is available
 */
export const GpsMarker = ({ position }: GpsMarkerProps) => {
    const { latitude, longitude, accuracy, heading } = position;

    // Build a GeoJSON circle for the accuracy radius
    const accuracyCircle = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
            type: 'Point' as const,
            coordinates: [longitude, latitude],
        },
    };

    return (
        <>
            {/* Accuracy radius halo */}
            <Source id="gps-accuracy-source" type="geojson" data={accuracyCircle}>
                <Layer
                    id="gps-accuracy-layer"
                    type="circle"
                    paint={{
                        'circle-radius': {
                            stops: [
                                [0, 0],
                                [20, accuracy / 0.075], // rough metres → pixels conversion
                            ],
                            base: 2,
                        },
                        'circle-color': '#3b82f6',
                        'circle-opacity': 0.15,
                        'circle-stroke-color': '#3b82f6',
                        'circle-stroke-width': 1,
                        'circle-stroke-opacity': 0.3,
                    }}
                />
            </Source>

            {/* Dot marker */}
            <Marker latitude={latitude} longitude={longitude} anchor="center">
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Pulsing ring animation */}
                    <span
                        style={{
                            position: 'absolute',
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'rgba(59,130,246,0.4)',
                            animation: 'gps-pulse 2s ease-out infinite',
                        }}
                    />
                    {/* Heading arrow — only show when heading is available */}
                    {heading !== null && (
                        <div
                            style={{
                                position: 'absolute',
                                width: 0,
                                height: 0,
                                borderLeft: '5px solid transparent',
                                borderRight: '5px solid transparent',
                                borderBottom: '12px solid #3b82f6',
                                transform: `rotate(${heading}deg) translateY(-16px)`,
                                transformOrigin: 'center bottom',
                            }}
                        />
                    )}
                    {/* Core dot */}
                    <div
                        style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: '#3b82f6',
                            border: '2.5px solid white',
                            boxShadow: '0 0 0 2px rgba(59,130,246,0.35), 0 2px 6px rgba(0,0,0,0.3)',
                            zIndex: 1,
                        }}
                    />
                </div>
            </Marker>

            <style>{`
                @keyframes gps-pulse {
                    0%   { transform: scale(0.6); opacity: 0.9; }
                    70%  { transform: scale(2.2); opacity: 0; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
            `}</style>
        </>
    );
};
