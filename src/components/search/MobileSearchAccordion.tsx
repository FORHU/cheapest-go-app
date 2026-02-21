"use client";

import React, { useState, useEffect } from 'react';
import { useSearchStore, useDestination, useDestinationQuery, useDates, useTravelers } from '@/stores/searchStore';
import { DestinationPicker } from '@/components/landing/hero/search/DestinationPicker';
import { DatePicker } from '@/components/landing/hero/search/DatePicker';
import { TravelersPicker } from '@/components/landing/hero/search/TravelersPicker';
import { useSearchModule } from '@/hooks';

type AccordionSection = 'where' | 'when' | 'who';

export const MobileSearchAccordion: React.FC = () => {
    // We maintain internal state for which section is expanded.
    // By default, if the user opens it, we might want to start with 'where' or 'when'.
    const [activeSection, setActiveSection] = useState<AccordionSection>('where');

    // Search Store hooks
    const { setActiveDropdown, setDestination, setDestinationQuery, setDates, setTravelers } = useSearchStore();
    const destination = useDestination();
    const query = useDestinationQuery();
    const { checkIn, checkOut } = useDates();
    const { adults, children, rooms } = useTravelers();

    // Extracted search logic
    const { handleSearch, isSearching } = useSearchModule();

    // Whenever the active section changes, we want to inform the search store what's active.
    // The underlying pickers depend on `activeDropdown` to show suggestions/calendars.
    useEffect(() => {
        if (activeSection === 'where') setActiveDropdown('destination');
        if (activeSection === 'when') setActiveDropdown('dates');
        if (activeSection === 'who') setActiveDropdown('travelers');
    }, [activeSection, setActiveDropdown]);

    // Formatting helpers
    const destinationText = destination?.title || query || 'I\'m flexible';

    const formatDateRange = () => {
        if (!checkIn && !checkOut) return 'Any week';
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        const checkInStr = checkIn ? new Date(checkIn).toLocaleDateString('en-US', options) : 'Start';
        const checkOutStr = checkOut ? new Date(checkOut).toLocaleDateString('en-US', options) : 'End';
        return `${checkInStr} - ${checkOutStr}`;
    };

    const formatTravelers = () => {
        const total = adults + children;
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
        <div className="flex flex-col h-full relative overflow-hidden bg-transparent">
            {/* Scrollable Accordion Cards */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24 relative z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

                {/* 1. Where */}
                <div
                    className={`bg-white dark:bg-slate-900 rounded-3xl transition-all ${activeSection === 'where'
                        ? 'shadow-lg p-5'
                        : 'shadow-sm p-4 flex items-center justify-between cursor-pointer'
                        }`}
                    onClick={() => activeSection !== 'where' && setActiveSection('where')}
                >
                    {activeSection === 'where' ? (
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-bold font-display text-slate-900 dark:text-white mb-4">
                                Where to?
                            </h2>
                            {/* We just render the picker here. We don't want the MapPin/Label wrappers. */}
                            <div className="relative border border-slate-200 dark:border-slate-800 rounded-2xl p-2 bg-white dark:bg-slate-900">
                                <DestinationPicker hideIcon forceOpen />
                            </div>
                        </div>
                    ) : (
                        <>
                            <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">Where</span>
                            <span className="text-slate-900 dark:text-white font-semibold text-sm truncate max-w-[200px]">{destinationText}</span>
                        </>
                    )}
                </div>

                {/* 2. When */}
                <div
                    className={`bg-white dark:bg-slate-900 rounded-3xl transition-all ${activeSection === 'when'
                        ? 'shadow-lg p-5'
                        : 'shadow-sm p-4 flex items-center justify-between cursor-pointer'
                        }`}
                    onClick={() => activeSection !== 'when' && setActiveSection('when')}
                >
                    {activeSection === 'when' ? (
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-bold font-display text-slate-900 dark:text-white mb-4">
                                When's your trip?
                            </h2>
                            <div className="relative border border-slate-200 dark:border-slate-800 rounded-2xl p-2 bg-white dark:bg-slate-900">
                                <DatePicker inline forceOpen />
                            </div>
                        </div>
                    ) : (
                        <>
                            <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">When</span>
                            <span className="text-slate-900 dark:text-white font-semibold text-sm">{formatDateRange()}</span>
                        </>
                    )}
                </div>

                {/* 3. Who */}
                <div
                    className={`bg-white dark:bg-slate-900 rounded-3xl transition-all ${activeSection === 'who'
                        ? 'shadow-lg p-5'
                        : 'shadow-sm p-4 flex items-center justify-between cursor-pointer'
                        }`}
                    onClick={() => activeSection !== 'who' && setActiveSection('who')}
                >
                    {activeSection === 'who' ? (
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-bold font-display text-slate-900 dark:text-white mb-4">
                                Who's coming?
                            </h2>
                            <div className="relative bg-white dark:bg-slate-900">
                                <TravelersPicker inline forceOpen />
                            </div>
                        </div>
                    ) : (
                        <>
                            <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">Who</span>
                            <span className="text-slate-900 dark:text-white font-semibold text-sm">{formatTravelers()}</span>
                        </>
                    )}
                </div>

            </div>

            {/* Bottom Floating Bar */}
            <div className="border-t border-slate-200/50 dark:border-white/5 bg-white/80 backdrop-blur-md dark:bg-slate-900/80 p-4 flex items-center justify-between rounded-b-3xl shrink-0 absolute bottom-0 left-0 right-0 z-20 w-full">
                <button
                    onClick={handleClearAll}
                    className="text-slate-900 dark:text-white font-semibold font-display underline underline-offset-4 decoration-slate-300 dark:decoration-slate-700 hover:decoration-slate-900 dark:hover:decoration-white transition-all text-sm px-2"
                >
                    Clear all
                </button>
                <button
                    onClick={(e) => {
                        handleSearch();
                        // Close modal implies clicking outside or emitting an event, but
                        // SearchPage redirects completely so we don't strictly need to do it manually.
                    }}
                    disabled={isSearching}
                    className="bg-alabaster-accent dark:bg-obsidian-accent hover:opacity-90 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 min-w-[120px]"
                >
                    {isSearching ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            Search
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
