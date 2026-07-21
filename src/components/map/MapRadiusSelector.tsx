'use client';

import React from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISTANCE_OPTIONS = [
    { label: '1 km', value: 1000 },
    { label: '2 km', value: 2000 },
    { label: '5 km', value: 5000 },
    { label: '10 km', value: 10000 },
] as const;

interface MapRadiusSelectorProps {
    /** Currently selected radius, or `null` when the user hasn't chosen one yet. */
    radiusMeters: number | null;
    onRadiusChange: (meters: number) => void;
}

/**
 * Compact radius picker for the recommended-places search area.
 *
 * This is the distance control that used to live inside MapGemsPanel, pulled out
 * on its own so the destination map can adjust the radius without bringing back
 * the POI photo cards.
 */
export function MapRadiusSelector({ radiusMeters, onRadiusChange }: MapRadiusSelectorProps) {
    return (
        <div className="flex items-center gap-0.5 h-8 pl-2.5 pr-2 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-lg">
            <MapPin size={11} className="text-blue-500 shrink-0" />
            {/* Prompt shown until a radius is picked — nothing is plotted before then */}
            {radiusMeters === null && (
                <span className="mx-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Places within
                </span>
            )}
            {DISTANCE_OPTIONS.map(({ label, value }) => (
                <button
                    key={value}
                    onClick={() => onRadiusChange(value)}
                    className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer whitespace-nowrap',
                        radiusMeters === value
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 dark:text-slate-400 hover:text-blue-500'
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
