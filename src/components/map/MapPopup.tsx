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
            offset={typeof window !== 'undefined' && window.innerHeight < 500 && window.innerWidth > window.innerHeight ? 20 : 40}
            closeOnClick={false}
            onClose={onClose}
            className="map-property-popup z-50"
            maxWidth="min(300px, calc(100vw - 40px))"
        >
            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl min-w-[240px] border border-slate-100 dark:border-slate-800 landscape-compact-popup">
                {/* Image */}
                <div className="relative">
                    <img
                        src={property.image}
                        alt={property.name}
                        className="w-full h-36 object-cover landscape-compact-popup-img"
                        loading="lazy"
                    />
                    <button
                        onClick={onClose}
                        className="absolute top-2 right-2 w-8 h-8 md:w-8 md:h-8 max-h-[500px]:landscape:w-6 max-h-[500px]:landscape:h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
                    >
                        <X className="w-3.5 h-3.5 max-h-[500px]:landscape:w-3 max-h-[500px]:landscape:h-3 text-white" />
                    </button>

                    {/* Badges */}
                    <div className="absolute bottom-2 left-2 flex gap-1 max-h-[500px]:landscape:bottom-1 max-h-[500px]:landscape:left-1">
                        {property.refundableTag === 'RFN' && (
                            <span className="text-[10px] max-h-[500px]:landscape:text-[8px] font-semibold bg-emerald-500 text-white px-2 py-0.5 max-h-[500px]:landscape:px-1.5 max-h-[500px]:landscape:py-0 rounded-full">
                                {typeof window !== 'undefined' && window.innerHeight < 500 ? 'Free cancel' : 'Free cancellation'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-3 max-h-[500px]:landscape:p-1.5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight max-h-[500px]:landscape:text-[11px]">
                        {property.name}
                    </h3>

                    <div className="flex items-center gap-1 mt-1 max-h-[500px]:landscape:mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0 max-h-[500px]:landscape:w-2 max-h-[500px]:landscape:h-2" />
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-h-[500px]:landscape:text-[9px]">
                            {property.location}
                        </span>
                    </div>

                    {/* Rating row */}
                    <div className="flex items-center gap-2 mt-2 max-h-[500px]:landscape:mt-1">
                        <span className="text-xs font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded max-h-[500px]:landscape:text-[9px] max-h-[500px]:landscape:px-1 max-h-[500px]:landscape:py-px">
                            {property.rating.toFixed(1)}
                        </span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 max-h-[500px]:landscape:text-[9px]">
                            {getRatingLabel(property.rating)}
                        </span>
                    </div>

                    {/* Price + CTA */}
                    <div className="flex items-end justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 max-h-[500px]:landscape:mt-1.5 max-h-[500px]:landscape:pt-1.5 ">
                        <div>
                            {property.originalPrice &&
                                property.originalPrice > property.price && (
                                    <span className="text-[10px] text-slate-400 line-through block leading-none mb-0.5 max-h-[500px]:landscape:text-[8px] max-h-[500px]:landscape:mb-0">
                                        {formatCurrency(property.originalPrice)}
                                    </span>
                                )}
                            <span className="text-base font-bold text-blue-600 dark:text-blue-400 max-h-[500px]:landscape:text-sm">
                                {formatCurrency(property.price)}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-0.5 max-h-[500px]:landscape:text-[8px]">
                                /night
                            </span>
                        </div>
                        <button
                            onClick={() => onViewDetails(property.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap max-h-[500px]:landscape:px-2.5 max-h-[500px]:landscape:py-1 max-h-[500px]:landscape:text-[9px]"
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
