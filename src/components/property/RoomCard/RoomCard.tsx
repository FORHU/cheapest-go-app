"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bed, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getCurrencySymbol, convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

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
    /** TGX parenthetical qualifier stripped from the room name */
    variantLabel?: string;
    /** Badge shown above the board name when multiple room types share the same photos */
    roomDifferentiator?: string;
    /** Original room group name this rate came from (used for booking title in merged cards) */
    sourceName?: string;
}

export interface RoomCardProps {
    title: string;
    price: number;
    currency?: string;
    nights?: number;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    freeCancellation?: boolean | null;
    roomImage?: string;
    description?: string;
    amenities?: (string | { name: string })[];
    photoCount?: number;
    roomImages?: string[];
    galleryImages?: string[];
    onReserve: (offerId?: string) => void;
    onViewDetails?: () => void;
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
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/60 to-transparent z-10" onClick={e => e.stopPropagation()}>
                <p className="text-white font-semibold text-sm truncate max-w-[70%]">{roomName}</p>
                <div className="flex items-center gap-3">
                    <span className="text-white/70 text-sm">{idx + 1} / {total}</span>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
                        <X size={22} />
                    </button>
                </div>
            </div>

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

            {total > 1 && (
                <>
                    <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors z-10">
                        <ChevronLeft size={22} />
                    </button>
                    <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition-colors z-10">
                        <ChevronRight size={22} />
                    </button>
                </>
            )}

