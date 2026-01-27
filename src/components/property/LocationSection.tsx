"use client";

import React from 'react';
import { MapPin, Building } from 'lucide-react';

interface LocationSectionProps {
    hotelDetails?: {
        address?: string;
        city?: string;
        country?: string;
        coordinates?: { lat: number; lng: number };
    };
}

const LocationSection: React.FC<LocationSectionProps> = ({ hotelDetails }) => {
    const address = hotelDetails?.address || "Address not available";
    const city = hotelDetails?.city || "";
    const country = hotelDetails?.country || "";
    const fullLocation = [city, country].filter(Boolean).join(', ');

    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10" id="location">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Explore the area</h2>
            <div className="flex flex-col md:flex-row gap-8">
                {/* Map Preview */}
                <div className="flex-1 h-[240px] bg-slate-100 dark:bg-slate-800 rounded-xl relative overflow-hidden group cursor-pointer">
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
                        <span className="text-slate-400">Map View Mockup</span>
                    </div>
                    <img
                        src="https://via.placeholder.com/600x400?text=Map+View"
                        alt="Map view"
                        className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-60 transition-opacity"
                    />
                    <button className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 hover:scale-105 transition-transform">
                        View in a map
                    </button>
                </div>

                {/* Location Info */}
                <div className="flex-1 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <MapPin size={18} className="text-slate-900 dark:text-white" />
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Hotel Location</h3>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {address}
                            </p>
                            {fullLocation && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {fullLocation}
                                </p>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Building size={18} className="text-slate-900 dark:text-white" />
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Getting Around</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Contact the property for transportation options and directions from nearby landmarks.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocationSection;

