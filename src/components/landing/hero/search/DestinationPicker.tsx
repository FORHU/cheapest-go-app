"use client";

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, History, Plane, Building2, Globe, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { apiFetch } from '@/lib/api/client';
import {
    Destination,
    useSearchStore,
    useDestinationQuery,
    useRecentSearches,
    useActiveDropdown,
} from '@/stores/searchStore';



interface DestinationPickerProps {
    hideIcon?: boolean;
    forceOpen?: boolean;
    onSelect?: (destination: Destination) => void;
}

export const DestinationPicker: React.FC<DestinationPickerProps> = ({ hideIcon, forceOpen, onSelect }) => {
    const ref = useRef<HTMLDivElement>(null);

    // Store
    const query = useDestinationQuery();
    const recentSearches = useRecentSearches();
    const activeDropdown = useActiveDropdown();

    const {
        setDestination,
        setDestinationQuery,
        addRecentSearch,
        setActiveDropdown,
        removeRecentSearch,
    } = useSearchStore();

    // Debounce the query string so the query key only changes after the user pauses
    const [debouncedQuery, setDebouncedQuery] = useState(query);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query), 400);
        return () => clearTimeout(t);
    }, [query]);

    const { data: suggestions = [], isFetching: loading } = useQuery<Destination[]>({
        queryKey: queryKeys.autocomplete.destinations(debouncedQuery),
        queryFn: async () => {
            const result = await apiFetch('/api/autocomplete', { query: debouncedQuery });
            return result.success ? result.data : [];
        },
        enabled: debouncedQuery.length >= 2,
        staleTime: 0,
        placeholderData: (prev) => prev,
    });

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
        if (onSelect) onSelect(destination);
        onClose();
    };

    const getIcon = (type: Destination['type']) => {
        switch (type) {
            case 'history': return <History size={18} />;
            case 'airport': return <Plane size={18} />;
            case 'country': return <Globe size={18} />;
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
                    style={{ willChange: 'auto' }}
                    className={forceOpen
                        ? "w-full z-10 font-sans"
                        : "absolute top-full left-0 mt-4 w-[500px] min-w-[500px] max-w-[500px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-[100] font-sans isolate [backdrop-filter:none]"
                    }
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Search Header */}
                    <div className={`${forceOpen ? 'p-3' : 'p-4 border-b border-slate-100 dark:border-white/5'}`}>
                        {!forceOpen && (
                            <span className="text-[9px] text-slate-500 font-mono font-medium uppercase tracking-wider block mb-1">
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
                                className={`bg-transparent border-none p-0 font-bold focus:ring-0 outline-none w-full text-slate-900 dark:text-white placeholder:font-normal placeholder-slate-400 font-sans ${forceOpen ? 'text-[10px]' : 'text-[13px]'}`}
                            />
                            {loading && (
                                <div className="relative h-4 w-4 shrink-0">
                                    <div className="absolute inset-0 border-2 border-slate-200 dark:border-white/10 rounded-full" />
                                    <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
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
                        <AnimatePresence mode="wait">
                            {/* 1. Recent Searches (only if no query) */}
                            {!query && recentSearches.length > 0 && (
                                <motion.div
                                    key="recent-searches"
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <div className={`${forceOpen ? 'px-2' : 'px-6'} py-1.5 text-[8px] font-mono font-medium uppercase text-slate-500 tracking-wider`}>
                                        Recent Searches
                                    </div>
                                    {recentSearches.map((item, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -4 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.02 }}
                                            onClick={() => handleSelect(item)}
                                            className={`${forceOpen ? 'px-2' : 'px-6'} py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer group`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="mt-0.5 text-slate-400 group-hover:text-amber-500">
                                                    <History size={14} />
                                                </div>
                                                <div>
                                                    <h5 className="text-[11px] font-bold group-hover:text-amber-500 text-slate-900 dark:text-white">
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
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}

                            {/* 2. Autocomplete Suggestions */}
                            {query && (() => {
                                const countries = suggestions.filter(s => s.type === 'country');
                                const cities = suggestions.filter(s => s.type !== 'country');

                                if (suggestions.length === 0) {
                                    return (
                                        <motion.div
                                            key="no-results"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="px-6 py-4 text-center text-slate-400 text-sm"
                                        >
                                            {loading ? 'Searching...' : 'No results found'}
                                        </motion.div>
                                    );
                                }

                                const renderItem = (item: Destination, i: number) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.02 }}
                                        onClick={() => handleSelect(item)}
                                        className={`${forceOpen ? 'px-2' : 'px-6'} py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-3 cursor-pointer group`}
                                    >
                                        <div className={`mt-0.5 text-slate-400 ${item.type === 'country' ? 'group-hover:text-emerald-500' : 'group-hover:text-blue-500'}`}>
                                            {getIcon(item.type)}
                                        </div>
                                        <div className="flex-1">
                                            <h5 className={`text-[11px] font-bold text-slate-900 dark:text-white ${item.type === 'country' ? 'group-hover:text-emerald-500' : 'group-hover:text-blue-500'}`}>
                                                {item.title}
                                            </h5>
                                            <p className="text-[10px] font-normal text-slate-400 truncate max-w-[280px]">
                                                {item.subtitle}
                                            </p>
                                        </div>
                                    </motion.div>
                                );

                                return (
                                    <motion.div
                                        key="suggestions"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {countries.length > 0 && (
                                            <>
                                                <div className={`${forceOpen ? 'px-2' : 'px-6'} py-1.5 text-[8px] font-mono font-medium uppercase text-slate-500 tracking-wider`}>
                                                    Countries
                                                </div>
                                                {countries.map(renderItem)}
                                            </>
                                        )}
                                        {cities.length > 0 && (
                                            <>
                                                <div className={`${forceOpen ? 'px-2' : 'px-6'} py-1.5 text-[8px] font-mono font-medium uppercase text-slate-500 tracking-wider ${countries.length > 0 ? 'mt-1' : ''}`}>
                                                    Cities
                                                </div>
                                                {cities.map(renderItem)}
                                            </>
                                        )}
                                    </motion.div>
                                );
                            })()}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
