"use client";

import React, { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchStore, useDestination, useDestinationQuery, useDates, useTravelers } from '@/stores/searchStore';
import { DestinationPicker } from '@/components/landing/hero/search/DestinationPicker';
import { DatePicker } from '@/components/landing/hero/search/DatePicker';
import { TravelersPicker } from '@/components/landing/hero/search/TravelersPicker';
import { useSearchModule } from '@/hooks';

type AccordionSection = 'where' | 'when' | 'who' | null;

interface MobileSearchAccordionProps {
    onClose?: () => void;
    onSearch?: () => void;
}

export const MobileSearchAccordion: React.FC<MobileSearchAccordionProps> = ({ onClose, onSearch }) => {
    const [activeSection, setActiveSection] = useState<AccordionSection>(null);

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
        else if (activeSection === 'when') setActiveDropdown('dates');
        else if (activeSection === 'who') setActiveDropdown('travelers');
        else setActiveDropdown(null);
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

    const hasValue = !!(destination || query || checkIn || checkOut || adults !== 2 || children !== 0);

    return (
        <div className="flex flex-col h-full relative bg-slate-50 dark:bg-slate-950">
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

            {/* ─── Unified Header Row ─── */}
            <div className="flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
                <h2 className="text-lg font-medium text-slate-900 dark:text-white">Search Hotels</h2>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <X size={16} className="text-slate-700 dark:text-slate-300" />
                    </button>
                )}
            </div>

            {/* ─── Accordion Content ─── */}
            <div className="flex-1 flex flex-col px-3 pb-32 gap-2 min-h-0 overflow-y-auto">
                <div className="flex justify-end px-1 pt-1 min-h-[32px]">
                    <AnimatePresence>
                        {hasValue && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={handleClearAll}
                                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Clear all
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* ──────── WHERE ──────── */}
                <motion.div
                    className={`bg-white dark:bg-slate-900 rounded-2xl transition-all duration-300 border ${activeSection === 'where'
                        ? 'shadow-md border-slate-200 dark:border-slate-700 shrink-0 flex flex-col'
                        : 'shadow-sm border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md shrink-0'
                        }`}
                    onClick={() => setActiveSection(activeSection === 'where' ? null : 'where')}
                >
                    {activeSection === 'where' ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: 20 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex flex-col h-full p-3 min-h-0"
                        >
                            <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-2 shrink-0 text-left">
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
                        <div className="flex flex-col items-start px-4 py-3 min-h-[64px] justify-center">
                            <span className="text-ui-label flex items-center gap-2">
                                Where
                                <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Search city or hotel</span>
                            </span>
                            <span className="text-ui-value truncate w-full mt-0.5">
                                {destinationText}
                            </span>
                        </div>
                    )}
                </motion.div>

                {/* ──────── WHEN ──────── */}
                <motion.div
                    className={`bg-white dark:bg-slate-900 rounded-2xl transition-all duration-300 border ${activeSection === 'when'
                        ? 'shadow-md border-slate-200 dark:border-slate-700 shrink-0 flex flex-col'
                        : 'shadow-sm border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md shrink-0'
                        }`}
                    onClick={() => setActiveSection(activeSection === 'when' ? null : 'when')}
                >
                    {activeSection === 'when' ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: 20 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex flex-col h-full p-3 min-h-0"
                        >
                            <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-2 shrink-0 text-left">
                                When&apos;s your trip?
                            </h2>
                            <div className="relative overflow-hidden">
                                <DatePicker inline forceOpen />
                            </div>
                        </motion.div>
                    ) : (
                        <div className="flex flex-col items-start px-4 py-3 min-h-[64px] justify-center">
                            <span className="text-ui-label flex items-center gap-2">
                                When
                                <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Check-in / Check-out</span>
                            </span>
                            <span className="text-ui-value truncate w-full mt-0.5">
                                {formatDateRange()}
                            </span>
                        </div>
                    )}
                </motion.div>

                {/* ──────── WHO ──────── */}
                <motion.div
                    className={`bg-white dark:bg-slate-900 rounded-2xl transition-all duration-300 border ${activeSection === 'who'
                        ? 'shadow-md border-slate-200 dark:border-slate-700 shrink-0 flex flex-col'
                        : 'shadow-sm border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md shrink-0'
                        }`}
                    onClick={() => setActiveSection(activeSection === 'who' ? null : 'who')}
                >
                    {activeSection === 'who' ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: 20 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex flex-col h-full p-3 min-h-0"
                        >
                            <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-2 shrink-0 text-left">
                                Who&apos;s coming?
                            </h2>
                            <div className="relative overflow-hidden">
                                <TravelersPicker inline forceOpen />
                            </div>
                        </motion.div>
                    ) : (
                        <div className="flex flex-col items-start px-4 py-3 min-h-[64px] justify-center">
                            <span className="text-ui-label flex items-center gap-2">
                                Who
                                <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Number of guests</span>
                            </span>
                            <span className="text-ui-value truncate w-full mt-0.5">
                                {formatTravelers()}
                            </span>
                        </div>
                    )}
                </motion.div>

            </div>

            {/* ─── Sticky Search Button ─── */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pointer-events-none z-50">
                <div className="pointer-events-auto max-w-[320px] mx-auto">
                    <button
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 rounded-xl font-normal text-sm transition-all flex items-center gap-2 justify-center shadow-lg shadow-blue-500/25"
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
        </div>
    );
};
