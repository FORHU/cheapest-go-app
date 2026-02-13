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
                    'transition-transform duration-200 ease-out',
                    isActive ? 'scale-110' : 'scale-100 hover:scale-105'
                )}
            >
                <div className="relative flex flex-col items-center">
                    {/* Price bubble */}
                    <div
                        className={cn(
                            'relative text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap',
                            'shadow-lg border transition-all duration-200',
                            isSelected
                                ? 'bg-blue-600 text-white border-blue-700 shadow-blue-500/40'
                                : isHovered
                                  ? 'bg-slate-900 text-white border-slate-700 shadow-slate-900/40'
                                  : 'bg-white text-slate-900 border-slate-200 shadow-slate-300/40 dark:bg-slate-900 dark:text-white dark:border-slate-600 dark:shadow-black/40'
                        )}
                    >
                        {formatCurrency(property.price)}

                        {/* Notch / arrow */}
                        <div
                            className={cn(
                                'absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45',
                                'border-r border-b',
                                isSelected
                                    ? 'bg-blue-600 border-blue-700'
                                    : isHovered
                                      ? 'bg-slate-900 border-slate-700'
                                      : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-600'
                            )}
                        />
                    </div>

                    {/* Pin dot with pulse effect */}
                    <div className="relative mt-1.5">
                        <div
                            className={cn(
                                'w-3 h-3 rounded-full border-2 border-white shadow-md transition-colors duration-200',
                                isSelected
                                    ? 'bg-blue-600'
                                    : isHovered
                                      ? 'bg-slate-900'
                                      : 'bg-red-500'
                            )}
                        />
                        {isActive && (
                            <div
                                className={cn(
                                    'absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-40',
                                    isSelected ? 'bg-blue-500' : 'bg-slate-700'
                                )}
                            />
                        )}
                    </div>
                </div>
            </div>
        </Marker>
    );
});

export { MapMarker };
export type { MapMarkerProps };
