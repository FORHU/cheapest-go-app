'use client';

import React from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { formatCurrency, cn } from '@/lib/utils';
import type { MappableProperty } from './types';

interface MapMarkerProps {
    property: MappableProperty;
    isSelected: boolean;
    isHovered: boolean;
    onClick: (id: string) => void;
    onHover: (id: string | null) => void;
}

const MapMarker = React.memo(function MapMarker({
    property,
    isSelected,
    isHovered,
    onClick,
    onHover,
}: MapMarkerProps) {
    const isActive = isSelected || isHovered;

    // If selected, we show the full Popup instead of the marker to avoid overlap/duplication
    // if (isSelected) return null;

    return (
        <Marker
            latitude={property.coordinates.lat}
            longitude={property.coordinates.lng}
            anchor="bottom"
            onClick={(e) => {
                e.originalEvent.stopPropagation();
                onClick(property.id);
            }}
            style={{
                zIndex: isSelected ? 20 : isHovered ? 10 : 1,
                cursor: 'pointer',
            }}
        >
            <div
                onMouseEnter={() => onHover(property.id)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                    'transition-all duration-300 ease-out',
                    isSelected ? 'scale-110 -translate-y-2' : 'scale-100 hover:scale-105'
                )}
            >
                <div className="relative flex flex-col items-center">
                    {!isActive && (
                        /* Standard Price bubble (Unselected) */
                        <div
                            className={cn(
                                'relative text-[12px] font-bold px-[7px] py-[1px] rounded-full whitespace-nowrap',
                                'bg-white text-blue-600 border border-blue-500 shadow-sm transition-all duration-300',
                                'dark:bg-slate-900 dark:text-blue-400 dark:border-blue-500 hover:scale-105'
                            )}
                        >
                            {formatCurrency(property.price)}
                        </div>
                    )}

                    {isActive && (
                        /* Selected/Hovered State: Teardrop Pin + Name Label */
                        <div className="flex flex-col items-center animate-in zoom-in duration-200">
                            {/* Premium Teardrop Pin */}
                            <div className={cn(
                                "p-1.5 rounded-xl shadow-xl border-2 transform transition-all duration-300 z-20",
                                isSelected ? "bg-slate-600 border-white scale-110" : "bg-slate-700 border-white scale-105"
                            )}>
                                <div className="bg-white/20 p-1 rounded-lg">
                                    <div className="w-3 h-3 bg-white rounded-sm flex items-center justify-center">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            isSelected ? "bg-slate-600" : "bg-slate-700"
                                        )} />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Shadow under the pin */}
                            <div className="relative h-1 w-4 flex justify-center mb-1">
                                 <div className="w-4 h-1.5 bg-black/30 rounded-full mt-1 blur-[1px]" />
                            </div>

                            {/* Hotel Name Label (Below Pin) */}
                            <div className="mt-1.5 bg-white rounded-md shadow-md border border-slate-200 px-2 py-1 z-30 whitespace-nowrap">
                                <span className="text-[11.5px] font-bold text-slate-800 tracking-tight">
                                    {property.name}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Marker>
    );
});

export { MapMarker };
export type { MapMarkerProps };
