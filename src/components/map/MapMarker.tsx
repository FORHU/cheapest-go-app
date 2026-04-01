import React from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { Bed } from 'lucide-react';
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
                    'transition-all duration-300 ease-out flex flex-col items-center group',
                    isSelected ? 'scale-110 -translate-y-1' : 'scale-100'
                )}
            >
                {/* Marker Container (Pill) */}
                <div className={cn(
                    'flex items-center gap-2 px-1.5 py-1 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition-all duration-200',
                    isActive ? 'ring-blue-500/50 shadow-[0_4px_15px_rgba(0,0,0,0.2)]' : 'group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]'
                )}>
                    {/* Icon Circle */}
                    <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                        isSelected ? 'bg-blue-700' : 'bg-blue-500'
                    )}>
                        <Bed className="w-3.5 h-3.5 text-white" />
                    </div>

                    {/* Price Label */}
                    <div className="pr-2 text-[11px] font-bold text-slate-800 whitespace-nowrap tracking-tight">
                        {formatCurrency(property.price, property.currency)}
                    </div>
                </div>

                {/* Triangle Tail */}
                <div className={cn(
                    'w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] -mt-[1px]',
                    isSelected ? 'border-t-blue-700' : 'border-t-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]'
                )} />

                {/* Hover/Selected Name Label (Optional, showing only when active/hovered) */}
                {isActive && (
                    <div className="absolute -top-8 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-100 dark:border-slate-700 px-2 py-1 z-30 whitespace-nowrap max-w-[160px] animate-in fade-in slide-in-from-bottom-1 duration-200">
                        <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight line-clamp-1">
                            {property.name}
                        </span>
                    </div>
                )}
            </div>
        </Marker>
    );
});

export { MapMarker };
export type { MapMarkerProps };
