"use client";

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, ArrowLeft, X } from 'lucide-react';
import { useSearchActions, useSearchStore } from '@/stores/searchStore';
import { MobileSearchModal } from '@/components/search/MobileSearchModal';
import { FlightSearchForm } from '@/components/landing/hero/search/FlightSearchForm';
import { TripTypeSelector } from '@/components/landing/hero/search/TripTypeSelector';
import { MagneticButton } from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlightSearch } from '@/hooks/search/useFlightSearch';

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
    activeFilterCount,
    statusElement,
    resultCount
}: ResponsiveFlightHeaderProps & { statusElement?: React.ReactNode; resultCount?: number }) => {
    const router = useRouter();
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const { setIsMobileFiltersOpen } = useSearchActions();
    const { flightState, handleFlightSearch, isSearching } = useFlightSearch();
    const hasFlightValue = flightState.flights.some(f => f.origin || f.destination || f.date);

    // Build clean route labels: avoid "Clark (CRK) (CRK)" duplication
    const originTitle = flightState.flights[0]?.origin?.title;
    const originCode = flightState.flights[0]?.origin?.code || origin;
    const destTitle = flightState.flights[0]?.destination?.title;
    const destCode = flightState.flights[0]?.destination?.code || destination;

    const originLabel = originTitle
        ? (originTitle.includes(originCode) ? originTitle : `${originTitle} (${originCode})`)
        : originCode;
    const destLabel = destTitle
        ? (destTitle.includes(destCode) ? destTitle : `${destTitle} (${destCode})`)
        : destCode;

    return (
        <>
            <div className="lg:hidden sticky top-[14px] z-40 w-full py-1">
                <div className="flex flex-col gap-2 w-full bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 p-4 shadow-lg ring-1 ring-black/5">
                    <div className="flex items-center justify-between w-full">
                        <button
                            onClick={() => setIsSearchModalOpen(true)}
                            className="flex-1 flex flex-col items-start justify-center min-w-0 pr-3"
                        >
                            <span className="text-[13px] font-normal text-blue-600 dark:text-blue-400 truncate w-full text-left">
                                {originLabel} → {destLabel}
                            </span>
                            <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate w-full text-left">
                                {dateStr} • {passengersStr}
                            </span>
                        </button>

                        <button
                            onClick={() => setIsMobileFiltersOpen(true)}
                            className="p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors shrink-0 relative"
                        >
                            <SlidersHorizontal size={18} className="text-slate-600 dark:text-slate-400" />
                            {activeFilterCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white border-2 border-white dark:border-slate-900">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>

                    {(statusElement || resultCount != null) && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">{statusElement}</div>
                            {resultCount != null && (
                                <span className="text-[11px] font-normal text-slate-400 shrink-0">
                                    {resultCount} {resultCount === 1 ? 'result' : 'results'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <MobileSearchModal 
                isOpen={isSearchModalOpen} 
                onClose={() => setIsSearchModalOpen(false)} 
                onSearch={() => setIsSearchModalOpen(false)}
            >
                <div className="flex flex-col h-full relative bg-slate-50 dark:bg-slate-950">
                    {/* Loading overlay */}
                    {isSearching && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl gap-4">
                            <div className="relative w-14 h-14 shrink-0">
                                <div className="absolute inset-0 border-4 border-blue-100 dark:border-blue-900/30 rounded-full" />
                                <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                            <div className="text-center px-4">
                                <p className="text-base font-bold text-slate-900 dark:text-white">Finding flights…</p>
                                {(flightState.flights[0]?.origin?.title && flightState.flights[0]?.destination?.title) && (
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                        {flightState.flights[0].origin.title} to {flightState.flights[0].destination.title}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center px-6 pt-5 pb-4 shrink-0">
                        <h2 className="text-lg font-medium text-slate-900 dark:text-white">Search Flights</h2>
                        <button
                            onClick={() => setIsSearchModalOpen(false)}
                            className="p-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
                        >
                            <X size={16} className="text-slate-700 dark:text-slate-300" />
                        </button>
                    </div>

                    {/* Clear All Row */}
                    <div className="flex justify-end px-6 pt-1 min-h-[32px]">
                        <AnimatePresence>
                            {hasFlightValue && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => useSearchStore.getState().reset()}
                                    className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Clear all
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 px-4 pb-32 overflow-y-auto pt-0 min-h-0">
                        <div className="max-w-[420px] w-full mx-auto py-2">
                            <div className="mb-4">
                                <TripTypeSelector />
                            </div>
                            <FlightSearchForm />
                        </div>
                    </div>

                    {/* Sticky Search Button */}
                    <div className="fixed bottom-0 left-0 right-0 p-4 pointer-events-auto">
                        <div className="max-w-[320px] mx-auto">
                            <MagneticButton
                                onClick={async () => {
                                    await handleFlightSearch();
                                    setIsSearchModalOpen(false);
                                }}
                                isLoading={isSearching}
                                className="w-full h-10 rounded-xl !bg-blue-600 hover:!bg-blue-700 !text-white font-medium text-sm shadow-lg shadow-blue-500/25"
                                label="Search"
                            />
                        </div>
                    </div>
                </div>
            </MobileSearchModal>
        </>
    );
};
