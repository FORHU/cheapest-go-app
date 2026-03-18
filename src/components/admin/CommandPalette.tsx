"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CalendarRange, Users, Shield, Loader2, Plane, Building2, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SearchResponse, SearchResult } from '@/lib/server/admin/search';

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
    confirmed: 'bg-emerald-500',
    ticketed: 'bg-emerald-500',
    booked: 'bg-emerald-500',
    cancelled: 'bg-rose-500',
    refunded: 'bg-purple-500',
    pending: 'bg-amber-500',
    awaiting_ticket: 'bg-amber-500',
    failed: 'bg-rose-500',
    active: 'bg-emerald-500',
    inactive: 'bg-slate-400',
    banned: 'bg-rose-500',
    admin: 'bg-blue-500',
    user: 'bg-slate-400',
};

const CATEGORY_CONFIG = {
    booking: { icon: CalendarRange, label: 'Bookings', color: 'text-blue-500' },
    customer: { icon: Users, label: 'Customers', color: 'text-emerald-500' },
    user: { icon: Shield, label: 'Users', color: 'text-indigo-500' },
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const flatResults = useMemo(() => [
        ...(results?.bookings || []),
        ...(results?.customers || []),
        ...(results?.users || []),
    ], [results]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setQuery('');
            setResults(null);
            setActiveIndex(0);
            setIsLoading(false);
        }
    }, [open]);

    // Auto-focus input on open
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Debounced search
    const doSearch = useCallback(async (term: string) => {
        if (term.trim().length < 2) {
            setResults(null);
            setIsLoading(false);
            return;
        }

        // Abort previous request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        try {
            const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, {
                signal: controller.signal,
            });
            if (!res.ok) throw new Error('Search failed');
            const data: SearchResponse = await res.json();
            setResults(data);
            setActiveIndex(0);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('[CommandPalette] Search error:', e);
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.trim().length >= 2) {
            setIsLoading(true);
            debounceRef.current = setTimeout(() => doSearch(query), 300);
        } else {
            setResults(null);
            setIsLoading(false);
        }
        return () => clearTimeout(debounceRef.current);
    }, [query, doSearch]);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % Math.max(flatResults.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + flatResults.length) % Math.max(flatResults.length, 1));
        } else if (e.key === 'Enter' && flatResults[activeIndex]) {
            e.preventDefault();
            router.push(flatResults[activeIndex].href);
            onOpenChange(false);
        }
    };

    // Scroll active item into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    // Escape key on window
    useEffect(() => {
        if (!open) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [open, onOpenChange]);

    if (!open) return null;

    const hasResults = flatResults.length > 0;
    const hasQuery = query.trim().length >= 2;

    const renderCategory = (category: 'booking' | 'customer' | 'user', items: SearchResult[]) => {
        if (items.length === 0) return null;
        const config = CATEGORY_CONFIG[category];
        const Icon = config.icon;
        const startIdx = category === 'booking' ? 0
            : category === 'customer' ? (results?.bookings?.length || 0)
                : (results?.bookings?.length || 0) + (results?.customers?.length || 0);

        return (
            <div key={category}>
                <div className="flex items-center gap-2 px-4 py-2">
                    <Icon size={12} className={config.color} />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{config.label}</span>
                    <span className="text-[10px] font-bold text-slate-300 dark:text-white/20">{items.length}</span>
                </div>
                {items.map((result, i) => {
                    const globalIdx = startIdx + i;
                    const isActive = globalIdx === activeIndex;
                    const statusColor = STATUS_COLORS[result.status || ''] || STATUS_COLORS[result.meta?.role || ''];

                    return (
                        <button
                            key={result.id}
                            data-index={globalIdx}
                            onClick={() => {
                                router.push(result.href);
                                onOpenChange(false);
                            }}
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors rounded-xl mx-1 ${isActive ? 'bg-blue-50 dark:bg-blue-900/15' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                            style={{ width: 'calc(100% - 8px)' }}
                        >
                            {/* Type icon for bookings */}
                            {result.category === 'booking' && (
                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                                    {result.meta?.type === 'flight'
                                        ? <Plane size={14} className="text-blue-500" />
                                        : <Building2 size={14} className="text-indigo-500" />
                                    }
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                        {result.title}
                                    </span>
                                    {statusColor && (
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
                                    )}
                                    {result.status && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                                            {result.status.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
                            </div>

                            {result.meta?.provider && (
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 dark:text-white/20 shrink-0">
                                    {result.meta.provider}
                                </span>
                            )}
                            {result.meta?.role && (
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg shrink-0 ${result.meta.role === 'admin' ? 'bg-blue-500/10 text-blue-500' : 'text-slate-400'}`}>
                                    {result.meta.role}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    };

    return createPortal(
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => onOpenChange(false)}
                    />

                    {/* Palette */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="relative w-full max-w-xl bg-white dark:bg-obsidian rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
                    >
                        {/* Search Input */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/5">
                            <Search size={18} className="text-slate-400 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search bookings, customers, users..."
                                className="flex-1 bg-transparent text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                            />
                            {isLoading && <Loader2 size={16} className="text-blue-500 animate-spin shrink-0" />}
                            {!isLoading && (
                                <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded-lg text-[10px] font-bold text-slate-400 shrink-0">
                                    ESC
                                </kbd>
                            )}
                        </div>

                        {/* Results */}
                        <div ref={listRef} className="max-h-80 overflow-y-auto py-2 thin-scrollbar">
                            {hasResults && (
                                <>
                                    {renderCategory('booking', results?.bookings || [])}
                                    {renderCategory('customer', results?.customers || [])}
                                    {renderCategory('user', results?.users || [])}
                                </>
                            )}

                            {!hasResults && hasQuery && !isLoading && (
                                <div className="py-12 text-center">
                                    <Search size={32} className="mx-auto text-slate-200 dark:text-white/10 mb-3" />
                                    <p className="text-sm font-bold text-slate-400">No results found</p>
                                    <p className="text-xs text-slate-300 dark:text-white/20 mt-1">Try a different search term</p>
                                </div>
                            )}

                            {!hasQuery && !isLoading && (
                                <div className="py-12 text-center">
                                    <Search size={32} className="mx-auto text-slate-200 dark:text-white/10 mb-3" />
                                    <p className="text-sm font-bold text-slate-400">Start typing to search</p>
                                    <p className="text-xs text-slate-300 dark:text-white/20 mt-1">Search by name, email, booking ref, or PNR</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-4 px-5 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <div className="flex gap-0.5">
                                    <kbd className="w-5 h-5 flex items-center justify-center bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-[10px]">
                                        <ArrowUp size={10} />
                                    </kbd>
                                    <kbd className="w-5 h-5 flex items-center justify-center bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-[10px]">
                                        <ArrowDown size={10} />
                                    </kbd>
                                </div>
                                <span className="text-[10px] font-bold">Navigate</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <kbd className="w-5 h-5 flex items-center justify-center bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-[10px]">
                                    <CornerDownLeft size={10} />
                                </kbd>
                                <span className="text-[10px] font-bold">Open</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <kbd className="px-1.5 h-5 flex items-center justify-center bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-[9px] font-bold">
                                    ESC
                                </kbd>
                                <span className="text-[10px] font-bold">Close</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
