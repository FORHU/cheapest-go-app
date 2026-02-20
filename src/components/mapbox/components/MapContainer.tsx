import React from 'react';
import { Map } from '@/components/ui/map';
import { NavigationControl, MapRef } from 'react-map-gl/mapbox';

interface MapContainerProps {
    mapRef: React.RefObject<MapRef | null>;
    initialViewState: {
        longitude: number;
        latitude: number;
        zoom: number;
    };
    onLoad: () => void;
    onClick: (e: any) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    interactiveLayerIds?: string[];
    children?: React.ReactNode;
}

export const MapContainer = ({
    mapRef,
    initialViewState,
    onLoad,
    onClick,
    onMouseEnter,
    onMouseLeave,
    interactiveLayerIds,
    children,
}: MapContainerProps) => {
    return (
        <Map
            ref={mapRef}
            mapStyle="standard"
            standardConfig={{
                lightPreset: 'day',
                show3dObjects: true,
                show3dBuildings: true,
            }}
            initialViewState={{
                ...initialViewState,
                pitch: 45,
                bearing: -10,
            }}
            maxPitch={60}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onLoad={onLoad}
            className={`rounded-none min-h-0 w-full h-full ${children ? '' : ''}`}
            interactiveLayerIds={interactiveLayerIds}
        >
            <NavigationControl position="top-right" showCompass visualizePitch />
            {children}
        </Map>
    );
};
