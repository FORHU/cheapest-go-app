"use client";

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, History, Plane, Building2, X } from 'lucide-react';
import {
    Destination,
    useSearchStore,
    useDestinationQuery,
    useRecentSearches,
    useActiveDropdown,
    useSuggestions,
    useSuggestionsLoading
} from '@/stores/searchStore';



interface DestinationPickerProps {
    hideIcon?: boolean;
    forceOpen?: boolean;
}

export const DestinationPicker: React.FC<DestinationPickerProps> = ({ hideIcon, forceOpen }) => {
    const ref = useRef<HTMLDivElement>(null);

    // Store
    const query = useDestinationQuery();
    const recentSearches = useRecentSearches();
    const activeDropdown = useActiveDropdown();
    // Use store selectors for suggestions/loading (no useState)
    const suggestions = useSuggestions();
    const loading = useSuggestionsLoading();

    const {
        setDestination,
        setDestinationQuery,
        addRecentSearch,
        setActiveDropdown,
        removeRecentSearch,
        setSuggestions,
        setSuggestionsLoading
    } = useSearchStore();

    const isOpen = forceOpen || activeDropdown === 'destination';
    const onClose = () => {
        if (!forceOpen) setActiveDropdown(null);
    };

    // Close logic
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Handlers
    const handleSelect = (destination: Destination) => {
        setDestination(destination);
        setDestinationQuery(destination.title);
        addRecentSearch(destination);
        onClose();
    };

    // Debounced Autocomplete via API route
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!query || query.length < 2) {
                setSuggestions([]);
                return;
            }

            setSuggestionsLoading(true);
            try {
                const { apiFetch } = await import('@/lib/api/client');
                const result = await apiFetch('/api/autocomplete', { query });

                if (result.success) {
                    setSuggestions(result.data);
                } else {
                    setSuggestions([]);
                }
            } catch (error) {
                console.error("Autocomplete failed:", error);
                setSuggestions([]);
            } finally {
                setSuggestionsLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query, setSuggestions, setSuggestionsLoading]);


    const getIcon = (type: Destination['type']) => {
        switch (type) {
            case 'history': return <History size={18} />;
            case 'airport': return <Plane size={18} />;
            default: return <Building2 size={18} />;
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={ref}
                    initial={forceOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={forceOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={forceOpen
                        ? "w-full z-10"
                        : "absolute top-full left-0 mt-4 w-[500px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-[100]"
                    }
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Search Header */}
                    <div className={`${forceOpen ? 'p-3' : 'p-4'} border-b border-slate-100 dark:border-white/5`}>
                        {!forceOpen && (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">
                                Where to?
                            </span>
                        )}
                        <div className="flex items-center gap-2">
                            {!hideIcon && <MapPin className="text-slate-400 shrink-0" size={20} />}
                            <input
                                autoFocus
                                type="text"
                                value={query}
                                onChange={(e) => setDestinationQuery(e.target.value)}
                                placeholder="Search destinations..."
                                className={`bg-transparent border-none p-0 font-normal focus:ring-0 outline-none w-full text-slate-900 dark:text-white placeholder-slate-400 ${forceOpen ? 'text-[11px]' : 'text-xl'}`}
                            />
                            {loading && <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />}
                            {query && (
                                <button
                                    onClick={() => setDestinationQuery('')}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full"
                                >
                                    <X size={16} className="text-slate-400" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Results List */}
                    <div className="max-h-[240px] overflow-y-auto py-2 thin-scrollbar">
                        {/* 1. Recent Searches (only if no query) */}
                        {!query && recentSearches.length > 0 && (
                            <>
                                <div className={`${forceOpen ? 'px-2' : 'px-6'} py-1.5 text-[9px] font-normal uppercase text-slate-400 tracking-widest`}>
                                    Recent Searches
                                </div>
                                {recentSearches.map((item, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSelect(item)}
                                        className={`${forceOpen ? 'px-2' : 'px-6'} py-2 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer group transition-colors`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="mt-0.5 text-slate-400 group-hover:text-amber-500 transition-colors">
                                                <History size={14} />
                                            </div>
                                            <div>
                                                <h5 className="text-[11px] font-normal group-hover:text-amber-500 transition-colors text-slate-900 dark:text-white">
                                                    {item.title}
                                                </h5>
                                                <p className="text-[10px] font-normal text-slate-400">{item.subtitle}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeRecentSearch(item.title);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-all"
                                        >
                                            <X size={14} className="text-slate-400" />
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}

                        {/* 2. Autocomplete Suggestions */}
                        {query && (
                            <>
                                <div className={`${forceOpen ? 'px-2' : 'px-6'} py-1.5 text-[9px] font-normal uppercase text-slate-400 tracking-widest`}>
                                    LiteAPI Results
                                </div>
                                {suggestions.length > 0 ? (
                                    suggestions.map((item, i) => (
                                        <div
                                            key={i}
                                            onClick={() => handleSelect(item)}
                                            className={`${forceOpen ? 'px-2' : 'px-6'} py-2 hover:bg-slate-50 dark:hover:bg-white/5 flex items-start gap-3 cursor-pointer group transition-colors`}
                                        >
                                            <div className="mt-0.5 text-slate-400 group-hover:text-blue-500 transition-colors">
                                                {getIcon(item.type)}
                                            </div>
                                            <div className="flex-1">
                                                <h5 className="text-[11px] font-normal group-hover:text-blue-500 transition-colors text-slate-900 dark:text-white">
                                                    {item.title}
                                                </h5>
                                                <p className="text-[10px] font-normal text-slate-400 truncate max-w-[280px]">
                                                    {item.subtitle}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-6 py-4 text-center text-slate-400 text-sm">
                                        {loading ? "Searching..." : "No results found"}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
