'use client';

import React from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { X, Navigation, ExternalLink } from 'lucide-react';

interface MapPOIPopupProps {
    name: string;
    category: string;
    lat: number;
    lng: number;
    /** Distance in km from the selected hotel. Null when no hotel is selected. */
    distanceKm: number | null;
    onClose: () => void;
}

function formatCategory(raw: string): string {
    return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDistance(km: number): string {
    return km < 1
        ? `${Math.round(km * 1000)} m from property`
        : `${km.toFixed(2)} km from property`;
}

const MapPOIPopup = React.memo(function MapPOIPopup({
    name,
    category,
    lat,
    lng,
    distanceKm,
    onClose,
}: MapPOIPopupProps) {
    const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

    return (
        <Popup
            latitude={lat}
            longitude={lng}
            anchor="bottom"
            offset={20}
            closeOnClick={false}
            onClose={onClose}
            className="map-poi-popup"
            maxWidth="240px"
        >
            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-xl border border-slate-100 dark:border-slate-800 min-w-[200px]">
                <div className="p-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight truncate">
                                {name}
                            </h3>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatCategory(category)}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0 cursor-pointer mt-0.5"
                        >
                            <X className="w-3 h-3 text-slate-500" />
                        </button>
                    </div>

                    {/* Distance from selected hotel */}
                    {distanceKm !== null && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                            <Navigation className="w-3 h-3 flex-shrink-0" />
                            <span>{formatDistance(distanceKm)}</span>
                        </div>
                    )}

                    {/* Google Maps link */}
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        View on Google Maps
                    </a>
                </div>
            </div>
        </Popup>
    );
});

export { MapPOIPopup };
export type { MapPOIPopupProps };
