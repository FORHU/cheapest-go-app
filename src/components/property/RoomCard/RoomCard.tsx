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
    /** TGX parenthetical qualifier stripped from the room name, e.g. "smoking, extra bed not included" */
    variantLabel?: string;
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
    const openLightbox = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (lightboxImages.length > 0) setLightboxIndex(carouselIndex);
    };
    const targetCurrency = useUserCurrency();
    const sourceCurrency = currency || 'KRW';

    const hasMultipleRates = rateOptions.length > 1;
    const selectedRate = rateOptions[selectedRateIdx];
    // True when this card was formed by merging TGX room variants (e.g. smoking vs non-smoking)
    const hasVariants = rateOptions.some(r => r.variantLabel);
    // If every rate shares the same variant label, show it once as a card header instead of per-row
    const uniqueVariantLabels = [...new Set(rateOptions.map(r => r.variantLabel ?? ''))];
    const sharedVariantLabel = uniqueVariantLabels.length === 1 && uniqueVariantLabels[0] ? uniqueVariantLabels[0] : undefined;
    const [ratesExpanded, setRatesExpanded] = useState(false);
    const RATES_DEFAULT_VISIBLE = 2;
    const visibleRates = ratesExpanded ? rateOptions : rateOptions.slice(0, RATES_DEFAULT_VISIBLE);
    const hiddenCount = rateOptions.length - RATES_DEFAULT_VISIBLE;

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
            {/* Left: Photo grid */}
            <div className="w-[100px] lg:w-[260px] shrink-0 relative self-stretch min-h-[140px] lg:min-h-[180px]">
                {/* Mobile: single image */}
                <div className="lg:hidden h-full relative overflow-hidden">
                    <div
                        className={`h-full bg-cover bg-center ${lightboxImages.length > 0 ? 'cursor-zoom-in' : ''}`}
                        style={{ backgroundImage: displayImage ? `url(${displayImage})` : undefined }}
                        onClick={lightboxImages.length > 0 ? openLightbox : undefined}
                    >
                        {!displayImage && (
                            <div className="h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300">
                                <Bed size={24} />
                            </div>
                        )}
                    </div>
                    {!hasRoomPhotos && displayImage && (
                        <div className="absolute top-1.5 left-1.5 z-10">
                            <span className="text-[7px] font-semibold text-white bg-black/55 px-1 py-0.5 rounded-full">
                                {t('hotelPhotoLabel')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Desktop: main + 2 stacked thumbnails */}
                <div className="hidden lg:flex h-full gap-0.5 p-2 pr-0">
                    {/* Main photo */}
                    <div
                        className={`flex-1 relative rounded-l-xl overflow-hidden bg-slate-100 dark:bg-slate-800 ${lightboxImages.length > 0 ? 'cursor-zoom-in' : ''}`}
                        onClick={lightboxImages.length > 0 ? openLightbox : undefined}
                    >
                        {displayImage ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                                style={{ backgroundImage: `url(${displayImage})` }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300 dark:text-slate-600">
                                <Bed size={32} />
                            </div>
                        )}
                        {/* Hotel photo badge */}
                        {!hasRoomPhotos && displayImage && (
                            <div className="absolute top-2 left-2 z-10">
                                <span className="text-[8px] font-semibold text-white bg-black/55 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                                    {t('hotelPhotoLabel')}
                                </span>
                            </div>
                        )}
                        {/* Photo count badge */}
                        {lightboxImages.length > 1 && (
                            <div className="absolute bottom-2 left-2 z-10 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-sm">
                                <Images size={9} />
                                <span>{lightboxImages.length}</span>
                            </div>
                        )}
                    </div>
                    {/* Stacked thumbnails — only when 3+ photos */}
                    {roomPhotos.length >= 3 && (
                        <div className="w-[52px] flex flex-col gap-0.5">
                            <div
                                className="flex-1 relative overflow-hidden rounded-tr-xl bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
                                onClick={() => setLightboxIndex(1)}
                            >
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-300 hover:scale-110"
                                    style={{ backgroundImage: `url(${roomPhotos[1]})` }}
                                />
                            </div>
                            <div
                                className="flex-1 relative overflow-hidden rounded-br-xl bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
                                onClick={() => setLightboxIndex(2)}
                            >
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-300 hover:scale-110"
                                    style={{ backgroundImage: `url(${roomPhotos[2]})` }}
                                />
                                {/* "See all" overlay when more than 3 photos */}
                                {lightboxImages.length > 3 && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <span className="text-white text-[8px] font-semibold text-center leading-tight">+{lightboxImages.length - 3}<br/>more</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Middle: Info & Rate Options */}
            <div className="flex-1 p-2 lg:p-4 flex flex-col justify-between min-w-0">
                <div>
                    <h4 className="text-[13px] lg:text-lg font-bold text-slate-900 dark:text-white line-clamp-2 mb-0.5 lg:mb-1 group-hover:text-blue-600 transition-colors">
                        {title}
                        {hasVariants && hasMultipleRates && (
                            <span className="ml-1.5 text-[10px] lg:text-xs font-normal text-slate-400 dark:text-slate-500">
                                · {rateOptions.length} options
                            </span>
                        )}
                    </h4>

                    {/* Compact Room Specs */}
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] lg:text-xs text-slate-500 dark:text-slate-400 mb-2 lg:mb-3">
                        {roomSize && <span className="flex items-center gap-1"><Square size={9} /> {roomSize}</span>}
                        <span className="flex items-center gap-1"><User size={9} /> {t('sleeps', { count: maxOccupancy || 2 })}</span>
                        {bedType && <span className="flex items-center gap-1"><Bed size={9} /> {bedType}</span>}
                    </div>

                    {/* Rate Options (if multiple) */}
                    {hasMultipleRates ? (
                        <div className="mb-1 lg:mb-4 mt-1 lg:mt-2">
                            {/* Shared variant label — shown once above the rate table when all rates share the same qualifier */}
                            {sharedVariantLabel && (
                                <div className="text-[9px] lg:text-[11px] text-slate-500 dark:text-slate-400 mb-1 px-0.5">
                                    {sharedVariantLabel}
                                </div>
                            )}
                            {/* Rate table */}
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                {visibleRates.map((rate, idx) => (
                                    <label
                                        key={rate.offerId}
                                        className={`flex items-center gap-2 lg:gap-3 px-2 lg:px-3 py-1.5 lg:py-2 cursor-pointer transition-all relative border-l-2 ${idx < visibleRates.length - 1 ? 'border-b border-b-slate-100 dark:border-b-slate-700/60' : ''} ${selectedRateIdx === idx ? 'border-l-blue-500 bg-blue-50/80 dark:bg-blue-900/20' : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                                    >
                                        <input
                                            type="radio"
                                            name={`rate-${title}`}
                                            checked={selectedRateIdx === idx}
                                            onChange={() => setSelectedRateIdx(idx)}
                                            className="sr-only"
                                        />
                                        {/* Selection dot */}
                                        <div className={`shrink-0 w-3 h-3 rounded-full border-2 flex items-center justify-center transition-colors ${selectedRateIdx === idx ? 'border-blue-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                            {selectedRateIdx === idx && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                        </div>
                                        {/* Meal plan + variant (per-row variant only when rates differ) */}
                                        <div className="flex-1 min-w-0">
                                            {!sharedVariantLabel && rate.variantLabel && (
                                                <div className="text-[8px] lg:text-[9px] text-slate-400 dark:text-slate-500 leading-tight mb-0.5 line-clamp-2">
                                                    {rate.variantLabel}
                                                </div>
                                            )}
                                            <div className="text-[10px] lg:text-[13px] font-medium text-slate-800 dark:text-slate-200 leading-tight">
                                                {rate.boardName || t('roomOnly')}
                                            </div>
                                            {rate.paymentType && (
                                                <div className="text-[8px] lg:text-[9px] text-slate-400 dark:text-slate-500 leading-tight">
                                                    {rate.paymentType}
                                                </div>
                                            )}
                                        </div>
                                        {/* Cancel policy — hidden on mobile */}
                                        <div className={`hidden lg:block text-[10px] shrink-0 text-right min-w-[110px] font-medium ${rate.refundable === true ? 'text-emerald-600 dark:text-emerald-400' : rate.refundable === false ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {rate.refundable === true
                                                ? rate.cancellationDeadline
                                                    ? `Free cancel · ${formatCancelDeadlineShort(rate.cancellationDeadline) ?? ''}`
                                                    : t('freeCancellation')
                                                : rate.refundable === false
                                                    ? t('nonRefundablePill')
                                                    : 'Check at checkout'
                                            }
                                        </div>
                                        {/* Price */}
                                        <div className="text-right shrink-0">
                                            <div className="text-[11px] lg:text-[13px] font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                                {currencySymbol}{mounted ? (convertCurrency(rate.price, rate.currency || sourceCurrency, targetCurrency) / n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : (rate.price / n).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            </div>
                                            <div className="text-[8px] lg:text-[9px] text-slate-400 font-normal whitespace-nowrap">{t('perNight')}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            {hiddenCount > 0 && (
                                <button
                                    onClick={() => setRatesExpanded(e => !e)}
                                    className="mt-1.5 text-[9px] lg:text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                >
                                    {ratesExpanded ? '↑ Show less' : `↓ ${hiddenCount} more option${hiddenCount > 1 ? 's' : ''}`}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 lg:p-2.5 border border-slate-100 dark:border-slate-700">
                            {rateOptions[0]?.variantLabel && (
                                <div className="text-[8px] lg:text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 rounded px-1 py-0.5 mb-1 inline-block">
                                    {rateOptions[0].variantLabel}
                                </div>
                            )}
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
