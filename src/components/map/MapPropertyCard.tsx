'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { MapPin, Building2 } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency, useDates } from '@/stores/searchStore';
import type { MappableProperty } from './types';

interface MapPropertyCardProps {
    property: MappableProperty;
    isSelected: boolean;
    isHovered: boolean;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
    onViewDetails?: (id: string) => void;
    index?: number;
}

type Translator = ReturnType<typeof useTranslations>;

function getRatingLabel(rating: number, t: Translator): string {
    if (rating === 0) return '';
    if (rating >= 9)  return t('exceptional');
    if (rating >= 8)  return t('excellent');
    if (rating >= 7)  return t('veryGood');
    if (rating >= 6)  return t('good');
    if (rating >= 5)  return t('fair');
    return t('poor');
}

function getRatingBadgeClass(rating: number): string {
    if (rating >= 9) return 'bg-green-600';
    if (rating >= 8) return 'bg-green-500';
    if (rating >= 7) return 'bg-blue-500';
    if (rating >= 6) return 'bg-teal-500';
    if (rating >= 5) return 'bg-orange-500';
    return 'bg-red-500';
}

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function StarRating({ rating, size = 11 }: { rating: number; size?: number }) {
    const pct = Math.min(100, Math.max(0, (rating / 10) * 100));
    return (
        <div className="relative inline-flex gap-px">
            {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="text-slate-200 dark:text-slate-700 shrink-0">
                    <path d={STAR_PATH} fill="currentColor" />
                </svg>
            ))}
            <div className="absolute inset-0 overflow-hidden flex gap-px" style={{ width: `${pct}%` }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="text-blue-500 shrink-0">
                        <path d={STAR_PATH} fill="currentColor" />
                    </svg>
                ))}
            </div>
        </div>
    );
}

