"use client";

import React, { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, ArrowLeft, Edit3, Globe, Sparkles, Calendar } from 'lucide-react';
import { useSearchActions, useSearchStore } from '@/stores/searchStore';
import type { FlightOffer } from '@/types/flights';
import PriceCalendar from './PriceCalendar';

interface ResponsiveFlightHeaderProps {
    origin: string;
    destination: string;
    dateStr: string;
    passengersStr: string;
    activeFilterCount: number;
    offers?: FlightOffer[];
    isLoading?: boolean;
}

function getProviderCounts(offers: FlightOffer[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const o of offers) {
        counts[o.provider] = (counts[o.provider] || 0) + 1;
    }
    return counts;
}

export const ResponsiveFlightHeader = ({
    origin,
    destination,
    dateStr,
    passengersStr,
    activeFilterCount,
    offers = [],
    isLoading = false
}: ResponsiveFlightHeaderProps) => {
    const router = useRouter();
    const { setIsMobileFiltersOpen } = useSearchActions();

    const providerCounts = useMemo(() => getProviderCounts(offers), [offers]);
    const entries = Object.entries(providerCounts);

    return (
        <div className="lg:hidden sticky top-0 z-40 pt-1.5 pb-1 px-1 pointer-events-none [&>*]:pointer-events-auto bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
            <div className="flex flex-col gap-1.5 w-full mx-auto">
                <div className="flex items-center gap-1.5">
                    <div
                        className="flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-2.5 shadow-sm transition-all gap-2.5 text-left group"
                    >
                        <button 
                            onClick={() => router.push('/?mode=flights')}
                            className="flex-1 flex items-center gap-2.5 text-left min-w-0 active:scale-[0.98] transition-transform"
                        >
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-600/10">
                                <Search size={12} className="text-white font-bold" />
                            </div>
                            <div className="flex flex-col items-start flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 w-full">
                                    <span className="text-[11px] font-black text-slate-900 dark:text-white truncate">
                                        {origin} → {destination}
                                    </span>
                                    <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                    <span className="text-[10px] font-bold text-slate-500 truncate uppercase tracking-tighter">
                                        {dateStr}
                                    </span>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 truncate w-full uppercase tracking-tight">
                                    {passengersStr}
                                </span>
                            </div>
                        </button>
                        
                        <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-slate-100 dark:border-slate-800">
                             <PriceCalendar 
                                origin={origin}
                                destination={destination}
                                adults={1}
                                cabin="economy"
                                initialDate={dateStr.split(' ')[0]} // Basic date extraction
                                variant="trigger"
                            />
                            
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMobileFiltersOpen(true);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 relative active:scale-95 transition-all"
                            >
                                <SlidersHorizontal size={14} />
                                {activeFilterCount > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[8px] font-black text-white border border-white dark:border-slate-900 shadow-sm">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Integrated Source Badge / Status - Smaller & Single Line */}
                {entries.length > 0 && !isLoading && (
                    <div className="flex items-center justify-between gap-2 px-1.5">
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50">
                                <Globe size={9} className="text-blue-500" />
                                <div className="flex items-center gap-1">
                                    {entries.map(([provider, count]) => (
                                        <span key={provider} className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">
                                            {provider}({count})
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                <Sparkles size={9} className="text-emerald-500" />
                                <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">
                                    {offers.length} Deals
                                </span>
                            </div>
                        </div>
                        
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-70">
                             {offers.length} results
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
