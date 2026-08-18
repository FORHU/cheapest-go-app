"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, Bed, Square, X, Check, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getCurrencySymbol, convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

/**
 * Format cancellation deadline for display
 * Example: "Thu, Feb 5, 1:58 AM"
 */
function formatCancellationDeadline(deadline?: string): string | null {
    if (!deadline) return null;
    try {
        const date = new Date(deadline);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return null;
    }
}

/** Compact date for rate picker rows — "Aug 22" */
function formatCancelDeadlineShort(deadline?: string): string | null {
    if (!deadline) return null;
    try {
        const date = new Date(deadline);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return null;
    }
}

/** Rate option for a room */
export interface RateOption {
    offerId: string;
    price: number;
    currency: string;
    boardType?: string;
    boardName?: string;
    refundable: boolean | null;
    cancellationDeadline?: string;
    /** 'Pay now' (MERCHANT) or 'Pay at hotel' (DIRECT) — only set when known */
    paymentType?: string;
}

export interface RoomCardProps {
    /** Room title/name */
    title: string;
    /** Total stay price (all nights combined, from TGX/LiteAPI) */
    price: number;
    /** Currency code */
    currency?: string;
    /** Number of nights in the stay — used to compute per-night display price */
    nights?: number;
    /** Maximum occupancy */
    maxOccupancy?: number;
    /** Bed type description */
    bedType?: string;
    /** Room size */
    roomSize?: string;
    /** Whether free cancellation is available (for primary rate) */
    freeCancellation?: boolean | null;
    /** Room image URL */
    roomImage?: string;
    /** Room description */
    description?: string;
    /** List of amenities */
    amenities?: (string | { name: string })[];
    /** Number of photos available */
    photoCount?: number;
    /** All room photo URLs for lightbox */
    roomImages?: string[];
    /** Hotel-level photos — used as lightbox fallback when no room-specific images */
    galleryImages?: string[];
    /** Handler for reserve/book action - receives offerId */
    onReserve: (offerId?: string) => void;
    /** Handler for viewing room details (optional — hidden when absent) */
    onViewDetails?: () => void;
    /** Multiple rate options for this room (optional) */
    rateOptions?: RateOption[];
}

