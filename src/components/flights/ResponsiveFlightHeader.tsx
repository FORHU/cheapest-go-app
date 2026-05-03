"use client";

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { useSearchActions, useSearchStore } from '@/stores/searchStore';

interface ResponsiveFlightHeaderProps {
    origin: string;
    destination: string;
    dateStr: string;
    passengersStr: string;
    activeFilterCount: number;
}

export const ResponsiveFlightHeader = ({
    origin,
    destination,
    dateStr,
    passengersStr,
    activeFilterCount
}: ResponsiveFlightHeaderProps) => {
    const router = useRouter();
    const { setIsMobileFiltersOpen } = useSearchActions();

    return (
        <div className="lg:hidden sticky top-0 z-40 pt-1.5 pb-1.5 px-2 pointer-events-none [&>*]:pointer-events-auto">
            <div className="flex items-center gap-1 w-full mx-auto">
                <button
                    onClick={() => router.push('/')}
                    className="p-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-full shadow-sm"
                >
                    <ArrowLeft size={14} className="text-slate-700 dark:text-slate-300" />
                </button>

                <button
                    onClick={() => {
                        // In a real app, this might open a flight search modal
                        // For now, let's just go back to home search
                        router.push('/?mode=flights');
                    }}
                    className="flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full py-0.5 px-3 shadow-sm hover:shadow-md transition-shadow gap-1 text-left"
                >
                    <Search size={13} className="text-slate-800 font-bold dark:text-slate-200" />
                    <div className="flex flex-col items-start flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-900 dark:text-white truncate w-full">
                            {origin} → {destination}
                        </span>
                        <span className="text-[8px] text-slate-500 dark:text-slate-400 truncate w-full">
                            {dateStr} • {passengersStr}
                        </span>
                    </div>
                </button>

                <button
                    onClick={() => setIsMobileFiltersOpen(true)}
                    className="p-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-full shadow-sm ml-0.5 relative"
                >
                    <SlidersHorizontal size={14} className="text-slate-700 dark:text-slate-300" />
                    {activeFilterCount > 0 && (
                        <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white border border-white dark:border-slate-900">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
};
