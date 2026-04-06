import React from 'react';
import { Map } from '@/components/ui/map';
import { NavigationControl, MapRef } from 'react-map-gl/mapbox';

interface MapContainerProps {
    mapRef: React.RefObject<MapRef | null>;
    initialViewState: {
        longitude: number;
        latitude: number;
        zoom: number;
        pitch?: number;
        bearing?: number;
    };
    onLoad: (e: any) => void;
    onClick: (e: any) => void;
    onMouseMove: (e: any) => void;
    children?: React.ReactNode;
}

export const MapContainer = ({
    mapRef,
    initialViewState,
    onLoad,
    onClick,
    onMouseMove,
    children,
}: MapContainerProps) => {
    return (
        <Map
            ref={mapRef}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            initialViewState={{
                pitch: 45,
                bearing: -10,
                ...initialViewState,
            }}
            maxPitch={60}
            onClick={onClick}
            onMouseMove={onMouseMove}
            onLoad={onLoad}
            className={`rounded-none min-h-0 w-full h-full ${children ? '' : ''}`}
        >
            <NavigationControl position="top-right" showCompass visualizePitch />
            {children}
        </Map>
    );
};
