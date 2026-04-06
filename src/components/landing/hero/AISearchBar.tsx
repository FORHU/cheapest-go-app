"use client";

import React, { useState, useCallback, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Search, X, Plane } from 'lucide-react';
import { MagneticButton } from '@/components/ui';
import SearchModeToggle from './SearchModeToggle';
import AIPromptInput from './AIPromptInput';
import AITypingIndicator from './AITypingIndicator';
import AIResultsPreview from './AIResultsPreview';
import { useSearchStore, useSearchMode, useSearchActions, useDestination, useDestinationQuery, useDates, useTravelers } from '@/stores/searchStore';
import { MobileSearchModal } from '@/components/search/MobileSearchModal';
import { useSearchModule } from '@/hooks';
import { useFlightSearch } from '@/hooks/search/useFlightSearch';

// Import Search Forms
import { DestinationSection, DateSection, TravelersSection } from './search/SearchSections';
import { FlightSearchForm } from './search/FlightSearchForm';
// Trip Type Selector Component
const TripTypeSelector = () => {
    const { flightState, setFlightType } = useFlightSearch();
    const { tripType } = flightState;

    return (
        <div className="flex p-0.5 sm:p-1 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/5 mb-3 sm:mb-4 w-fit mx-auto">
            {(['round-trip', 'one-way', 'multi-city'] as const).map((type) => (
                <button
                    key={type}
                    onClick={() => setFlightType(type)}
                    className={`px-3 py-1 sm:px-4 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-full transition-all duration-300 ${tripType === type
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
            ))}
        </div>
    );
};

// Mock AI parse results — visual prototype only
const DEFAULT_RESULT = {
    destination: 'Boracay, Philippines',
    dates: 'Feb 14 — Feb 21',
    guests: '2 Adults',
    budget: 'Under ₱12,000/night',
};

function parseMockResult(query: string) {
    const lower = query.toLowerCase();
    const result = { ...DEFAULT_RESULT };
    if (lower.includes('bali')) result.destination = 'Bali, Indonesia';
    return result;
}

interface AISearchBarProps {
    onSuggestionReady?: (handler: (prompt: string) => void) => void;
}

const AISearchBarContent: React.FC<AISearchBarProps> = ({ onSuggestionReady }) => {
    // Global State
    const searchMode = useSearchMode();
    const { setSearchMode } = useSearchActions();

    // AI Local State
    const [aiQuery, setAiQuery] = useState('');
    const [isAIThinking, setIsAIThinking] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [parsedResult, setParsedResult] = useState(DEFAULT_RESULT);

    // Mobile Modal State & Helpers
    const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);

    const destination = useDestination();
    const query = useDestinationQuery();
    const destinationStr = destination?.title || query || 'Anywhere';

    const { checkIn, checkOut } = useDates();
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
        } catch (e) { }
    }

    const { adults, children } = useTravelers();
    const totalTravelers = adults + children;
    const guestsStr = totalTravelers ? `${totalTravelers} guest${totalTravelers > 1 ? 's' : ''}` : 'Add guests';

    // Hooks for search actions
    const { handleSearch: handleHotelSearch, isSearching: isHotelSearching } = useSearchModule();
    const { handleFlightSearch, isSearching: isFlightSearching, flightState } = useFlightSearch();

    const isSearching = searchMode === 'flights' ? isFlightSearching : (searchMode === 'hotels' ? isHotelSearching : isAIThinking);

    // Handlers
    const handleModeChange = useCallback((newMode: 'hotels' | 'flights' | 'ai') => {
        setSearchMode(newMode);
        if (newMode !== 'ai') {
            setShowResults(false);
            setIsAIThinking(false);
        }
    }, [setSearchMode]);

    const triggerAI = useCallback((query: string) => {
        setIsAIThinking(true);
        setShowResults(false);
        setTimeout(() => {
            setParsedResult(parseMockResult(query));
            setIsAIThinking(false);
            setShowResults(true);
        }, 2000);
    }, []);

    const handleAISubmit = useCallback(() => {
        if (!aiQuery.trim() || isAIThinking) return;
        triggerAI(aiQuery);
    }, [aiQuery, isAIThinking, triggerAI]);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setSearchMode('ai');
        setAiQuery(prompt);
        triggerAI(prompt);
    }, [triggerAI, setSearchMode]);

    // Expose suggestion handler
    useEffect(() => {
        onSuggestionReady?.(handleSuggestionClick);
    }, [onSuggestionReady, handleSuggestionClick]);

    // Determine which search handler to use
    const handleMainSearchClick = () => {
        if (searchMode === 'hotels') handleHotelSearch();
        if (searchMode === 'flights') handleFlightSearch();
        if (searchMode === 'ai') handleAISubmit();
    };

    // Dynamic width: expand only for flights + round-trip
    const isWide = searchMode === 'flights' && flightState.tripType === 'round-trip';

    return (
        <div
            className="transition-all duration-300 ease-in-out"

            style={{
                width: isWide ? 'min(1150px, 100%)' : '100%',
                maxWidth: '100%',
                position: 'relative',
                left: isWide ? '50%' : '0',
                transform: isWide ? 'translateX(-50%)' : 'none',
            }}
        >
            <SearchModeToggle mode={searchMode} onModeChange={handleModeChange} />

            {/* Flight Trip Type Selector - Shown only in flights mode, hidden on mobile */}
            <AnimatePresence>
                {searchMode === 'flights' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="overflow-hidden hidden sm:block"
                    >
                        <TripTypeSelector />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Shared Animated Glow Border / Main Container */}
            <div className="relative">
                {/* Mobile Pill (Hidden on sm and up) */}
                <div className="sm:hidden">
                    <button
                        onClick={() => setIsMobileModalOpen(true)}
                        className="w-full flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full py-2.5 px-4 shadow-sm hover:shadow-md transition-shadow gap-3 text-left min-h-[44px]"
                    >
                        {searchMode === 'ai' ? (
                            <Sparkles size={16} className="text-blue-500 dark:text-blue-400 shrink-0" />
                        ) : searchMode === 'flights' ? (
                            <Plane size={16} className="text-slate-800 dark:text-slate-200 shrink-0" />
                        ) : (
                            <Search size={16} className="text-slate-800 dark:text-slate-200 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                                {searchMode === 'ai' ? 'What are you looking for?' : searchMode === 'flights' ? 'Search flights' : (destinationStr === 'Anywhere' ? 'Where to?' : destinationStr)}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {searchMode === 'ai' ? 'Ask AI for recommendations' : searchMode === 'flights' ? 'Find the best deals' : `${dateStr} · ${guestsStr}`}
                            </p>
                        </div>
                    </button>
                </div>

                {/* Desktop Search Container (Hidden on mobile) */}
                <div className="hidden sm:block">
                    <motion.div
                        className={`absolute -inset-[1px] pointer-events-none z-0 ${searchMode !== 'ai' ? 'rounded-xl' : 'rounded-2xl'}`}
                        style={{
                            background: 'linear-gradient(135deg, rgba(37,99,235,0.5), rgba(34,211,238,0.5), rgba(139,92,246,0.3), rgba(34,211,238,0.5), rgba(37,99,235,0.5))',
                            backgroundSize: '300% 300%',
                        }}
                        animate={{
                            opacity: [0.4, 0.8, 0.4],
                            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    <div className="relative z-10 bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-transparent p-2">

                        {/* Unified Search Container */}
                        {searchMode !== 'ai' ? (
                            <div className={`flex flex-col ${searchMode === 'flights' && flightState.tripType === 'multi-city' ? '' : 'sm:flex-row'} bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 h-auto ${searchMode === 'flights' && flightState.tripType === 'multi-city' ? '' : 'sm:h-16'}`}>

                                {/* Inputs Area - overflow-hidden + min-w-0 forces text truncation */}
                                <div className={`flex-1 flex flex-col ${searchMode === 'flights' && flightState.tripType === 'multi-city' ? '' : 'sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5'} min-w-0`}>
                                    <AnimatePresence mode="wait">
                                        {searchMode === 'hotels' && (
                                            <motion.div
                                                key="hotels"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="contents"
                                            >
                                                <DestinationSection />
                                                <DateSection />
                                                <TravelersSection />
                                            </motion.div>
                                        )}

                                        {searchMode === 'flights' && (
                                            <motion.div
                                                key="flights"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className={flightState.tripType === 'multi-city' ? 'flex flex-col w-full' : 'contents'}
                                            >
                                                <FlightSearchForm />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Search Button - shrink-0 ensures it never gets squeezed */}
                                <div className={`shrink-0 p-1 flex items-center justify-center border-t ${searchMode === 'flights' && flightState.tripType === 'multi-city' ? '' : 'sm:border-t-0 sm:border-l'} border-slate-200 dark:border-white/5`}>
                                    <MagneticButton
                                        onClick={handleMainSearchClick}
                                        isLoading={isSearching}
                                        className={`h-12 w-full sm:w-auto px-6 rounded-lg ${searchMode === 'flights' ? '!bg-blue-600 hover:!bg-blue-700' : ''}`}
                                    />
                                </div>
                            </div>
                        ) : (
                            /* AI Mode */
                            <div className="flex flex-col lg:flex-row gap-2">
                                <div className="flex-[4] min-w-0">
                                    <motion.div
                                        key="ai"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="flex flex-col gap-3 p-1">
                                            <AIPromptInput
                                                value={aiQuery}
                                                onChange={setAiQuery}
                                                onSubmit={handleAISubmit}
                                                disabled={isAIThinking}
                                            />

                                            <AnimatePresence>
                                                {isAIThinking && <AITypingIndicator />}
                                                {showResults && !isAIThinking && (
                                                    <AIResultsPreview
                                                        result={parsedResult}
                                                        onSearch={handleHotelSearch}
                                                    />
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                </div>
                                <div className="flex-none hidden lg:block">
                                    <MagneticButton
                                        onClick={handleAISubmit}
                                        isLoading={isAIThinking}
                                        label="Ask AI"
                                        icon={<Sparkles size={16} />}
                                        className="h-full min-h-[64px]"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <MobileSearchModal isOpen={isMobileModalOpen} onClose={() => setIsMobileModalOpen(false)} onSearch={() => setIsMobileModalOpen(false)}>
                {searchMode === 'flights' ? (
                    <div className="flex flex-col h-full">
                        {/* Close button */}
                        <div className="flex justify-end px-4 pt-2 pb-1 shrink-0">
                            <button
                                onClick={() => setIsMobileModalOpen(false)}
                                className="p-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
                            >
                                <X size={16} className="text-slate-700 dark:text-slate-300" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
                            <TripTypeSelector />
                            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                                <FlightSearchForm />
                            </div>
                        </div>
                        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 flex justify-end">
                            <MagneticButton
                                onClick={() => {
                                    handleMainSearchClick();
                                    setIsMobileModalOpen(false);
                                }}
                                isLoading={isSearching}
                                className="w-full h-12 rounded-xl !bg-blue-600 hover:!bg-blue-700 text-white font-bold"
                                label="Search Flights"
                            />
                        </div>
                    </div>
                ) : searchMode === 'ai' ? (
                    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0f172a]">
                        {/* Unified AI Header */}
                        <div className="flex justify-between items-center px-4 pt-2 pb-2 shrink-0 relative z-50">
                            <button
                                onClick={() => {
                                    setIsMobileModalOpen(false);
                                    setTimeout(() => {
                                        setSearchMode('hotels');
                                        setAiQuery('');
                                        setShowResults(false);
                                    }, 200);
                                }}
                                className="p-2 -ml-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                                {(isAIThinking || showResults) ? 'Results' : ''}
                            </span>
                            <div className="w-10"></div>
                        </div>

                        <div className="flex-1 flex flex-col justify-between px-4 pb-4 h-full relative overflow-hidden">
                            {/* Main Scrollable Area */}
                            <div className="flex-1 overflow-y-auto flex flex-col pt-4 pb-6 hide-scrollbar relative z-0">
                                <AnimatePresence mode="wait">
                                    {!(isAIThinking || showResults) ? (
                                        <motion.div
                                            key="prompt"
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex-1 flex flex-col items-center justify-center -mt-10"
                                        >
                                            <h2 className="text-2xl sm:text-3xl font-display font-medium text-slate-800 dark:text-slate-200 text-center max-w-[280px] sm:max-w-xs leading-tight">
                                                How can I help you this morning?
                                            </h2>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="results"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col w-full pb-4"
                                        >
                                            {isAIThinking && <AITypingIndicator />}
                                            {showResults && !isAIThinking && (
                                                <AIResultsPreview
                                                    result={parsedResult}
                                                    onSearch={handleHotelSearch}
                                                />
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Bottom Input Area */}
                            <div className="w-full shrink-0 relative z-20">
                                <div className="bg-white dark:bg-slate-900 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_-5px_30px_-10px_rgba(0,0,0,0.5)] rounded-3xl border border-slate-200 dark:border-slate-800 transition-all">
                                    <AIPromptInput
                                        value={aiQuery}
                                        onChange={setAiQuery}
                                        onSubmit={handleAISubmit}
                                        disabled={isAIThinking}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : undefined}
            </MobileSearchModal>
        </div>
    );
};

// Main export with Suspense wrapper
const AISearchBar: React.FC<AISearchBarProps> = (props) => {
    return (
        <Suspense fallback={
            <div className="w-full">
                <div className="flex justify-center mb-3 sm:mb-4">
                    <div className="h-10 w-48 bg-white/10 rounded-full animate-pulse" />
                </div>
                <div className="bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 p-3 h-[72px] animate-pulse" />
            </div>
        }>
            <AISearchBarContent {...props} />
        </Suspense>
    );
};

export default AISearchBar;
