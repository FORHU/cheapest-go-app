"use client";

import React from 'react';
import { MapPin, Building, ExternalLink } from 'lucide-react';

interface LocationSectionProps {
    hotelDetails?: {
        address?: string;
        city?: string;
        country?: string;
    };
    coordinates?: { lat: number; lng: number };
}

const LocationSection: React.FC<LocationSectionProps> = ({ hotelDetails, coordinates }) => {
    const address = hotelDetails?.address || "Address not available";
    const city = hotelDetails?.city || "";
    const country = hotelDetails?.country || "";
    const fullLocation = [city, country].filter(Boolean).join(', ');

    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    // Generate Google Maps static image URL
    const mapImageUrl = hasCoordinates
        ? `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${coordinates.lat},${coordinates.lng}&key=AIzaSyBxxxxxxxx`
        : null;

    // Generate Google Maps link for "View in a map" button
    const googleMapsLink = hasCoordinates
        ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-36" id="location">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Explore the area</h2>
            <div className="flex flex-col md:flex-row gap-8">
                {/* Map Preview */}
                <div className="flex-1 h-[240px] bg-slate-100 dark:bg-slate-800 rounded-xl relative overflow-hidden group cursor-pointer">
                    {hasCoordinates ? (
                        <iframe
                            src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBxxxxxxxx&q=${coordinates.lat},${coordinates.lng}&zoom=15`}
                            className="absolute inset-0 w-full h-full border-0"
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title="Hotel Location Map"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
                            <span className="text-slate-400">Map not available</span>
                        </div>
                    )}
                    <a
                        href={googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 hover:scale-105 transition-transform flex items-center gap-2"
                    >
                        <ExternalLink size={14} />
                        View in Google Maps
                    </a>
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
                            {hasCoordinates && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                    {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
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
