import React from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { Car, Footprints } from 'lucide-react';

interface PoiDurationMarkerProps {
    latitude: number;
    longitude: number;
    carDuration?: string;
    walkDuration?: string;
}

export const PoiDurationMarker = React.memo(({
    latitude,
    longitude,
    carDuration = '8m',
    walkDuration = '18m',
}: PoiDurationMarkerProps) => {
    return (
        <Marker
            latitude={latitude}
            longitude={longitude}
            anchor="center"
        >
            <div className="bg-white rounded-[14px] shadow-lg border border-slate-100 px-3 py-2 flex flex-col gap-1.5 min-w-[60px] animate-in fade-in zoom-in duration-300 pointer-events-none">
                <div className="flex items-center gap-2.5">
                    <Car size={13} strokeWidth={2.5} className="text-blue-500" />
                    <span className="text-[12px] font-bold text-slate-800 leading-none">{carDuration}</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <Footprints size={13} strokeWidth={2.5} className="text-emerald-500" />
                    <span className="text-[12px] font-bold text-slate-800 leading-none">{walkDuration}</span>
                </div>
            </div>
        </Marker>
    );
});
