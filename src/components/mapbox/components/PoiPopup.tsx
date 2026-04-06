import React from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { X, Navigation, Car, Footprints } from 'lucide-react';

interface PoiPopupProps {
    poi: {
        name: string;
        category: string;
        coordinates: { lat: number; lng: number };
    };
    distance?: string;
    carDuration?: string | null;
    walkDuration?: string | null;
    onClose: () => void;
}

export const PoiPopup = React.memo(({ poi, distance, carDuration, walkDuration, onClose }: PoiPopupProps) => {
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${poi.coordinates.lat},${poi.coordinates.lng}`;

    return (
        <Popup
            latitude={poi.coordinates.lat}
            longitude={poi.coordinates.lng}
            anchor="bottom"
            offset={25}
            closeOnClick={false}
            onClose={onClose}
            className="z-50"
            maxWidth="260px"
        >
            <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-4 min-w-[240px] relative font-sans">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={16} strokeWidth={2} />
                </button>

                <h3 className="font-bold text-slate-800 text-[14px] leading-tight pr-6 mb-0.5">
                    {poi.name}
                </h3>

                <p className="text-[12px] text-slate-500 mb-3.5">
                    {poi.category}
                </p>

                <div className="flex items-center gap-2 mb-3 text-[12px] text-slate-600 font-medium tracking-tight">
                    <div className="flex items-center justify-center w-[22px] h-[22px] bg-slate-100 rounded-full shrink-0">
                        <Navigation size={10} className="text-slate-700 transform rotate-45 -ml-px -mt-px" fill="currentColor" />
                    </div>
                    <span>{distance || '1.00 km'} from property</span>
                </div>

                {(carDuration || walkDuration) && (
                    <div className="flex items-center gap-2 mb-3">
                        {carDuration && (
                            <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-lg">
                                <Car size={11} className="text-blue-600" />
                                <span className="text-[11px] font-bold text-blue-700">{carDuration}</span>
                            </div>
                        )}
                        {walkDuration && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg">
                                <Footprints size={11} className="text-emerald-600" />
                                <span className="text-[11px] font-bold text-emerald-700">{walkDuration}</span>
                            </div>
                        )}
                    </div>
                )}

                <a
                    href={googleMapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
                >
                    View on Google Maps
                </a>
            </div>
        </Popup>
    );
});
