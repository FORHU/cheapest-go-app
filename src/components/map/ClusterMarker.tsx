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
    const formattedPrice = formatCurrency(minPrice, currency);

    return (
        <Marker
            latitude={latitude}
            longitude={longitude}
            anchor="bottom"
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
                {/* Same pill layout as MapMarker */}
                <div
                    className={cn(
                        'flex items-center gap-2 px-1.5 py-1 rounded-full bg-white dark:bg-slate-900 shadow-md ring-1 ring-black/5 dark:ring-white/10',
                        'hover:ring-blue-500/50 hover:shadow-lg transition-all duration-200'
                    )}
                >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-500">
                        <Bed className="w-3.5 h-3.5 text-white" />
                    </div>

                    <div className="pr-2 text-[11px] font-bold text-slate-800 dark:text-white whitespace-nowrap tracking-tight">
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                            {count} {count === 1 ? 'stay' : 'stays'}
                        </span>
                        <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                        <span>{formattedPrice}+</span>
                    </div>
                </div>

                <div
                    className={cn(
                        'w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] -mt-[1px]',
                        'border-t-white dark:border-t-slate-900'
                    )}
                />
            </div>
        </Marker>
    );
});
