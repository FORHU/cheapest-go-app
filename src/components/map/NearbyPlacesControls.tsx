'use client';

import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { POI_FILTERS } from '@/config/map-discovery';
import { cn } from '@/lib/utils';

const DISTANCE_OPTIONS = [
    { label: '500m', value: 500 },
    { label: '1 km', value: 1000 },
    { label: '2 km', value: 2000 },
    { label: '5 km', value: 5000 },
] as const;

interface NearbyPlacesControlsProps {
    category: string;
    onCategoryChange: (cat: string) => void;
    radiusMeters: number;
    onRadiusChange: (radius: number) => void;
    placeCount: number;
    isLoading: boolean;
}

export function NearbyPlacesControls({
    category,
    onCategoryChange,
    radiusMeters,
    onRadiusChange,
    placeCount,
    isLoading,
}: NearbyPlacesControlsProps) {
    const t = useTranslations('hotels.searchResults');
    return (
        <div className="flex flex-col gap-1.5 animate-in slide-in-from-bottom-2 duration-200">
            {/* Category tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {POI_FILTERS.map(({ id, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => onCategoryChange(id)}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border shrink-0 cursor-pointer',
                            category === id
                                ? 'bg-blue-600 text-white border-blue-600 shadow'
                                : 'bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 backdrop-blur-sm'
                        )}
                    >
                        <Icon className="w-2.5 h-2.5" />
                        {t('discovery.' + id)}
                    </button>
                ))}
            </div>

            {/* Distance selector + count row */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full px-2 py-1 shadow">
                    <MapPin className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Within:</span>
                    {DISTANCE_OPTIONS.map(({ label, value }) => (
                        <button
                            key={value}
                            onClick={() => onRadiusChange(value)}
                            className={cn(
                                'px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer',
                                radiusMeters === value
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-blue-500'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1 shadow">
                    {isLoading ? (
                        <Loader2 className="w-2.5 h-2.5 text-blue-500 animate-spin" />
                    ) : (
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {placeCount} {placeCount === 1 ? 'place' : 'places'} nearby
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
