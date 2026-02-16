'use client';

import React from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { Star, MapPin, X } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { MappableProperty } from './types';

interface MapPopupProps {
    property: MappableProperty;
    onClose: () => void;
    onViewDetails: (id: string) => void;
}

function getRatingLabel(rating: number): string {
    if (rating >= 9) return 'Exceptional';
    if (rating >= 8) return 'Excellent';
    if (rating >= 7) return 'Very Good';
    if (rating >= 6) return 'Good';
    return 'Pleasant';
}

const MapPopup = React.memo(function MapPopup({
    property,
    onClose,
    onViewDetails,
}: MapPopupProps) {
    return (
        <Popup
            latitude={property.coordinates.lat}
            longitude={property.coordinates.lng}
            anchor="bottom"
            offset={40}
            closeOnClick={false}
            onClose={onClose}
            className="map-property-popup z-50"
            maxWidth="300px"
        >
            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl min-w-[260px] border border-slate-100 dark:border-slate-800">
                {/* Image */}
                <div className="relative">
                    <img
                        src={property.image}
                        alt={property.name}
                        className="w-full h-36 object-cover"
                        loading="lazy"
                    />
                    <button
                        onClick={onClose}
                        className="absolute top-2 right-2 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
                    >
                        <X className="w-3.5 h-3.5 text-white" />
                    </button>

                    {/* Badges */}
                    <div className="absolute bottom-2 left-2 flex gap-1">
                        {property.refundableTag === 'RFN' && (
                            <span className="text-[10px] font-semibold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                                Free cancellation
                            </span>
                        )}
                        {property.badges.slice(0, 1).map((badge) => (
                            <span
                                key={badge}
                                className="text-[10px] font-semibold bg-blue-500 text-white px-2 py-0.5 rounded-full"
                            >
                                {badge}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-3">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                        {property.name}
                    </h3>

                    <div className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {property.location}
                        </span>
                    </div>

                    {/* Rating row */}
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded">
                            {property.rating.toFixed(1)}
                        </span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {getRatingLabel(property.rating)}
                        </span>
                        {property.reviews > 0 && (
                            <span className="text-[10px] text-slate-400">
                                ({property.reviews.toLocaleString()})
                            </span>
                        )}
                    </div>

                    {/* Amenities preview */}
                    {property.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {property.amenities.slice(0, 3).map((amenity) => (
                                <span
                                    key={amenity}
                                    className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded"
                                >
                                    {amenity}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Price + CTA */}
                    <div className="flex items-end justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                        <div>
                            {property.originalPrice &&
                                property.originalPrice > property.price && (
                                    <span className="text-[10px] text-slate-400 line-through block leading-none mb-0.5">
                                        {formatCurrency(property.originalPrice)}
                                    </span>
                                )}
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {formatCurrency(property.price)}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-0.5">
                                /night
                            </span>
                        </div>
                        <button
                            onClick={() => onViewDetails(property.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                        >
                            View Deal
                        </button>
                    </div>
                </div>
            </div>
        </Popup>
    );
});

export { MapPopup };
export type { MapPopupProps };
