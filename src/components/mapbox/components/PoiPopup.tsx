import React, { useState } from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { X, Navigation, Car, Footprints } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getPoiImageUrl } from '@/utils/images';

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
    const t = useTranslations('hotels.poiPopup');
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${poi.coordinates.lat},${poi.coordinates.lng}`;
    const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

    const imageUrl = getPoiImageUrl(poi.name, poi.coordinates.lat, poi.coordinates.lng, {
        category: poi.category,
    });

    return (
        <Popup
            latitude={poi.coordinates.lat}
            longitude={poi.coordinates.lng}
            anchor="bottom"
            offset={25}
            closeOnClick={false}
            onClose={onClose}
            className="z-50"
            maxWidth="min(260px, calc(100vw - 32px))"
        >
            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl w-[240px]">

                {/* Image */}
                <div className="relative h-28 bg-slate-100 dark:bg-slate-800">
                    {imgStatus === 'loading' && (
                        <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    )}
                    {imgStatus !== 'error' && (
                        <img
                            src={imageUrl}
                            alt={poi.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onLoad={() => setImgStatus('loaded')}
                            onError={() => setImgStatus('error')}
                        />
                    )}
                    {imgStatus === 'error' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
                            <span className="text-[10px] text-slate-400 px-2 text-center">{poi.name}</span>
                        </div>
                    )}
                    {imgStatus === 'loaded' && (
                        <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                    )}
                    <button
                        onClick={onClose}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
                    >
                        <X className="w-3 h-3 text-white" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-3">
                    <h3 className="font-bold text-slate-900 dark:text-white text-[13px] leading-tight truncate mb-0.5">
                        {poi.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize mb-2.5">
                        {poi.category}
                    </p>

                    <div className="flex items-center gap-1.5 mb-2 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                        <div className="flex items-center justify-center w-5 h-5 bg-slate-100 dark:bg-slate-800 rounded-full shrink-0">
                            <Navigation size={9} className="text-slate-600 dark:text-slate-300 rotate-45 -ml-px -mt-px" fill="currentColor" />
                        </div>
                        <span>{distance || '—'} {t('fromProperty')}</span>
                    </div>

                    {(carDuration || walkDuration) && (
                        <div className="flex items-center gap-1.5 mb-2.5">
                            {carDuration && (
                                <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded-lg">
                                    <Car size={10} className="text-blue-600 dark:text-blue-400" />
                                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">{carDuration}</span>
                                </div>
                            )}
                            {walkDuration && (
                                <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-lg">
                                    <Footprints size={10} className="text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{walkDuration}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <a
                        href={googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
                    >
                        {t('viewOnGoogleMaps')} →
                    </a>
                </div>
            </div>
        </Popup>
    );
});
