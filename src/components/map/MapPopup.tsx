'use client';

import React, { useEffect, useState } from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { MappableProperty } from './types';

interface MapPopupProps {
    property: MappableProperty;
    onClose: () => void;
    onViewDetails: (id: string) => void;
    mapRef?: React.RefObject<any>;
    isCentered?: boolean;
}

function getRatingLabel(rating: number, t: ReturnType<typeof useTranslations>): string {
    if (rating >= 9) return t('exceptional');
    if (rating >= 8) return t('excellent');
    if (rating >= 7) return t('veryGood');
    if (rating >= 6) return t('good');
    return t('pleasant');
}

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function StarRating({ rating, size = 10 }: { rating: number; size?: number }) {
    const pct = Math.min(100, Math.max(0, (rating / 10) * 100));
    return (
        <div className="relative inline-flex gap-px">
            {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="text-slate-200 dark:text-slate-700 flex-shrink-0">
                    <path d={STAR_PATH} fill="currentColor" />
                </svg>
            ))}
            <div className="absolute inset-0 overflow-hidden flex gap-px" style={{ width: `${pct}%` }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="text-blue-500 flex-shrink-0">
                        <path d={STAR_PATH} fill="currentColor" />
                    </svg>
                ))}
            </div>
        </div>
    );
}

