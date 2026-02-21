'use client';

import React, { useRef, useCallback } from 'react';
import { MapPin, Building, Navigation } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { Marker, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';

interface LocationSectionProps {
    hotelDetails?: {
        address?: string;
        city?: string;
        country?: string;
    };
    coordinates?: { lat: number; lng: number };
}

const LocationSection: React.FC<LocationSectionProps> = ({ hotelDetails, coordinates }) => {
    const mapRef = useRef<MapRef>(null);
    const address = hotelDetails?.address || "Address not available";
    const city = hotelDetails?.city || "";
    const country = hotelDetails?.country || "";
    const fullLocation = [city, country].filter(Boolean).join(', ');

    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    const googleMapsLink = hasCoordinates
        ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

    const handleRecenter = useCallback(() => {
        if (!hasCoordinates) return;
        mapRef.current?.flyTo({
            center: [coordinates.lng, coordinates.lat],
            zoom: 15,
            pitch: 0,
            duration: 800,
        });
    }, [hasCoordinates, coordinates]);

    return (
        <div className="py-4 lg:py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-36" id="location">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-4 lg:mb-6">Explore the area</h2>
            <div className="flex flex-col md:flex-row gap-8">
                {/* Map */}
                <div className="flex-1 h-[280px] rounded-xl relative overflow-hidden border border-slate-200 dark:border-slate-700">
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
                                    zoom: 15,
                                    pitch: 0,
                                    bearing: 0,
                                }}
                                maxPitch={60}
                                className="rounded-xl min-h-0"
                            >
                                <NavigationControl position="top-right" showCompass={false} />

                                {/* Hotel pin */}
                                <Marker
                                    latitude={coordinates.lat}
                                    longitude={coordinates.lng}
                                    anchor="bottom"
                                >
                                    <div className="flex flex-col items-center">
                                        {/* Pin body */}
                                        <div className="bg-blue-600 text-white p-2 rounded-full shadow-lg shadow-blue-600/30 border-2 border-white">
                                            <MapPin size={18} strokeWidth={2.5} />
                                        </div>
                                        {/* Pin shadow */}
                                        <div className="w-3 h-1 bg-black/20 rounded-full mt-0.5 blur-[1px]" />
                                    </div>
                                </Marker>
                            </Map>

                            {/* Re-center button */}
                            <button
                                onClick={handleRecenter}
                                className="absolute bottom-3 left-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                                <Navigation size={12} />
                                Re-center
                            </button>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
                            <span className="text-slate-400">Map not available</span>
                        </div>
                    )}
                </div>

                {/* Location Info */}
                <div className="flex-1 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2 lg:mb-3">
                            <MapPin size={16} className="text-slate-900 dark:text-white lg:hidden" />
                            <MapPin size={18} className="text-slate-900 dark:text-white hidden lg:block" />
                            <h3 className="text-[12px] lg:text-sm font-bold text-slate-900 dark:text-white">Hotel Location</h3>
                        </div>
                        <div className="space-y-1.5 lg:space-y-2">
                            <p className="text-[11px] lg:text-sm text-slate-600 dark:text-slate-300">
                                {address}
                            </p>
                            {fullLocation && (
                                <p className="text-[10px] lg:text-sm text-slate-500 dark:text-slate-400">
                                    {fullLocation}
                                </p>
                            )}
                            {hasCoordinates && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                    {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                                </p>
                            )}
                        </div>

                        {/* Google Maps link */}
                        <a
                            href={googleMapsLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <Navigation size={14} />
                            View in Google Maps
                        </a>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-2 lg:mb-3">
                            <Building size={16} className="text-slate-900 dark:text-white lg:hidden" />
                            <Building size={18} className="text-slate-900 dark:text-white hidden lg:block" />
                            <h3 className="text-[12px] lg:text-sm font-bold text-slate-900 dark:text-white">Getting Around</h3>
                        </div>
                        <p className="text-[11px] lg:text-sm text-slate-600 dark:text-slate-300">
                            Contact the property for transportation options and directions from nearby landmarks.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocationSection;