function RoomLightbox({ images, startIndex, roomName, onClose }: {
    images: string[];
    startIndex: number;
    roomName: string;
    onClose: () => void;
}) {
    const [idx, setIdx] = useState(startIndex);
    const total = images.length;

    const prev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setIdx(i => (i === 0 ? total - 1 : i - 1));
    }, [total]);

    const next = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setIdx(i => (i === total - 1 ? 0 : i + 1));
    }, [total]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') prev();
            if (e.key === 'ArrowRight') next();
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [onClose, prev, next]);

    return createPortal(
        <div
            className="fixed inset-0 z-200 bg-black/95 flex flex-col items-center justify-center"
            onClick={onClose}
        >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/60 to-transparent z-10" onClick={e => e.stopPropagation()}>
                <p className="text-white font-semibold text-sm truncate max-w-[70%]">{roomName}</p>
                <div className="flex items-center gap-3">
                    <span className="text-white/70 text-sm">{idx + 1} / {total}</span>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
                        <X size={22} />
                    </button>
                </div>
            </div>

            {/* Main image */}
            <div className="relative w-full h-full flex items-center justify-center px-14" onClick={e => e.stopPropagation()}>
                <Image
                    src={images[idx]}
                    alt={`${roomName} photo ${idx + 1}`}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    unoptimized
                />
            </div>

            {/* Prev / Next */}
            {total > 1 && (
                <>
                    <button
                        onClick={prev}
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors z-10"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <button
                        onClick={next}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors z-10"
                    >
                        <ChevronRight size={22} />
                    </button>
                </>
            )}

            {/* Thumbnail strip */}
            {total > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4 z-10 overflow-x-auto" onClick={e => e.stopPropagation()}>
                    {images.map((src, i) => (
                        <button
                            key={i}
                            onClick={() => setIdx(i)}
                            className={`shrink-0 w-12 h-10 rounded-md overflow-hidden border-2 transition-all ${i === idx ? 'border-white' : 'border-transparent opacity-60 hover:opacity-90'}`}
                        >
                            <Image src={src} alt="" width={48} height={40} className="w-full h-full object-cover" unoptimized />
                        </button>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}
export const RoomCard: React.FC<RoomCardProps> = ({
    title,
    price,
    currency = 'PHP',
    nights = 1,
    maxOccupancy,
    bedType,
    roomSize,
    freeCancellation,
    roomImage,
    amenities,
    photoCount,
    roomImages,
    galleryImages,
    onReserve,
    onViewDetails = undefined,
    rateOptions = []
}) => {
    const t = useTranslations('property.rooms');
    const [selectedRateIdx, setSelectedRateIdx] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [carouselIndex, setCarouselIndex] = useState(0);
    useEffect(() => setMounted(true), []);

    // Room-specific photos take priority; hotel gallery is lightbox-only fallback
    const roomPhotos = roomImages?.filter(Boolean) ?? [];
    const hasRoomPhotos = roomPhotos.length > 0;
    const lightboxImages = hasRoomPhotos ? roomPhotos : (galleryImages?.filter(Boolean) ?? (roomImage ? [roomImage] : []));
    const displayImage = hasRoomPhotos ? (roomPhotos[carouselIndex] ?? roomImage) : roomImage;
    const hasMultipleImages = roomPhotos.length > 1;

    const carouselPrev = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setCarouselIndex(i => (i === 0 ? roomPhotos.length - 1 : i - 1));
    }, [roomPhotos.length]);

    const carouselNext = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setCarouselIndex(i => (i === roomPhotos.length - 1 ? 0 : i + 1));
    }, [roomPhotos.length]);

    const openLightbox = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (lightboxImages.length > 0) setLightboxIndex(carouselIndex);
    };
    const targetCurrency = useUserCurrency();
    const sourceCurrency = currency || 'KRW';

    const hasMultipleRates = rateOptions.length > 1;
    const selectedRate = rateOptions[selectedRateIdx];

    const n = Math.max(1, nights);
    const basePriceConverted = mounted ? convertCurrency(price, sourceCurrency, targetCurrency) : price;
    const selectedRatePriceConverted = selectedRate
        ? (mounted ? convertCurrency(selectedRate.price, selectedRate.currency || sourceCurrency, targetCurrency) : selectedRate.price)
        : undefined;

    // TGX/LiteAPI prices are total-stay amounts; divide by nights for per-night display.
    const displayPrice = (selectedRatePriceConverted ?? basePriceConverted) / n;
    const currencySymbol = getCurrencySymbol(mounted ? targetCurrency : sourceCurrency);
    const displayRefundable: boolean | null | undefined =
        selectedRate !== undefined ? selectedRate.refundable : (freeCancellation ?? null);
    const displayOfferId = selectedRate?.offerId;

    return (
        <>
        {lightboxIndex !== null && lightboxImages.length > 0 && (
            <RoomLightbox
                images={lightboxImages}
                startIndex={lightboxIndex}
                roomName={title}
                onClose={() => setLightboxIndex(null)}
            />
        )}
        <div className="flex flex-row bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all group">
            {/* Left: Image carousel */}
            <div className="w-[110px] lg:w-[240px] relative h-auto p-2 lg:p-3 pr-0 lg:pr-0 shrink-0">
                {/* Image */}
                <div
                    className={`w-full h-full rounded-xl overflow-hidden shadow-sm relative ${lightboxImages.length > 0 ? 'cursor-zoom-in' : ''}`}
                    onClick={lightboxImages.length > 0 ? openLightbox : onViewDetails}
                >
                    {displayImage ? (
                        <div
                            className="w-full h-full bg-cover bg-center transition-all duration-300 group-hover:scale-105 rounded-xl"
                            style={{ backgroundImage: `url(${displayImage})` }}
                        />
                    ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                            <Bed size={32} />
                        </div>
                    )}

                    {/* Hotel photo badge — persistent, visible whenever showing hotel-level fallback */}
                    {!hasRoomPhotos && displayImage && (
                        <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                            <span className="text-[8px] font-semibold text-white bg-black/55 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                                {t('hotelPhotoLabel')}
                            </span>
                        </div>
                    )}

                    {/* Hover hint */}
                    {lightboxImages.length > 0 && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-xl pointer-events-none">
                            <span className="text-white text-[9px] font-medium bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                {hasRoomPhotos ? t('viewRoomPhotos') : t('viewHotelPhotos')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Carousel prev/next — only when room-specific photos */}
                {hasMultipleImages && (
                    <>
                        <button
                            onClick={carouselPrev}
                            className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-0.5 lg:p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            onClick={carouselNext}
                            className="absolute right-1 lg:right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-0.5 lg:p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                            <ChevronRight size={14} />
                        </button>

                        {/* Dots */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                            {roomPhotos.slice(0, 5).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={e => { e.stopPropagation(); setCarouselIndex(i); }}
                                    className={`rounded-full transition-all ${i === carouselIndex ? 'bg-white w-3 h-1.5' : 'bg-white/60 w-1.5 h-1.5'}`}
                                />
                            ))}
                        </div>

                        {/* Count badge */}
                        <div className="absolute top-3 right-1 lg:right-3 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-md flex items-center gap-1 backdrop-blur-sm z-10">
                            <Images size={9} />
                            <span>{lightboxImages.length}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Middle: Info & Rate Options */}
            <div className="flex-1 p-2 lg:p-4 flex flex-col justify-between min-w-0">
                <div>
                    <h4 className="text-[13px] lg:text-lg font-bold text-slate-900 dark:text-white line-clamp-2 mb-0.5 lg:mb-1 group-hover:text-blue-600 transition-colors">
                        {title}
                    </h4>

                    {/* Compact Room Specs */}
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] lg:text-xs text-slate-500 dark:text-slate-400 mb-2 lg:mb-3">
                        {roomSize && <span className="flex items-center gap-1"><Square size={9} /> {roomSize}</span>}
                        <span className="flex items-center gap-1"><User size={9} /> {t('sleeps', { count: maxOccupancy || 2 })}</span>
                        {bedType && <span className="flex items-center gap-1"><Bed size={9} /> {bedType}</span>}
                    </div>

                    {/* Rate Options (if multiple) */}
                    {hasMultipleRates ? (
                        <div className="space-y-1 mb-1 lg:mb-4">
                            <div className="text-[9px] lg:text-xs font-bold text-slate-900 dark:text-white mb-0.5 mt-1.5 lg:mt-2">
                                {t('rateOptions', { count: rateOptions.length })}
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                                {rateOptions.map((rate, idx) => (
                                    <label
                                        key={rate.offerId}
                                        className={`flex items-center justify-between p-1 LG:p-2 rounded-lg cursor-pointer border transition-all ${selectedRateIdx === idx
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1 min-w-0 flex-1">
                                            <input
                                                type="radio"
                                                name={`rate-${title}`}
                                                checked={selectedRateIdx === idx}
                                                onChange={() => setSelectedRateIdx(idx)}
                                                className="w-2.5 h-2.5 text-blue-600 cursor-pointer shrink-0"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] lg:text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                    {rate.boardName || t('roomOnly')}
                                                </div>
                                                <div className={`text-[8px] lg:text-[11px] font-medium leading-tight ${rate.refundable === true ? 'text-emerald-600 dark:text-emerald-400' : rate.refundable === false ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {rate.refundable === true
                                                        ? rate.cancellationDeadline
                                                            ? `Free cancel · ${formatCancelDeadlineShort(rate.cancellationDeadline) ?? ''}`
                                                            : t('freeCancellation')
                                                        : rate.refundable === false
                                                            ? t('nonRefundablePill')
                                                            : 'Check at checkout'
                                                    }
                                                </div>
                                                {rate.paymentType && (
                                                    <span className="inline-block mt-0.5 text-[7px] lg:text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 leading-tight">
                                                        {rate.paymentType}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-[10px] lg:text-sm font-bold text-slate-900 dark:text-white ml-2 text-right shrink-0 whitespace-nowrap">
                                            {currencySymbol}{mounted ? (convertCurrency(rate.price, rate.currency || sourceCurrency, targetCurrency) / n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : (rate.price / n).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            <div className="text-[8px] text-slate-500 font-normal">{t('perNight')}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 lg:p-2.5 border border-slate-100 dark:border-slate-700">
                            <div className="font-bold text-[10px] lg:text-sm text-slate-900 dark:text-white mb-0.5 lg:mb-1">
                                {rateOptions[0]?.boardName || t('roomOnly')}
                            </div>
                            <div className="space-y-1">
                                {rateOptions[0]?.boardType && rateOptions[0].boardType !== 'RO' ? null : (
                                    <div className="text-[9px] lg:text-xs text-slate-500 flex items-center gap-1.5">
                                        <X size={10} className="text-slate-400" /> {t('noMeals')}
                                    </div>
                                )}
                                {displayRefundable === true ? (
                                    <div className="text-[9px] lg:text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                                        <Check size={10} />
                                        {rateOptions[0]?.cancellationDeadline
                                            ? `Free cancel · ${formatCancelDeadlineShort(rateOptions[0].cancellationDeadline) ?? ''}`
                                            : t('freeCancellation')
                                        }
                                    </div>
                                ) : displayRefundable === false ? (
                                    <div className="text-[9px] lg:text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full border border-amber-400 dark:border-amber-500 flex items-center justify-center text-[7px] text-amber-500">
                                            i
                                        </div>
                                        {t('nonRefundablePill')}
                                    </div>
                                ) : (
                                    <div className="text-[9px] lg:text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-[7px] text-slate-400">
                                            ?
                                        </div>
                                        Check at checkout
                                    </div>
                                )}
                                {rateOptions[0]?.paymentType && (
                                    <span className="inline-block mt-0.5 text-[8px] lg:text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                        {rateOptions[0].paymentType}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-2 lg:mt-3 gap-2">
                    <div className="flex flex-col min-w-0">
                        {/* Hide price on mobile if multiple rates since it's already shown on the radio button */}
                        {!hasMultipleRates && (
                            <div className="lg:hidden mt-0.5">
                                <div className="flex items-baseline gap-0.5 flex-wrap">
                                    <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 leading-none whitespace-nowrap">
                                        {currencySymbol}{displayPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </span>
                                    <span className="text-[9px] text-slate-500 whitespace-nowrap">{t('perNight')}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile Action Button */}
                    <button
                        onClick={() => onReserve(displayOfferId)}
                        className="lg:hidden bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2.5 rounded-lg text-[11px] shadow-sm shrink-0"
                    >
                        {t('choose')}
                    </button>
                </div>
            </div>

            {/* Right: Pricing & Action (Desktop Sidebar) */}
            <div className={`p-3 lg:p-4 hidden lg:flex lg:flex-col justify-between lg:items-end bg-slate-50/50 dark:bg-white/5 lg:min-w-[180px] border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-white/5 shrink-0`}>
                <div className="text-right hidden lg:block">
                    <div className="flex items-baseline justify-end gap-1">
                        <span className="text-[18px] font-bold text-slate-900 dark:text-white leading-none">
                            {currencySymbol}{displayPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[12px] text-slate-500">{t('perNight')}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2">
                        {t('includesTaxes', { nights: n })}
                    </div>
                </div>

                <div className="w-full h-full lg:h-auto flex items-end">
                    <button
                        onClick={() => onReserve(displayOfferId)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-[13px] lg:text-sm transition-colors w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        {t('chooseRoom')}
                    </button>
                </div>
            </div>
        </div>
        </>
    );
};

export default RoomCard;