            {total > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4 z-10 overflow-x-auto" onClick={e => e.stopPropagation()}>
                    {images.map((src, i) => (
                        <button
                            key={i}
                            onClick={() => setIdx(i)}
                            className={`shrink-0 w-12 h-8 rounded overflow-hidden border-2 transition-all ${i === idx ? 'border-white' : 'border-transparent opacity-60 hover:opacity-80'}`}
                        >
                            <Image src={src} alt="" fill className="object-cover" sizes="48px" unoptimized />
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
    freeCancellation,
    roomImage,
    amenities,
    roomImages,
    galleryImages,
    onReserve,
    rateOptions = [],
}) => {
    const t = useTranslations('property.rooms');
    const [mounted, setMounted] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    useEffect(() => setMounted(true), []);

    const roomPhotos = roomImages?.filter(Boolean) ?? [];
    const hasRoomPhotos = roomPhotos.length > 0;
    const lightboxImages = hasRoomPhotos
        ? roomPhotos
        : (galleryImages?.filter(Boolean) ?? (roomImage ? [roomImage] : []));

    const targetCurrency = useUserCurrency();
    const sourceCurrency = currency || 'KRW';
    const n = Math.max(1, nights);
    const currencySymbol = getCurrencySymbol(mounted ? targetCurrency : sourceCurrency);

    const getDisplayPrice = (rate: RateOption) => {
        const converted = mounted
            ? convertCurrency(rate.price, rate.currency || sourceCurrency, targetCurrency)
            : rate.price;
        return converted / n;
    };

    // Fallback single-rate built from base props when rateOptions is empty
    const effectiveRates: RateOption[] = rateOptions.length > 0 ? rateOptions : [{
        offerId: '',
        price,
        currency: sourceCurrency,
        refundable: freeCancellation ?? null,
    }];

    // Photo slots
    const photo1 = lightboxImages[0];
    const photo2 = lightboxImages[1];
    const photo3 = lightboxImages[2];
    const hasGallery = lightboxImages.length >= 2;

    const openLightbox = (i: number) => {
        if (lightboxImages.length > 0) setLightboxIndex(i);
    };

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

            <div className="flex flex-col lg:flex-row bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">

                {/* ── MOBILE: Full-width photo ── */}
                <div className="lg:hidden relative h-48 bg-slate-100 dark:bg-slate-800 shrink-0">
                    {photo1 ? (
                        <div
                            className="absolute inset-0 bg-cover bg-center cursor-zoom-in"
                            style={{ backgroundImage: `url(${photo1})` }}
                            onClick={() => openLightbox(0)}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-300 dark:text-slate-600">
                            <Bed size={32} />
                        </div>
                    )}
                    {!hasRoomPhotos && photo1 && (
                        <span className="absolute top-2 left-2 text-[7px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded-full">
                            {t('hotelPhotoLabel')}
                        </span>
                    )}
                    {lightboxImages.length > 1 && (
                        <span className="absolute bottom-2 right-2 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
                            +{lightboxImages.length - 1} photos
                        </span>
                    )}
                </div>

                {/* ── DESKTOP: Vertical photo gallery ── */}
                <div className="hidden lg:flex w-[240px] shrink-0 flex-col gap-1 p-2 pr-0">
                    {/* Slot 1: large */}
                    <div
                        className={`relative flex-[5] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 min-h-[140px] ${photo1 ? 'cursor-zoom-in' : ''}`}
                        onClick={photo1 ? () => openLightbox(0) : undefined}
                    >
                        {photo1 ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center hover:scale-105 transition-transform duration-300"
                                style={{ backgroundImage: `url(${photo1})` }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300 dark:text-slate-600">
                                <Bed size={32} />
                            </div>
                        )}
                        {!hasRoomPhotos && photo1 && (
                            <span className="absolute top-2 left-2 text-[8px] font-semibold text-white bg-black/55 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                                {t('hotelPhotoLabel')}
                            </span>
                        )}
                    </div>

                    {/* Slot 2: medium (show only if 2+ photos) */}
                    {hasGallery && (
                        <div
                            className="relative flex-[3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 min-h-[90px] cursor-zoom-in"
                            onClick={() => openLightbox(1)}
                        >
                            {photo2 && (
                                <div
                                    className="absolute inset-0 bg-cover bg-center hover:scale-105 transition-transform duration-300"
                                    style={{ backgroundImage: `url(${photo2})` }}
                                />
                            )}
                        </div>
                    )}

                    {/* Bottom row: slot 3 + show-more (show only if 3+ photos) */}
                    {photo3 && (
                        <div className="flex gap-1 flex-[2] min-h-[70px]">
                            <div
                                className="flex-1 relative overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
                                onClick={() => openLightbox(2)}
                            >
                                <div
                                    className="absolute inset-0 bg-cover bg-center hover:scale-105 transition-transform duration-300"
                                    style={{ backgroundImage: `url(${photo3})` }}
                                />
                            </div>
                            {/* Show-more slot */}
                            <div
                                className="flex-1 relative overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-700 cursor-zoom-in"
                                onClick={() => openLightbox(3)}
                            >
                                {lightboxImages[3] && (
                                    <div
                                        className="absolute inset-0 bg-cover bg-center"
                                        style={{ backgroundImage: `url(${lightboxImages[3]})` }}
                                    />
                                )}
                                <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                                    <span className="text-white text-[10px] font-semibold text-center leading-tight">
                                        {lightboxImages.length > 4
                                            ? `+${lightboxImages.length - 3}\nmore`
                                            : 'View\nall'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Content: name + amenities + rate table ── */}
                <div className="flex-1 flex flex-col p-3 lg:p-4 min-w-0">

                    {/* Room name */}
                    <h4 className="text-[13px] lg:text-base font-bold text-slate-900 dark:text-white mb-2 lg:mb-3">
                        {title}
                    </h4>

                    {/* Amenities */}
                    {amenities && amenities.length > 0 && (
                        <div className="mb-3 p-2.5 lg:p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40">
                            <div className="text-[8px] lg:text-[9px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500 mb-1.5">
                                Amenities
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {amenities.map((a, i) => {
                                    const label = typeof a === 'string' ? a : a.name;
                                    return (
                                        <span
                                            key={i}
                                            className="text-[8px] lg:text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                                        >
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Rate options table */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mt-auto">
                        {effectiveRates.map((rate, idx) => {
                            const rowPrice = getDisplayPrice(rate);
                            const cancelText = rate.refundable === true
                                ? (rate.cancellationDeadline
                                    ? `Free cancel · ${formatCancelDeadlineShort(rate.cancellationDeadline) ?? ''}`
                                    : t('freeCancellation'))
                                : rate.refundable === false
                                    ? t('nonRefundablePill')
                                    : 'Check at checkout';
                            const cancelColor = rate.refundable === true
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : rate.refundable === false
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500';

                            return (
                                <div
                                    key={rate.offerId || idx}
                                    className={`flex items-center gap-2 lg:gap-4 px-3 py-2.5 lg:py-3 ${idx < effectiveRates.length - 1 ? 'border-b border-slate-100 dark:border-slate-700/60' : ''}`}
                                >
                                    {/* Board + variant + payment */}
                                    <div className="flex-1 min-w-0">
                                        {rate.roomDifferentiator && (
                                            <span className="inline-block mb-1 text-[8px] lg:text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                                                {rate.roomDifferentiator}
                                            </span>
                                        )}
                                        <div className="text-[11px] lg:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                                            {rate.boardName || t('roomOnly')}
                                        </div>
                                        {rate.variantLabel && (
                                            <div className="text-[8px] lg:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                                                {rate.variantLabel}
                                            </div>
                                        )}
                                    </div>

                                    {/* Cancellation policy — desktop only */}
                                    <div className={`hidden lg:block text-[10px] font-medium shrink-0 min-w-[140px] text-right ${cancelColor}`}>
                                        {cancelText}
                                    </div>

                                    {/* Price */}
                                    <div className="shrink-0 text-right">
                                        <div className="text-[13px] lg:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                            {currencySymbol}{rowPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                        </div>
                                        <div className="text-[8px] lg:text-[9px] text-slate-400 whitespace-nowrap">{t('perNight')}</div>
                                    </div>

                                    {/* SELECT */}
                                    <button
                                        onClick={() => onReserve(rate.offerId || undefined)}
                                        className="shrink-0 px-3 py-1.5 lg:px-4 lg:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[10px] lg:text-[11px] font-bold rounded-lg transition-colors shadow-sm"
                                    >
                                        {t('select')}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
};

export default RoomCard;
