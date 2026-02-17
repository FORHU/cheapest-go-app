'use client';

import React from 'react';
import { Star, MapPin } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
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

const MapPropertyCard = React.memo(function MapPropertyCard({
    property,
    isSelected,
    isHovered,
    onSelect,
    onHover,
}: MapPropertyCardProps) {
    return (
        <button
            type="button"
            data-property-id={property.id}
            onClick={() => onSelect(property.id)}
            onMouseEnter={() => onHover(property.id)}
            onMouseLeave={() => onHover(null)}
            className={cn(
                'w-full text-left px-6 py-3 transition-all duration-200 cursor-pointer border-b border-slate-100 dark:border-slate-800',
                'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                isSelected &&
                'bg-blue-50 dark:bg-blue-950/40 border-l-[3px] border-l-blue-500',
                isHovered &&
                !isSelected &&
                'bg-slate-50 dark:bg-slate-800/40'
            )}
        >
            <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="relative w-24 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                    <img
                        src={property.image}
                        alt={property.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                    {property.refundableTag === 'RFN' && (
                        <span className="absolute top-1 left-1 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                            Free cancellation
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate leading-tight">
                            {property.name}
                        </h3>
                        <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {property.location}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-1.5">
                        {/* Rating */}
                        <div className="flex items-center gap-1.5">
                            <span
                                className={cn(
                                    'text-[11px] font-bold text-white px-1.5 py-0.5 rounded',
                                    getRatingColor(property.rating)
                                )}
                            >
                                {property.rating.toFixed(1)}
                            </span>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 leading-none">
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
                            {property.originalPrice && property.originalPrice > property.price && (
                                <span className="text-[10px] text-slate-400 line-through block leading-none">
                                    {formatCurrency(property.originalPrice)}
                                </span>
                            )}
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                {formatCurrency(property.price)}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-0.5">
                                /night
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </button>
    );
});

export { MapPropertyCard };
export type { MapPropertyCardProps };