function useIsLandscapeMobile() {
    const [is, setIs] = useState(false);
    useEffect(() => {
        const check = () =>
            setIs(window.innerHeight < 500 && window.innerWidth > window.innerHeight);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return is;
}

const MapPopup = React.memo(function MapPopup({
    property,
    onClose,
    onViewDetails,
    mapRef,
    isCentered = false
}: MapPopupProps) {
    const isLandscape = useIsLandscapeMobile();
    const isMobile = useIsMobile();
    const targetCurrency = useUserCurrency();
    const t = useTranslations('hotels.card');
    const rt = useTranslations('hotels.ratings');
    const sourceCurrency = property.currency || 'USD';
    const displayPrice = React.useMemo(
        () => convertCurrency(property.price, sourceCurrency, targetCurrency),
        [property.price, sourceCurrency, targetCurrency]
    );
    const displayOriginalPrice = React.useMemo(
        () => property.originalPrice
            ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency)
            : undefined,
        [property.originalPrice, sourceCurrency, targetCurrency]
    );
    const rating = property.rating ?? 0;

    // Image carousel state
    const images = React.useMemo(() => {
        const arr = (property as any).images as string[] | undefined;
        const all = arr?.length ? arr : property.image ? [property.image] : [];
        return all.filter(Boolean);
    }, [property]);
    const [imgIndex, setImgIndex] = useState(0);
    const [imgLoading, setImgLoading] = useState(false);
    const [isImageHovered, setIsImageHovered] = useState(false);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    // Reset index when property changes
    React.useEffect(() => { setImgIndex(0); setImgLoading(false); }, [property.id]);

    const prevImage = React.useCallback(() => {
        setImgLoading(true);
        setImgIndex(i => Math.max(0, i - 1));
    }, []);
    const nextImage = React.useCallback(() => {
        setImgLoading(true);
        setImgIndex(i => Math.min(images.length - 1, i + 1));
    }, [images.length]);

    const handleTouchStart = (e: React.TouchEvent) =>
        setTouchStartX(e.touches[0].clientX);
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) >= 40) dx < 0 ? nextImage() : prevImage();
        setTouchStartX(null);
    };

    // Keep a stable ref to onClose so the effect never needs to re-run when the
    // parent re-renders and passes a new function identity.
    const onCloseRef = React.useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        const handleMapClose = () => onCloseRef.current();

        const map = mapRef?.current?.getMap();
        if (map) {
            map.on('dragstart', handleMapClose);
            map.on('zoomstart', handleMapClose);
            map.on('wheel', handleMapClose);
        }

        return () => {
            if (map) {
                map.off('dragstart', handleMapClose);
                map.off('zoomstart', handleMapClose);
                map.off('wheel', handleMapClose);
            }
        };

    }, [mapRef])
    const content = (
        <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl w-[240px]">

            {/* Image carousel */}
            <div
                className="relative select-none"
                onMouseEnter={() => setIsImageHovered(true)}
                onMouseLeave={() => setIsImageHovered(false)}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {/* Skeleton shown while next image loads */}
                {imgLoading && (
                    <div className={`absolute inset-x-0 top-0 bg-slate-200 dark:bg-slate-700 animate-pulse ${isLandscape ? 'h-16' : 'h-24'}`}>
                        <div className="absolute inset-0 flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400/60 dark:bg-slate-500/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400/60 dark:bg-slate-500/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400/60 dark:bg-slate-500/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <img
                    key={images[imgIndex]}
                    src={images[imgIndex] || undefined}
                    alt={property.name}
                    className={`w-full object-cover transition-opacity duration-300 ${isLandscape ? 'h-16' : 'h-24'} ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
                    loading="lazy"
                    onLoad={() => setImgLoading(false)}
                    onError={() => setImgLoading(false)}
                />
                <button
                    onClick={onClose}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer z-10"
                >
                    <X className="w-3 h-3 text-white" />
                </button>

                {/* Desktop: hover-reveal arrow buttons */}
                {!isMobile && images.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); prevImage(); }}
                            className={`absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all cursor-pointer ${isImageHovered && imgIndex > 0 ? 'opacity-100' : 'opacity-0'}`}
                        >
                            <ChevronLeft className="w-3 h-3 text-white" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); nextImage(); }}
                            className={`absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-all cursor-pointer ${isImageHovered && imgIndex < images.length - 1 ? 'opacity-100' : 'opacity-0'}`}
                        >
                            <ChevronRight className="w-3 h-3 text-white" />
                        </button>
                    </>
                )}

                {/* Dot indicators */}
                {images.length > 1 && !isLandscape && (
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                        {images.map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-full transition-all duration-200 ${i === imgIndex ? 'w-3 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`}
                            />
                        ))}
                    </div>
                )}

                {/* Badges */}
                {property.refundableTag === 'RFN' && (
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                        {isLandscape ? t('freeCancelShort') : t('freeCancellation')}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className={isLandscape ? 'p-1.5' : 'p-2'}>
                <h3 className={`font-bold text-slate-900 dark:text-white leading-tight truncate ${isLandscape ? 'text-[10px]' : 'text-[11px]'}`}>
                    {property.name}
                </h3>

                {/* Rating */}
                {rating > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                        <StarRating rating={rating} size={10} />
                        <span className="text-[9px] text-slate-500 dark:text-slate-400">{rating.toFixed(1)} · {getRatingLabel(rating, rt)}</span>
                    </div>
                )}

                {/* Price + CTA */}
                <div className={`flex items-center justify-between border-t border-slate-100 dark:border-slate-800 ${isLandscape ? 'mt-1 pt-1' : 'mt-1.5 pt-1.5'}`}>
                    <div className="leading-none">
                        {displayOriginalPrice && displayOriginalPrice > displayPrice && (
                            <span className="text-[8px] text-slate-400 line-through block mb-0.5">
                                {formatCurrency(displayOriginalPrice, targetCurrency)}
                            </span>
                        )}
                        <span className={`font-bold text-blue-600 dark:text-blue-400 ${isLandscape ? 'text-xs' : 'text-[13px]'}`}>
                            {formatCurrency(displayPrice, targetCurrency)}
                        </span>
                        <span className="text-[8px] text-slate-400 ml-0.5">{t('perNight')}</span>
                    </div>
                    <button
                        onClick={() => onViewDetails(property.id)}
                        className={`bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${isLandscape ? 'text-[9px] px-2 py-1' : 'text-[9px] px-2 py-1'}`}
                    >
                        {t('viewDeal')}
                    </button>
                </div>
            </div>
        </div>
    );

    if (isCentered) return content;

    return (
        <Popup
            latitude={property.coordinates.lat}
            longitude={property.coordinates.lng}
            anchor="bottom"
            offset={isLandscape ? 25 : 60}
            closeOnClick={false}
            onClose={onClose}
            className="map-property-popup z-50"
            maxWidth="min(240px, calc(100vw - 32px))"
        >
            {content}
        </Popup>
    );
});

export { MapPopup };
export type { MapPopupProps };