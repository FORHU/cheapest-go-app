'use client';

import React, { useRef, useCallback } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { Marker, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';

interface PropertyMapSidebarProps {
    hotelDetails?: {
        address?: string;
        city?: string;
        country?: string;
    };
    coordinates?: { lat: number; lng: number };
    propertyName?: string;
}

const PropertyMapSidebar: React.FC<PropertyMapSidebarProps> = ({
    hotelDetails,
    coordinates,
    propertyName,
}) => {
    const mapRef = useRef<MapRef>(null);

    const address = hotelDetails?.address || 'Address not available';
    const city = hotelDetails?.city || '';
    const country = hotelDetails?.country || '';
    const fullLocation = [city, country].filter(Boolean).join(', ');

    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    const handleRecenter = useCallback(() => {
        if (!hasCoordinates) return;
        mapRef.current?.flyTo({
            center: [coordinates.lng, coordinates.lat],
            zoom: 17.5,
            pitch: 45,
            bearing: -10,
            duration: 800,
        });
    }, [hasCoordinates, coordinates]);

    return (
        <div className="h-full flex flex-col rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
            {/* Map — takes all available space */}
            <div className="flex-1 relative min-h-[400px]">
                {hasCoordinates ? (
                    <>
                        <Map
                            ref={mapRef}
                            mapStyle="standard"
                            standardConfig={{
                                lightPreset: 'day',
                                show3dObjects: true,
                                show3dBuildings: true,
                            }}
                            initialViewState={{
                                longitude: coordinates.lng,
                                latitude: coordinates.lat,
                                zoom: 17.5,
                                pitch: 45,
                                bearing: -10,
                            }}
                            maxPitch={60}
                            className="!min-h-0 !rounded-none h-full"
                        >
                            <NavigationControl position="top-right" showCompass visualizePitch />

                            {/* Pin marker */}
                            <Marker
                                latitude={coordinates.lat}
                                longitude={coordinates.lng}
                                anchor="bottom"
                            >
                                <div className="flex flex-col items-center">
                                    <div className="bg-blue-600 text-white p-2.5 rounded-full shadow-lg shadow-blue-600/30 border-2 border-white">
                                        <MapPin size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className="w-3 h-1 bg-black/20 rounded-full mt-0.5 blur-[1px]" />
                                </div>
                            </Marker>
                        </Map>

                        <button
                            onClick={handleRecenter}
                            className="absolute bottom-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-full shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                            <Navigation size={12} />
                            Re-center
                        </button>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-800">
                        <div className="text-center">
                            <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                            <span className="text-sm text-slate-400">Map not available</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PropertyMapSidebar;
