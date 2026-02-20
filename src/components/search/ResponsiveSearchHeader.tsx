"use client";

import React, { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, ArrowLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchModule } from '@/components/landing/hero/SearchModule';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { MobileSearchAccordion } from './MobileSearchAccordion';
import { useSearchFilters, useSearchActions } from '@/stores/searchStore';

export const ResponsiveSearchHeader = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const filters = useSearchFilters();
    const searchActions = useSearchActions();

    const destination = searchParams.get('destination') || 'Anywhere';
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const adults = searchParams.get('adults') || '2';

    let dateStr = 'Any week';
    if (checkIn && checkOut) {
        try {
            const start = new Date(checkIn);
            const end = new Date(checkOut);

            const formatMonthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const formatDay = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric' });

            if (start.getMonth() === end.getMonth()) {
                dateStr = `${formatMonthDay(start)} - ${formatDay(end)}`;
            } else {
                dateStr = `${formatMonthDay(start)} - ${formatMonthDay(end)}`;
            }
        } catch (e) {
            // ignore
        }
    }

    const guestsStr = `${adults} guest${parseInt(adults) > 1 ? 's' : ''}`;

    const activeFilterCount = (filters.hotelName ? 1 : 0) +
        filters.starRating.length +
        (filters.minRating > 0 ? 1 : 0) +
        (filters.minReviewsCount > 0 ? 1 : 0) +
        filters.facilities.length;

    return (
        <>
            {/* Desktop View */}
            <div className="hidden lg:block mb-8 relative z-50">
                <div className="origin-top transform scale-90 sm:scale-100">
                    <SearchModule />
                </div>
            </div>

            {/* Mobile View - Floating Pill */}
            <div className="lg:hidden sticky top-0 z-40 pt-4 pb-4 px-4 pointer-events-none [&>*]:pointer-events-auto">
                <div className="flex items-center gap-2 max-w-[500px] mx-auto">
                    <button
                        onClick={() => router.push('/')}
                        className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-full shadow-sm"
                    >
                        <ArrowLeft size={18} className="text-slate-700 dark:text-slate-300" />
                    </button>

                    <button
                        onClick={() => setIsSearchModalOpen(true)}
                        className="flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full py-2 px-4 shadow-sm hover:shadow-md transition-shadow gap-3 text-left"
                    >
                        <Search size={18} className="text-slate-800 font-bold dark:text-slate-200" />
                        <div className="flex flex-col items-start flex-1 min-w-0">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate w-full">
                                {destination === 'Anywhere' ? 'Where to?' : destination}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate w-full">
                                {dateStr} • {guestsStr}
                            </span>
                        </div>
                    </button>

                    <button
                        onClick={() => searchActions.setIsMobileFiltersOpen(true)}
                        className="p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-full shadow-sm ml-1 relative"
                    >
                        <SlidersHorizontal size={18} className="text-slate-700 dark:text-slate-300" />
                        {activeFilterCount > 0 && (
                            <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white border border-white dark:border-slate-900">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Search Dropdown Popover */}
            <AnimatePresence>
                {isSearchModalOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm lg:hidden pointer-events-auto"
                            onClick={() => setIsSearchModalOpen(false)}
                        />

                        {/* Dropdown Content */}
                        <motion.div
                            initial={{ opacity: 0, y: "100%", scale: 1 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 sm:top-[88px] sm:bottom-auto sm:left-auto sm:w-[340px] sm:max-h-[calc(100vh-120px)] max-h-[85vh] z-[100] bg-alabaster dark:bg-obsidian bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px] flex flex-col lg:hidden shadow-2xl rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200/50 dark:border-slate-800/50 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Background Sparkles */}
                            <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
                                <GlobalSparkle />
                            </div>

                            {/* Header */}
                            <div className="p-4 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 flex-shrink-0">
                                <button onClick={() => setIsSearchModalOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors -ml-2">
                                    <X size={20} className="text-slate-700 dark:text-slate-300" />
                                </button>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white absolute left-1/2 -translate-x-1/2">Edit Search</span>
                                <div className="w-9" /> {/* Spacer */}
                            </div>

                            <div className="w-full h-full max-h-[85vh] relative z-10">
                                <div className="h-full">
                                    <MobileSearchAccordion />
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
