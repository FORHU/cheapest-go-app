"use client";

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, History, Plane, Building2, X } from 'lucide-react';
import { Destination, useSearchStore, useDestinationQuery, useRecentSearches, useActiveDropdown } from '@/stores/searchStore';

// Mock popular destinations
const popularDestinations: Destination[] = [
    { type: 'city', title: 'Manila', subtitle: 'National Capital Region, Philippines' },
    { type: 'airport', title: 'Manila (MNL - Ninoy Aquino Intl.)', subtitle: 'Philippines', code: 'MNL' },
    { type: 'city', title: 'Baguio City', subtitle: 'Summer Capital, Philippines' },
    { type: 'city', title: 'Boracay Island', subtitle: 'Western Visayas, Philippines' },
    { type: 'airport', title: 'Cebu (CEB - Mactan-Cebu Intl.)', subtitle: 'Philippines', code: 'CEB' },
    { type: 'city', title: 'Makati', subtitle: 'National Capital Region, Philippines' },
    { type: 'airport', title: 'Angeles City (CRK - Clark Intl.)', subtitle: 'Philippines', code: 'CRK' },
];

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
    const handleSelect = (destination: Destination) => {
        setDestination(destination);
        setDestinationQuery(destination.title);
        addRecentSearch(destination);
        onClose();
    };

    // Filter destinations based on query
    const filteredDestinations = query.length > 0
        ? popularDestinations.filter(d =>
            d.title.toLowerCase().includes(query.toLowerCase()) ||
            d.subtitle.toLowerCase().includes(query.toLowerCase())
        )
        : popularDestinations;

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
                    <div className="max-h-[400px] overflow-y-auto py-2">
                        {/* Recent Searches */}
                        {recentSearches.length > 0 && !query && (
                            <>
                                <div className="px-6 py-2 text-[10px] font-mono uppercase text-slate-400 tracking-widest">
                                    Recent
                                </div>
                                {recentSearches.map((item, i) => (
                                    <div
                                        key={`recent-${i}`}
                                        onClick={() => handleSelect(item)}
                                        className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-start gap-4 cursor-pointer group transition-colors"
                                    >
                                        <div className="mt-0.5 text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors">
                                            <History size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <h5 className="text-sm font-bold group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors text-slate-900 dark:text-white">
                                                {item.title}
                                            </h5>
                                            <p className="text-xs text-slate-400 truncate max-w-[320px]">
                                                {item.subtitle}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (removeRecentSearch) removeRecentSearch(item.title);
                                            }}
                                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <div className="h-px bg-slate-100 dark:bg-white/5 my-2" />
                            </>
                        )}

                        {/* Popular / Filtered Destinations */}
                        <div className="px-6 py-2 text-[10px] font-mono uppercase text-slate-400 tracking-widest">
                            {query ? 'Results' : 'Popular'}
                        </div>
                        {filteredDestinations.length > 0 ? (
                            filteredDestinations.map((item, i) => (
                                <div
                                    key={i}
                                    onClick={() => handleSelect(item)}
                                    className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-start gap-4 cursor-pointer group transition-colors"
                                >
                                    <div className="mt-0.5 text-slate-400 group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors">
                                        {getIcon(item.type)}
                                    </div>
                                    <div className="flex-1">
                                        <h5 className="text-sm font-bold group-hover:text-alabaster-accent dark:group-hover:text-obsidian-accent transition-colors text-slate-900 dark:text-white">
                                            {item.title}
                                        </h5>
                                        <p className="text-xs text-slate-400 truncate max-w-[280px]">
                                            {item.subtitle}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-6 py-8 text-center text-slate-400">
                                No destinations found for "{query}"
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
