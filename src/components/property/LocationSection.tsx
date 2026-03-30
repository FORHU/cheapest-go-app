'use client';

import React from 'react';
import { MapPin, ArrowRight } from 'lucide-react';

interface LocationSectionProps {
    hotelDetails?: {
        name?: string;
        address?: string;
        city?: string;
        country?: string;
        image?: string;
    };
    coordinates?: { lat: number; lng: number };
}

const LocationSection: React.FC<LocationSectionProps> = ({ hotelDetails }) => {
    const address = hotelDetails?.address || 'Address not available';
    const city = hotelDetails?.city || '';
    const country = hotelDetails?.country || '';
    const fullLocation = [city, country].filter(Boolean).join(', ');

    const handleScrollToMap = () => {
        const mapSection = document.getElementById('location');
        if (mapSection) {
            mapSection.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="py-4 lg:py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-36" id="location-text">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-4 lg:mb-6">Where you'll be</h2>
            {fullLocation && <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{fullLocation}</p>}

            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg shrink-0">
                        <MapPin size={16} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Location</h3>
                </div>
                <div className="pl-11 space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{address}</p>
                    <button
                        onClick={handleScrollToMap}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        <ArrowRight size={13} />
                        Explore nearby places on the map
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LocationSection;