const MapPropertyCard = React.memo(function MapPropertyCard({
    property,
    isSelected,
    isHovered,
    onSelect,
    onHover,
    onViewDetails,
    index,
}: MapPropertyCardProps) {
    const tRatings = useTranslations('hotels.ratings');
    const tCard = useTranslations('hotels.card');
    const targetCurrency = useUserCurrency();
    const { checkIn, checkOut } = useDates();
    const sourceCurrency = property.currency || 'USD';
    const nights = React.useMemo(() => {
        if (!checkIn || !checkOut) return 1;
        return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
    }, [checkIn, checkOut]);
    const displayPrice = React.useMemo(
        () => convertCurrency(property.price, sourceCurrency, targetCurrency) / nights,
        [property.price, sourceCurrency, targetCurrency, nights]
    );
    const displayOriginalPrice = React.useMemo(
        () => property.originalPrice
            ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency) / nights
            : undefined,
        [property.originalPrice, sourceCurrency, targetCurrency, nights]
    );
    const rating = property.rating ?? 0;
    const starRating = property.starRating ?? 0;
    const ratingLabel = React.useMemo(() => getRatingLabel(rating, tRatings), [rating, tRatings]);

    return (
        <div
            role="button"
            tabIndex={0}
            data-property-id={property.id}
            onClick={(property as any).priceLoading ? undefined : () => onSelect(property.id)}
            onKeyDown={(property as any).priceLoading ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(property.id); } }}
            onMouseEnter={() => onHover(property.id)}
            onMouseLeave={() => onHover(null)}
            className={cn(
                'w-full text-left transition-all duration-200 overflow-hidden rounded-xl',
                (property as any).priceLoading ? 'cursor-wait opacity-75' : 'cursor-pointer',
                // Mobile: card style with padding
                'p-2.5',
                // md+: flush row style
                'md:px-4 md:py-2.5 lg:px-6 lg:py-3',
                'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                isSelected && 'bg-blue-50 dark:bg-blue-950/40 md:border-l-[3px] md:border-l-blue-500',
                isHovered && !isSelected && 'bg-slate-50 dark:bg-slate-800/40'
            )}
        >
            {/* ── MOBILE layout: Agoda-style card (image left, details right) ── */}
            <div className="flex flex-row gap-2 md:hidden">
                {/* Image with index badge overlay */}
                <div className="relative w-19 h-19 shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {property.image ? (
                        <Image
                            src={property.image}
                            alt={property.name}
                            fill
                            className="object-cover"
                            sizes="100px"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-blue-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
                            <Building2 className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                        </div>
                    )}
                    {index !== undefined && (
                        <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow z-10">
                            <span className={cn('text-white font-bold leading-none', index > 99 ? 'text-[6px]' : index > 9 ? 'text-[8px]' : 'text-[9px]')}>{index}</span>
                        </span>
                    )}
                    {property.refundableTag === 'RFN' && (
                        <span className="absolute bottom-1 left-1 text-[7px] font-semibold bg-emerald-500 text-white px-1 py-px rounded-full shadow z-10">
                            {tCard('freeCancelShort')}
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="min-w-0">
                        <h3 className="text-[11.5px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2">
                            {property.name}
                        </h3>
                        {property.location && (
                            <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5 truncate flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                {property.location}
                            </p>
                        )}
                    </div>

                    {/* Rating badge */}
                    {rating > 0 ? (
                        <div className="flex items-center gap-1 mt-1">
                            <span className={cn('text-[9px] font-bold text-white px-1.5 py-0.5 rounded-md', getRatingBadgeClass(rating))}>
                                {rating.toFixed(1)} {ratingLabel}
                            </span>
                            <StarRating rating={rating} size={9} />
                        </div>
                    ) : starRating > 0 ? (
                        <div className="mt-1">
                            <StarRating rating={starRating * 2} size={9} />
                        </div>
                    ) : null}

                    {/* Price + View Deal */}
                    <div className="flex items-center justify-between mt-1 gap-1">
                        <div className="flex items-baseline gap-0.5 min-w-0">
                            {(property as any).priceLoading ? (
                                <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                                    <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                                    </svg>
                                    <span className="text-[9px] font-medium">Fetching…</span>
                                </div>
                            ) : (
                                <>
                                    <span className="text-[8px] text-slate-400 shrink-0">{tCard('from')}</span>
                                    <span className="text-[13px] font-bold text-blue-600 dark:text-blue-400 truncate">
                                        {formatCurrency(displayPrice, targetCurrency)}
                                    </span>
                                    <span className="text-[8px] text-slate-400 shrink-0">{tCard('perNight')}</span>
                                </>
                            )}
                        </div>
                        {onViewDetails && !((property as any).priceLoading) && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onViewDetails(property.id); }}
                                className="shrink-0 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[9px] font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap"
                            >
                                {tCard('viewDeal')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── DESKTOP layout: horizontal row (unchanged) ── */}
            <div className="hidden md:flex gap-3">
                {/* Thumbnail */}
                <div className="relative w-20 h-16 lg:w-24 lg:h-20 shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {property.image ? (
                        <Image
                            src={property.image}
                            alt={property.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 1024px) 80px, 96px"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-blue-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
                            <Building2 className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                        </div>
                    )}
                    {property.refundableTag === 'RFN' && (
                        <span className="absolute top-1 left-1 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded z-10">
                            {tCard('freeCancellation')}
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                        <div className="flex items-start gap-1.5">
                            {index !== undefined && (
                                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                                    <span className={cn('text-white font-bold leading-none', index > 99 ? 'text-[7px]' : index > 9 ? 'text-[9px]' : 'text-[10px]')}>{index}</span>
                                </span>
                            )}
                            <div className="min-w-0">
                                <h3 className="text-[clamp(0.6875rem,1.5vw,0.875rem)] font-semibold text-slate-900 dark:text-white line-clamp-2 leading-tight">
                                    {property.name}
                                </h3>
                                {property.location && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5 truncate flex items-center gap-0.5">
                                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                                        {property.location}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-1.5">
                        {/* Rating */}
                        <div className="flex items-center gap-1.5">
                            {rating > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                    <StarRating rating={rating} size={12} />
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 leading-none">
                                            {rating.toFixed(1)} · {ratingLabel}
                                        </span>
                                    </div>
                                    {property.reviews > 0 && (
                                        <span className="text-[10px] text-slate-400 leading-none landscape-compact:hidden">
                                            {tCard('reviews', { count: property.reviews.toLocaleString() })}
                                        </span>
                                    )}
                                </div>
                            ) : starRating > 0 ? (
                                <StarRating rating={starRating * 2} size={12} />
                            ) : null}
                        </div>

                        {/* Price */}
                        <div className="text-right shrink-0">
                            {(property as any).priceLoading ? (
                                <div className="flex flex-col items-end gap-1">
                                    <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                    <div className="h-3 w-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                </div>
                            ) : (
                                <>
                                    {displayOriginalPrice && displayOriginalPrice > displayPrice && (
                                        <span className="text-[10px] text-slate-400 line-through block leading-none">
                                            {formatCurrency(displayOriginalPrice, targetCurrency)}
                                        </span>
                                    )}
                                    <span className="text-[10px] text-slate-400">{tCard('from')}</span>
                                    <span className="text-[clamp(0.6875rem,1.5vw,0.875rem)] font-bold text-blue-600 dark:text-blue-400">
                                        {formatCurrency(displayPrice, targetCurrency)}
                                    </span>
                                    <span className="text-[10px] text-slate-400 ml-0.5">{tCard('perNight')}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export { MapPropertyCard };
export type { MapPropertyCardProps };
