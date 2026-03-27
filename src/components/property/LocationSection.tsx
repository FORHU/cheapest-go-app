'use client';

import React, { useRef, useCallback, useState } from 'react';
import { MapPin, Building, Navigation, X } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';

interface LocationSectionProps {
    hotelDetails?: {
        name?: string;
        description?: string;
        address?: string;
        city?: string;
        country?: string;
        image?: string;
    };
    coordinates?: { lat: number; lng: number };
}

const LocationSection: React.FC<LocationSectionProps> = ({ hotelDetails, coordinates }) => {
    const mapRef = useRef<MapRef>(null);
    const [showCard, setShowCard] = useState(true);
    
    const name = hotelDetails?.name || "Premium Stay";
    const description = hotelDetails?.description || "Public 18-hole golf course with mountain views, a restaurant, and a driving range";
    const address = hotelDetails?.address || "Address not available";
    const city = hotelDetails?.city || "";
    const country = hotelDetails?.country || "";
    const fullLocation = [city, country].filter(Boolean).join(', ');
    const hotelImage = hotelDetails?.image || "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80";

    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    const googleMapsLink = hasCoordinates
        ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

    const handleRecenter = useCallback(() => {
        if (!hasCoordinates) return;
        mapRef.current?.flyTo({
            center: [coordinates.lng, coordinates.lat],
            zoom: 16,
            pitch: 45,
            duration: 800,
        });
    }, [hasCoordinates, coordinates]);

    return (
        <div className="py-4 lg:py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-36" id="location">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-4 lg:mb-6">Where you'll be</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{fullLocation}</p>
            
            <div className="flex flex-col gap-8">
                {/* Map Container */}
                <div className="w-full h-[400px] lg:h-[500px] rounded-2xl relative overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
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
                                    zoom: 16,
                                    pitch: 45,
                                    bearing: 0,
                                }}
                                maxPitch={60}
                                className="rounded-2xl min-h-0"
                            >
                                <NavigationControl position="top-right" showCompass={false} />
                                <GeolocateControl position="top-right" trackUserLocation showUserHeading />

                                {/* Hotel Pin */}
                                <Marker
                                    latitude={coordinates.lat}
                                    longitude={coordinates.lng}
                                    anchor="bottom"
                                >
                                    <div className="flex flex-col items-center">
                                        <div className="bg-pink-600 text-white p-2.5 rounded-2xl shadow-xl border-2 border-white transform transition-transform hover:scale-110">
                                            <div className="bg-white/20 p-1.5 rounded-lg">
                                                <div className="w-4 h-4 bg-white rounded-sm flex items-center justify-center">
                                                    <div className="w-2 h-2 bg-pink-600 rounded-full" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-4 h-1.5 bg-black/20 rounded-full mt-1 blur-[2px]" />
                                    </div>
                                </Marker>
                            </Map>

                            {/* Property Card Overlay */}
                            {showCard && (
                                <div className="absolute top-6 left-6 z-10 w-[320px] bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200/50 dark:border-slate-700/50 animate-in fade-in slide-in-from-left-4 duration-500">
                                    <div className="relative h-[180px]">
                                        <img 
                                            src={hotelImage} 
                                            alt={name}
                                            className="w-full h-full object-cover"
                                        />
                                        <button 
                                            onClick={() => setShowCard(false)}
                                            className="absolute top-3 right-3 p-1.5 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-colors"
                                        >
                                            <X size={16} />
                                        </button>
                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {[1, 2, 3, 4, 5].map((i) => (
                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 1 ? 'bg-white' : 'bg-white/50'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-2">
                                        <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-snug">{name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                            {description}
                                        </p>
                                        <p className="text-[12px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 pt-1">
                                            <MapPin size={12} />
                                            {address}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Re-center button */}
                            <button
                                onClick={handleRecenter}
                                className="absolute bottom-5 right-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-700 dark:text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2 group"
                            >
                                <Navigation size={14} className="group-hover:rotate-12 transition-transform" />
                                Re-center
                            </button>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900">
                            <div className="text-center space-y-3">
                                <div className="p-4 bg-slate-200 dark:bg-slate-800 rounded-full inline-block">
                                    <MapPin size={32} className="text-slate-400" />
                                </div>
                                <p className="text-slate-500 font-medium">Map currently unavailable</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Info Text below map for mobile accessibility */}
                <div className="lg:hidden space-y-6 px-2">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="font-bold text-slate-900 dark:text-white">Hotel Location</h3>
                        </div>
                        <div className="pl-11">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                {address}
                            </p>
                            <a
                                href={googleMapsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 mt-4 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline group"
                            >
                                <Navigation size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                View in Google Maps
                            </a>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                <Building size={18} className="text-purple-600 dark:text-purple-400" />
                            </div>
                            <h3 className="font-bold text-slate-900 dark:text-white">Getting Around</h3>
                        </div>
                        <p className="pl-11 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            Baguio is best explored by taxi or local jeepneys. Contact our concierge for personalized travel arrangements.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocationSection;
