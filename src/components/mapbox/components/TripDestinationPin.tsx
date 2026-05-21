import React from 'react';
import { Marker } from 'react-map-gl/mapbox';

interface TripDestinationPinProps {
    lat: number;
    lng: number;
    label?: string;
}

/**
 * Red teardrop pin marking the hotel destination — ported from mirror-app's DestinationPin.
 */
export const TripDestinationPin = ({ lat, lng, label }: TripDestinationPinProps) => (
    <Marker latitude={lat} longitude={lng} anchor="bottom">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg
                width="36"
                height="46"
                viewBox="0 0 36 46"
                fill="none"
                style={{ filter: 'drop-shadow(0px 6px 14px rgba(239,68,68,0.55))' }}
            >
                {/* Teardrop body */}
                <path
                    d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 28 18 28S36 31.5 36 18C36 8.059 27.941 0 18 0z"
                    fill="#ef4444"
                />
                {/* White ring */}
                <circle cx="18" cy="18" r="9" fill="white" opacity="0.9" />
                {/* Center dot */}
                <circle cx="18" cy="18" r="4.5" fill="#ef4444" />
            </svg>

            {label && (
                <div
                    style={{
                        marginTop: 4,
                        background: 'rgba(15,23,42,0.85)',
                        backdropFilter: 'blur(6px)',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 6,
                        whiteSpace: 'nowrap',
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                >
                    {label}
                </div>
            )}
        </div>
    </Marker>
);
