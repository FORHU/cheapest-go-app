'use client';

import React, { useEffect, useState } from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { MapPin, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import type { MappableProperty } from './types';

interface MapPopupProps {
    property: MappableProperty;
    onClose: () => void;
    onViewDetails: (id: string) => void;
    mapRef?: React.RefObject<any>;
}

function getRatingLabel(rating: number): string {
    if (rating >= 9) return 'Exceptional';
    if (rating >= 8) return 'Excellent';
    if (rating >= 7) return 'Very Good';
    if (rating >= 6) return 'Good';
    return 'Pleasant';
}

function useIsLandscapeMobile() {
    const [is, setIs] = useState(false);
    useEffect(() => {
        const check = () =>
            setIs(window.innerHeight < 500 && window.innerWidth > window.innerHeight);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return is;
}

const MapPopup = React.memo(function MapPopup({
    property,
    onClose,
    onViewDetails,
    mapRef
}: MapPopupProps) {
    const isLandscape = useIsLandscapeMobile();
    const targetCurrency = useUserCurrency();
    const sourceCurrency = property.currency || 'USD';
    const displayPrice = convertCurrency(property.price, sourceCurrency, targetCurrency);
    const displayOriginalPrice = property.originalPrice
        ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency)
        : undefined;

    useEffect(() => {
        let startY = 0;
        let startX = 0;

        const handleTouchStart = (e: TouchEvent) => {
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!startY || !startX) return;
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = Math.abs(currentY - startY);
            const diffX = Math.abs(currentX - startX);

            // If user swipes more than 10px in any direction, close the popup
            if (diffY > 10 || diffX > 10) {
                onClose();
            }
        };

        // Global listeners catch swipes anywhere on the screen (even over the popup or other UI)
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });

        // Map-specific listeners for desktop dragging or scrolling
        const map = mapRef?.current?.getMap();
        if (map) {
            map.on('dragstart', onClose);
            map.on('zoomstart', onClose);
            map.on('wheel', onClose);
        }

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            if (map) {
                map.off('dragstart', onClose);
                map.off('zoomstart', onClose);
                map.off('wheel', onClose);
            }
        };
    }, [mapRef, onClose])
    return (
        <Popup
            latitude={property.coordinates.lat}
            longitude={property.coordinates.lng}
            anchor="bottom"
            offset={isLandscape ? 25 : 60}
            closeOnClick={false}
            onClose={onClose}
            className="map-property-popup z-50"
            maxWidth="min(240px, calc(100vw - 16px))"
        >
            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl w-full border border-slate-100 dark:border-slate-800">

                {/* Image */}
                <div className="relative">
                    <img
                        src={property.image}
                        alt={property.name}
                        className={`w-full object-cover ${isLandscape ? 'h-16' : 'h-28'}`}
                        loading="lazy"
                    />
                    <button
                        onClick={onClose}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
                    >
                        <X className="w-3 h-3 text-white" />
                    </button>

                    {/* Badges */}
                    {property.refundableTag === 'RFN' && (
                        <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                            {isLandscape ? 'Free cancel' : 'Free cancellation'}
                        </span>
                    )}
                </div>

                {/* Content */}
                <div className={isLandscape ? 'p-1.5' : 'p-2.5'}>
                    <h3 className={`font-bold text-slate-900 dark:text-white leading-tight truncate ${isLandscape ? 'text-[10px]' : 'text-xs'}`}>
                        {property.name}
                    </h3>

                    <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {property.location}
                        </span>
                    </div>

                    {/* Rating */}
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded">
                            {property.rating.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                            {getRatingLabel(property.rating)}
                        </span>
                    </div>

                    {/* Price + CTA */}
                    <div className={`flex items-center justify-between border-t border-slate-100 dark:border-slate-800 ${isLandscape ? 'mt-1 pt-1' : 'mt-2 pt-2'}`}>
                        <div className="leading-none">
                            {displayOriginalPrice && displayOriginalPrice > displayPrice && (
                                <span className="text-[9px] text-slate-400 line-through block mb-0.5">
                                    {formatCurrency(displayOriginalPrice, targetCurrency)}
                                </span>
                            )}
                            <span className={`font-bold text-blue-600 dark:text-blue-400 ${isLandscape ? 'text-xs' : 'text-sm'}`}>
                                {formatCurrency(displayPrice, targetCurrency)}
                            </span>
                            <span className="text-[9px] text-slate-400 ml-0.5">/night</span>
                        </div>
                        <button
                            onClick={() => onViewDetails(property.id)}
                            className={`bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${isLandscape ? 'text-[9px] px-2 py-1' : 'text-[10px] px-2.5 py-1.5'}`}
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