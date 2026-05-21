import React from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { Bed } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

interface ClusterMarkerProps {
    latitude: number;
    longitude: number;
    count: number;
    minPrice: number;
    currency: string;
    onClick: () => void;
}

export const ClusterMarker = React.memo(function ClusterMarker({
    latitude,
    longitude,
    count,
    minPrice,
    currency,
    onClick,
}: ClusterMarkerProps) {
    // Format price elegantly (e.g. $1,200+)
    const formattedPrice = formatCurrency(minPrice, currency);

    return (
        <Marker
            latitude={latitude}
            longitude={longitude}
            anchor="center"
            onClick={(e) => {
                e.originalEvent.stopPropagation();
                onClick();
            }}
            style={{
                zIndex: 5,
                cursor: 'pointer',
            }}
        >
            <div className="flex flex-col items-center group active:scale-95 transition-transform duration-150">
                {/* Cluster Badge */}
                <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-blue-600 dark:bg-blue-500 text-white shadow-lg border-2 border-white dark:border-slate-900",
                    "hover:bg-blue-700 dark:hover:bg-blue-600 hover:scale-105 transition-all duration-200"
                )}>
                    {/* Stay Count Pin */}
                    <span className="text-[10px] font-bold bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        {count} stays
                    </span>
                    
                    {/* Minimum Price */}
                    <span className="text-xs font-black tracking-tight whitespace-nowrap">
                        {formattedPrice}+
                    </span>
                </div>
            </div>
        </Marker>
    );
});
