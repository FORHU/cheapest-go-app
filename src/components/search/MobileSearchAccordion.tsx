"use client";

import React, { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchStore, useDestination, useDestinationQuery, useDates, useTravelers } from '@/stores/searchStore';
import { DestinationPicker } from '@/components/landing/hero/search/DestinationPicker';
import { DatePicker } from '@/components/landing/hero/search/DatePicker';
import { TravelersPicker } from '@/components/landing/hero/search/TravelersPicker';
import { useSearchModule } from '@/hooks';

type AccordionSection = 'where' | 'when' | 'who';

interface MobileSearchAccordionProps {
    onClose?: () => void;
    onSearch?: () => void;
}

export const MobileSearchAccordion: React.FC<MobileSearchAccordionProps> = ({ onClose, onSearch }) => {
    const [activeSection, setActiveSection] = useState<AccordionSection>('where');

    // Search Store hooks
    const { setActiveDropdown, setDestination, setDestinationQuery, setDates, setTravelers } = useSearchStore();
    const destination = useDestination();
    const query = useDestinationQuery();
    const { checkIn, checkOut } = useDates();
    const { adults, children } = useTravelers();

    // Extracted search logic
    const { handleSearch, isSearching } = useSearchModule();

    // Close modal when navigation completes (isSearching flips true → false).
    // Handles the re-search case from the results page; home-page navigations just unmount.
    const onSearchRef = useRef(onSearch);
    onSearchRef.current = onSearch;
    const wasSearchingRef = useRef(false);
    useEffect(() => {
        const was = wasSearchingRef.current;
        wasSearchingRef.current = isSearching;
        if (was && !isSearching) onSearchRef.current?.();
    }, [isSearching]);

    useEffect(() => {
        if (activeSection === 'where') setActiveDropdown('destination');
        if (activeSection === 'when') setActiveDropdown('dates');
        if (activeSection === 'who') setActiveDropdown('travelers');
    }, [activeSection, setActiveDropdown]);

    // Formatting helpers
    const destinationText = destination?.title || query || 'I\'m flexible';

    const formatDateRange = () => {
        if (!checkIn && !checkOut) return 'Add dates';
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        const checkInStr = checkIn ? new Date(checkIn).toLocaleDateString('en-US', options) : 'Start';
        const checkOutStr = checkOut ? new Date(checkOut).toLocaleDateString('en-US', options) : 'End';
        return `${checkInStr} - ${checkOutStr}`;
    };

    const formatTravelers = () => {
        const total = adults + children;
        if (total === 0) return 'Add guests';
        if (total === 1) return '1 guest';
        return `${total} guests`;
    };

    const handleClearAll = () => {
        setDestination(null);
        setDestinationQuery('');
        setDates({ checkIn: null, checkOut: null, flexibility: 'exact' });
        setTravelers({ adults: 2, children: 0, rooms: 1 });
    };

    return (
        <div className="flex flex-col h-full relative">
            {/* ─── Loading overlay ─── */}
            {isSearching && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl gap-4">
                    <div className="relative w-14 h-14 shrink-0">
                        <div className="absolute inset-0 border-4 border-blue-100 dark:border-blue-900/30 rounded-full" />
                        <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="text-center">
                        <p className="text-base font-bold text-slate-900 dark:text-white">Finding hotels…</p>
                        {(destination?.title || query) && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                {destination?.title || query}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Close Button Row ─── */}
            <div className="flex justify-end px-4 pt-2 pb-1 shrink-0">
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <X size={16} className="text-slate-700 dark:text-slate-300" />
                    </button>
                )}
            </div>

            {/* ─── Accordion Content ─── */}
            <div className="flex-1 flex flex-col px-3 pb-2 gap-1.5 min-h-0 overflow-y-auto">

                {/* ──────── WHERE ──────── */}
                <div
                    className={`bg-white dark:bg-slate-900 rounded-xl transition-all duration-300 border ${activeSection === 'where'
                        ? 'shadow-md border-slate-200 dark:border-slate-700 shrink-0 flex flex-col'
                        : 'shadow-sm border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md shrink-0'
                        }`}
                    onClick={() => activeSection !== 'where' && setActiveSection('where')}
                >
                    {activeSection === 'where' ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex flex-col h-full p-3 min-h-0"
                        >
                            <h2 className="text-[12px] font-bold text-slate-900 dark:text-white mb-2 shrink-0">
                                Where?
                            </h2>
                            <div className="relative overflow-hidden">
                                <DestinationPicker
                                    hideIcon
                                    forceOpen
                                    onSelect={() => setActiveSection('when')}
                                />
                            </div>
                        </motion.div>
                    ) : (
                        <div className="flex items-center justify-between px-3 py-2.5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Where</span>
                            <span className="text-[11px] font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                                {destinationText}
                            </span>
                        </div>
                    )}
                </div>

                {/* ──────── WHEN ──────── */}
                <div
                    className={`bg-white dark:bg-slate-900 rounded-xl transition-all duration-300 border ${activeSection === 'when'
                        ? 'shadow-md border-slate-200 dark:border-slate-700 shrink-0 flex flex-col'
                        : 'shadow-sm border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md shrink-0'
                        }`}
                    onClick={() => activeSection !== 'when' && setActiveSection('when')}
                >
                    {activeSection === 'when' ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex flex-col h-full p-3 min-h-0"
                        >
                            <h2 className="text-[12px] font-bold text-slate-900 dark:text-white mb-2 shrink-0">
                                When&apos;s your trip?
                            </h2>
                            <div className="relative overflow-hidden">
                                <DatePicker inline forceOpen />
                            </div>
                        </motion.div>
                    ) : (
                        <div className="flex items-center justify-between px-3 py-2.5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">When</span>
                            <span className="text-[11px] font-semibold text-slate-900 dark:text-white">
                                {formatDateRange()}
                            </span>
                        </div>
                    )}
                </div>

                {/* ──────── WHO ──────── */}
                <div
                    className={`bg-white dark:bg-slate-900 rounded-xl transition-all duration-300 border ${activeSection === 'who'
                        ? 'shadow-md border-slate-200 dark:border-slate-700 shrink-0 flex flex-col'
                        : 'shadow-sm border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md shrink-0'
                        }`}
                    onClick={() => activeSection !== 'who' && setActiveSection('who')}
                >
                    {activeSection === 'who' ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex flex-col h-full p-3 min-h-0"
                        >
                            <h2 className="text-[12px] font-bold text-slate-900 dark:text-white mb-2 shrink-0">
                                Who&apos;s coming?
                            </h2>
                            <div className="relative overflow-hidden">
                                <TravelersPicker inline forceOpen />
                            </div>
                        </motion.div>
                    ) : (
                        <div className="flex items-center justify-between px-3 py-2.5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Who</span>
                            <span className="text-[11px] font-semibold text-slate-900 dark:text-white">
                                {formatTravelers()}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Bottom Action Bar ─── */}
            <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 flex items-center justify-between">
                <button
                    onClick={handleClearAll}
                    className="text-slate-900 dark:text-white font-semibold underline underline-offset-4 decoration-slate-300 dark:decoration-slate-600 hover:decoration-slate-900 dark:hover:decoration-white transition-all text-xs"
                >
                    Clear all
                </button>
                <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-[11px] transition-all flex items-center gap-2 min-w-[100px] justify-center shadow-md"
                >
                    {isSearching ? (
                        <div className="relative w-5 h-5 shrink-0">
                            <div className="absolute inset-0 border-2 border-white/20 rounded-full" />
                            <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            <Search size={16} />
                            Search
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
