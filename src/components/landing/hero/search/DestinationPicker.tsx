"use client";

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, History, Plane, Building2, X } from 'lucide-react';
import { Destination, useSearchStore, useDestinationQuery, useRecentSearches, useActiveDropdown } from '@/stores/searchStore';



export const DestinationPicker: React.FC = () => {
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
        removeRecentSearch
    } = useSearchStore();

    const isOpen = activeDropdown === 'destination';
    const onClose = () => setActiveDropdown(null);

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
    // State
    const [suggestions, setSuggestions] = React.useState<Destination[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Handlers
    const handleSelect = (destination: Destination) => {
        setDestination(destination);
        setDestinationQuery(destination.title);
        addRecentSearch(destination);
        onClose();
    };

    // Debounced Autocomplete
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!query || query.length < 2) {
                setSuggestions([]);
                return;
            }

            setLoading(true);
            try {
                // Use client-side safe functions helper
                const { invokeEdgeFunction } = await import('@/utils/supabase/client-functions');

                const res = await invokeEdgeFunction('liteapi-autocomplete', { keyword: query });

                if (res && res.data) {
                    // Map LiteAPI results to Destination objects
                    // Response format: { placeId, displayName, formattedAddress, ... }
                    const mapped = res.data.map((item: any) => {
                        const address = item.formattedAddress || '';
                        // Simple heuristic for country code since API doesn't return it directly
                        let cc = 'PH';
                        if (address.includes('South Korea') || address.includes('Korea')) cc = 'KR';
                        else if (address.includes('Japan')) cc = 'JP';
                        else if (address.includes('United States') || address.includes('USA')) cc = 'US';
                        // Southeast Asia
                        else if (address.includes('Singapore')) cc = 'SG';
                        else if (address.includes('Malaysia')) cc = 'MY';
                        else if (address.includes('Thailand')) cc = 'TH';
                        else if (address.includes('Indonesia')) cc = 'ID';
                        else if (address.includes('Vietnam') || address.includes('Viet Nam')) cc = 'VN';
                        else if (address.includes('Cambodia')) cc = 'KH';
                        else if (address.includes('Laos') || address.includes('Lao PDR')) cc = 'LA';
                        else if (address.includes('Myanmar') || address.includes('Burma')) cc = 'MM';
                        else if (address.includes('Brunei')) cc = 'BN';
                        else if (address.includes('Philippines')) cc = 'PH';
                        // Add more if needed, default to PH for now

                        return {
                            type: 'city',
                            title: item.displayName || item.name,
                            subtitle: address,
                            countryCode: cc,
                            id: item.placeId || item.id
                        };
                    });
                    setSuggestions(mapped);
                }
            } catch (error) {
                console.error("Autocomplete failed:", error);
                setSuggestions([]);
            } finally {
                setLoading(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [query]);


    // Filter destinations based on query
    // Since we removed hardcoded list, this is empty. We rely on Custom Search.
    const filteredDestinations: Destination[] = [];

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
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-4 w-[500px] bg-white dark:bg-[#0f172a] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-[100]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Search Header */}
                    <div className="p-4 border-b border-slate-100 dark:border-white/5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">
                            Where to?
                        </span>
                        <div className="flex items-center gap-2">
                            <MapPin className="text-slate-400 shrink-0" size={20} />
                            <input
                                autoFocus
                                type="text"
                                value={query}
                                onChange={(e) => setDestinationQuery(e.target.value)}
                                placeholder="Search destinations..."
                                className="bg-transparent border-none p-0 text-xl font-bold focus:ring-0 outline-none w-full text-slate-900 dark:text-white placeholder-slate-400"
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
                    <div className="max-h-[300px] overflow-y-auto py-2">
                        {/* 1. Recent Searches (only if no query) */}
                        {!query && recentSearches.length > 0 && (
                            <>
                                <div className="px-6 py-2 text-[10px] font-mono uppercase text-slate-400 tracking-widest">
                                    Recent Searches
                                </div>
                                {recentSearches.map((item, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSelect(item)}
                                        className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer group transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="mt-0.5 text-slate-400 group-hover:text-amber-500 transition-colors">
                                                <History size={18} />
                                            </div>
                                            <div>
                                                <h5 className="text-sm font-bold group-hover:text-amber-500 transition-colors text-slate-900 dark:text-white">
                                                    {item.title}
                                                </h5>
                                                <p className="text-xs text-slate-400">{item.subtitle}</p>
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
                                <div className="px-6 py-2 text-[10px] font-mono uppercase text-slate-400 tracking-widest">
                                    LiteAPI Results
                                </div>
                                {suggestions.length > 0 ? (
                                    suggestions.map((item, i) => (
                                        <div
                                            key={i}
                                            onClick={() => handleSelect(item)}
                                            className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-start gap-4 cursor-pointer group transition-colors"
                                        >
                                            <div className="mt-0.5 text-slate-400 group-hover:text-blue-500 transition-colors">
                                                {getIcon(item.type)}
                                            </div>
                                            <div className="flex-1">
                                                <h5 className="text-sm font-bold group-hover:text-blue-500 transition-colors text-slate-900 dark:text-white">
                                                    {item.title}
                                                </h5>
                                                <p className="text-xs text-slate-400 truncate max-w-[280px]">
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
