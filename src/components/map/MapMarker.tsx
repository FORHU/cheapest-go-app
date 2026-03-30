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
                                'relative text-[11.5px] font-bold px-2.5 py-[3px] rounded-full whitespace-nowrap',
                                'bg-slate-900 text-white border border-white/30 shadow-[0_2px_8px_rgba(0,0,0,0.35)]',
                                'transition-all duration-200 hover:scale-110 hover:bg-slate-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]'
                            )}
                        >
                            {formatCurrency(property.price)}
                        </div>
                    )}

                    {isActive && (
                        /* Selected/Hovered State: Elevated pill with price + name */
                        <div className="flex flex-col items-center animate-in zoom-in duration-200">
                            {/* Elevated price pill */}
                            <div className={cn(
                                'text-[11.5px] font-bold px-2.5 py-[3px] rounded-full whitespace-nowrap z-20',
                                'shadow-[0_4px_16px_rgba(0,0,0,0.5)] border border-white/40 transition-all duration-200',
                                isSelected
                                    ? 'bg-blue-600 text-white scale-110'
                                    : 'bg-slate-700 text-white scale-105'
                            )}>
                                {formatCurrency(property.price)}
                            </div>

                            {/* Pointer triangle */}
                            <div className={cn(
                                'w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]',
                                isSelected ? 'border-t-blue-600' : 'border-t-slate-700'
                            )} />

                            {/* Shadow ellipse */}
                            <div className="w-3 h-1 bg-black/25 rounded-full blur-[2px] mb-1" />

                            {/* Hotel name label */}
                            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-100 dark:border-slate-700 px-2 py-1 z-30 whitespace-nowrap max-w-[160px]">
                                <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight line-clamp-1">
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
