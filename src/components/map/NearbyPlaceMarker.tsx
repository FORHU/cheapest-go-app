'use client';

import React from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { Utensils, Trees, Landmark, ShoppingBasket, Pill, Bus, type LucideIcon } from 'lucide-react';
import type { NearbyPlace } from './useMapNearbyPlaces';

function getCategoryConfig(category: string): { Icon: LucideIcon; color: string } {
    const cat = category.toLowerCase();
    if (
        cat.includes('restaurant') || cat.includes('cafe') || cat.includes('food') ||
        cat.includes('bar') || cat.includes('bakery')
    ) return { Icon: Utensils, color: 'bg-orange-500' };
    if (cat.includes('park') || cat.includes('garden') || cat.includes('nature'))
        return { Icon: Trees, color: 'bg-green-600' };
    if (
        cat.includes('museum') || cat.includes('tourist') || cat.includes('attraction') ||
        cat.includes('art') || cat.includes('zoo') || cat.includes('amusement') || cat.includes('aquarium')
    ) return { Icon: Landmark, color: 'bg-purple-600' };
    if (
        cat.includes('supermarket') || cat.includes('grocery') || cat.includes('convenience') ||
        cat.includes('shop') || cat.includes('mall') || cat.includes('store')
    ) return { Icon: ShoppingBasket, color: 'bg-pink-600' };
    if (
        cat.includes('hospital') || cat.includes('pharmacy') || cat.includes('medical') ||
        cat.includes('doctor') || cat.includes('dentist')
    ) return { Icon: Pill, color: 'bg-red-500' };
    if (
        cat.includes('bus') || cat.includes('train') || cat.includes('station') ||
        cat.includes('transit') || cat.includes('subway') || cat.includes('airport')
    ) return { Icon: Bus, color: 'bg-sky-600' };
    return { Icon: Landmark, color: 'bg-blue-500' };
}

interface NearbyPlaceMarkerProps {
    place: NearbyPlace;
    isSelected: boolean;
    onClick: (place: NearbyPlace) => void;
    /**
     * 'dot' — compact blue pin (default; used by the search-results map).
     * 'poi' — category-coloured circular icon with a name label, the primary way
     *         recommended places are surfaced on the booking destination map.
     */
    variant?: 'dot' | 'poi';
}

const NearbyPlaceMarker = React.memo(function NearbyPlaceMarker({
    place,
    isSelected,
    onClick,
    variant = 'dot',
}: NearbyPlaceMarkerProps) {
    const { Icon, color } = getCategoryConfig(place.category);

    return (
        <Marker
            latitude={place.lat}
            longitude={place.lng}
            anchor="center"
            onClick={(e) => {
                e.originalEvent.stopPropagation();
                onClick(place);
            }}
            style={{ zIndex: isSelected ? 25 : 5, cursor: 'pointer' }}
        >
            {variant === 'poi' ? (
                <div className="group flex flex-col items-center gap-1 select-none">
                    <div
                        className={`flex items-center justify-center rounded-full ${color} border-2 border-white shadow-lg transition-transform ${
                            isSelected
                                ? 'w-9 h-9 scale-105 ring-2 ring-blue-400 ring-offset-1 ring-offset-white'
                                : 'w-7 h-7 hover:scale-110'
                        }`}
                    >
                        <Icon className={`text-white ${isSelected ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
                    </div>
                    {/* Name label — always visible for the selected place, on hover otherwise */}
                    <span
                        className={`max-w-[120px] truncate rounded-full border border-slate-200/70 dark:border-slate-700/70 bg-white/95 dark:bg-slate-900/95 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-white shadow-sm transition-opacity ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                    >
                        {place.name}
                    </span>
                </div>
            ) : (
                <div
                    className={`flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 shadow-md border-2 border-white transition-transform ${
                        isSelected ? 'scale-125' : 'hover:scale-110'
                    }`}
                >
                    <Icon className="w-2.5 h-2.5 text-white" />
                </div>
            )}
        </Marker>
    );
});

export { NearbyPlaceMarker };
