'use client';

import React from 'react';
import { MapPin } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import type { MappableProperty } from './types';

interface MapPropertyCardProps {
    property: MappableProperty;
    isSelected: boolean;
    isHovered: boolean;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
}

function getRatingLabel(rating: number): string {
    if (rating >= 9) return 'Exceptional';
    if (rating >= 8) return 'Excellent';
    if (rating >= 7) return 'Very Good';
    if (rating >= 6) return 'Good';
    return 'Pleasant';
}

function getRatingColor(rating: number): string {
    if (rating >= 9) return 'bg-emerald-600';
    if (rating >= 8) return 'bg-blue-600';
    if (rating >= 7) return 'bg-blue-500';
    return 'bg-slate-500';
}

import Image from 'next/image';

const MapPropertyCard = React.memo(function MapPropertyCard({
    property,
    isSelected,
    isHovered,
    onSelect,
    onHover,
}: MapPropertyCardProps) {
    const targetCurrency = useUserCurrency();
    const sourceCurrency = property.currency || 'USD';
    const displayPrice = convertCurrency(property.price, sourceCurrency, targetCurrency);
    const displayOriginalPrice = property.originalPrice
        ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency)
        : undefined;

    return (
        <button
            type="button"
            data-property-id={property.id}
            onClick={() => onSelect(property.id)}
            onMouseEnter={() => onHover(property.id)}
            onMouseLeave={() => onHover(null)}
            className={cn(
                'w-full text-left transition-all duration-200 cursor-pointer overflow-hidden',
                // Mobile: card style with border and spacing
                'p-3 border-b border-slate-100 dark:border-slate-800',
                // md+: flush row style
                'md:px-4 md:py-2.5 lg:px-6 lg:py-3',
                'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                isSelected && 'bg-blue-50 dark:bg-blue-950/40 md:border-l-[3px] md:border-l-blue-500',
                isHovered && !isSelected && 'bg-slate-50 dark:bg-slate-800/40'
            )}
        >
            {/* ── MOBILE layout: compact horizontal card (image left, details right) ── */}
            <div className="flex flex-row gap-2.5 md:hidden landscape:gap-1.5 landscape:p-1.5">
                {/* Image */}
                <div className="relative w-[100px] h-[80px] flex-shrink-0 rounded-lg overflow-hidden landscape:w-[80px] landscape:h-[60px]">
                    <Image
                        src={property.image}
                        alt={property.name}
                        fill
                        className="object-cover"
                        sizes="100px"
                    />
                    {property.refundableTag === 'RFN' && (
                        <span className="absolute top-1 left-1 text-[8px] font-semibold bg-emerald-500 text-white px-1.5 py-px rounded-full shadow landscape:text-[7px] landscape:px-1 landscape:py-0 z-10">
                            {typeof window !== 'undefined' && window.innerHeight < 500 ? 'Free' : 'Free cancel'}
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight line-clamp-1 landscape:text-[11px]">
                            {property.name}
                        </h3>
                        <div className="flex items-center gap-0.5 mt-0.5 landscape:mt-0">
                            <MapPin className="w-2.5 h-2.5 text-blue-500 flex-shrink-0 landscape:w-2 landscape:h-2" />
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate landscape:text-[8px]">
                                {property.location}
                            </span>
                        </div>
                    </div>

                    {/* Rating + Price row (Stacked on mobile to prevent overlap) */}
                    <div className="flex flex-col items-start mt-1 landscape:mt-0 w-full min-w-0 pr-1 gap-0.5">
                        <div className="flex items-center flex-shrink-0">
                            <span className={cn('text-[10px] font-bold text-white px-1 py-px rounded landscape:text-[9px] landscape:px-1 landscape:py-0', getRatingColor(property.rating))}>
                                {property.rating.toFixed(1)}
                            </span>
                        </div>

                        <div className="flex-shrink-0 w-full min-w-0 overflow-hidden">
                            <div className="flex items-baseline gap-0.5 w-full overflow-hidden">
                                <span className="text-[13px] font-bold text-blue-600 dark:text-blue-400 landscape:text-[11px] truncate block">
                                    {formatCurrency(displayPrice, targetCurrency)}
                                </span>
                                <span className="text-[9px] text-slate-400 landscape:text-[7px] flex-shrink-0">/night</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── DESKTOP layout: horizontal row (unchanged) ── */}
            <div className="hidden md:flex gap-3">
                {/* Thumbnail */}
                <div className="relative w-20 h-16 lg:w-24 lg:h-20 flex-shrink-0 rounded-xl overflow-hidden">
                    <Image
                        src={property.image}
                        alt={property.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 80px, 96px"
                    />
                    {property.refundableTag === 'RFN' && (
                        <span className="absolute top-1 left-1 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded z-10">
                            Free cancellation
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                        <h3 className="text-[clamp(0.6875rem,1.5vw,0.875rem)] font-semibold text-slate-900 dark:text-white truncate leading-tight">
                            {property.name}
                        </h3>
                        <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-[clamp(0.625rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400 truncate">
                                {property.location}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-1.5">
                        {/* Rating */}
                        <div className="flex items-center gap-1.5">
                            <span className={cn('text-[11px] font-bold text-white px-1.5 py-0.5 rounded', getRatingColor(property.rating))}>
                                {property.rating.toFixed(1)}
                            </span>
                            <div className="flex flex-col min-w-0 landscape-compact:hidden">
                                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 leading-none truncate">
                                    {getRatingLabel(property.rating)}
                                </span>
                                {property.reviews > 0 && (
                                    <span className="text-[10px] text-slate-400 leading-tight">
                                        {property.reviews.toLocaleString()} reviews
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Price */}
                        <div className="text-right flex-shrink-0">
                            {displayOriginalPrice && displayOriginalPrice > displayPrice && (
                                <span className="text-[10px] text-slate-400 line-through block leading-none">
                                    {formatCurrency(displayOriginalPrice, targetCurrency)}
                                </span>
                            )}
                            <span className="text-[clamp(0.6875rem,1.5vw,0.875rem)] font-bold text-blue-600 dark:text-blue-400">
                                {formatCurrency(displayPrice, targetCurrency)}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-0.5">/night</span>
                        </div>
                    </div>
                </div>
            </div>
        </button>
    );
});

export { MapPropertyCard };
export type { MapPropertyCardProps };
