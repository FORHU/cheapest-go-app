"use client";

import React, { useRef, useEffect, useState, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Loader2, MapPin } from 'lucide-react';
import type { Airport } from '@/lib/airports';

// ─── Props ───────────────────────────────────────────────────────────

export interface AirportAutocompleteProps {
    /** Currently selected airport */
    value: Airport | null;
    /** Called when user selects an airport — receives the Airport object (parent reads `.iata`) */
    onChange: (airport: Airport | null) => void;
    /** Label text (e.g. "From", "To") */
    label: string;
    /** Placeholder text */
    placeholder?: string;
    /** Whether the dropdown is open */
    isOpen: boolean;
    /** Toggle the dropdown */
    onToggle: (isOpen: boolean) => void;
    /** IATA code to exclude from results (e.g. prevent same origin/dest) */
    excludeIata?: string;
}

// ─── Debounce delay (ms) ─────────────────────────────────────────────

const DEBOUNCE_MS = 250;

// ─── Component ───────────────────────────────────────────────────────

export const AirportAutocomplete: React.FC<AirportAutocompleteProps> = ({
    value,
    onChange,
    label,
    placeholder = "Search airport...",
    isOpen,
    onToggle,
    excludeIata,
}) => {
    const uid = useId();
    const listboxId = `airport-listbox-${uid}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Airport[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);

    // ── Reset when opened/closed ─────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setError(null);
            setActiveIndex(-1);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);

    // ── Click outside to close ───────────────────────────────────
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onToggle(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    // ── Debounced fetch (Amadeus → local fallback) ───────────────
    useEffect(() => {
        if (!query || query.length < 1) {
            setResults([]);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/airports/search?q=${encodeURIComponent(query)}&limit=8`,
                    { signal: controller.signal },
                );
                const json = await res.json();

                if (json.success) {
                    let data: Airport[] = json.data;
                    if (excludeIata) {
                        data = data.filter(a => a.iata !== excludeIata);
                    }
                    setResults(data);
                } else {
                    setError(json.error || 'Search failed');
                    setResults([]);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setError('Network error');
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, excludeIata]);

    // ── Scroll active item into view ─────────────────────────────
    useEffect(() => {
        if (activeIndex < 0) return;
        const el = document.getElementById(`${listboxId}-option-${activeIndex}`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, listboxId]);

    // ── Keyboard navigation ──────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => Math.min(prev + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < results.length) {
                    handleSelect(results[activeIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                onToggle(false);
                break;
        }
    }, [activeIndex, results, onToggle]);

    const handleSelect = (airport: Airport) => {
        onChange(airport);
        onToggle(false);
    };

    // ── Display ──────────────────────────────────────────────────
    const displayText = value ? `${value.city} (${value.iata})` : null;
    const displaySubtext = value ? value.name : null;

    return (
        <div
            className="flex-1 min-w-0 relative flex items-center px-4 h-16 group cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            onClick={() => onToggle(!isOpen)}
        >
            <Plane className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" size={20} />
            <div className="ml-3 flex flex-col justify-center w-full text-left min-w-0">
                <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">
                    {label}
                </label>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {displayText || <span className="text-slate-400 font-normal">{placeholder}</span>}
                </div>
                {displaySubtext && (
                    <div className="text-[10px] text-slate-400 truncate">{displaySubtext}</div>
                )}
            </div>

            {/* ─── Dropdown ──────────────────────────────────────── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={containerRef}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 mt-4 w-[420px] bg-white dark:bg-[#0f172a] shadow-xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-[100]"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label={`Search ${label} airport`}
                    >
                        {/* Search Input */}
                        <div className="p-3 border-b border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2">
                                <Plane className="text-slate-400 shrink-0" size={16} />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setActiveIndex(-1);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type city name or airport code..."
                                    className="bg-transparent border-none p-0 text-sm font-medium focus:ring-0 outline-none w-full text-slate-900 dark:text-white placeholder-slate-400"
                                    role="combobox"
                                    aria-expanded={results.length > 0}
                                    aria-controls={listboxId}
                                    aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                                    aria-autocomplete="list"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                {loading && (
                                    <Loader2 className="animate-spin text-blue-500 shrink-0" size={16} />
                                )}
                            </div>
                        </div>

                        {/* Results */}
                        <div className="max-h-[320px] overflow-y-auto py-1" role="listbox" id={listboxId}>
                            {error ? (
                                <div className="px-6 py-4 text-center text-red-400 text-xs">
                                    {error}
                                </div>
                            ) : results.length > 0 ? (
                                results.map((airport, i) => (
                                    <div
                                        key={`${airport.iata}-${i}`}
                                        id={`${listboxId}-option-${i}`}
                                        role="option"
                                        aria-selected={i === activeIndex}
                                        onClick={() => handleSelect(airport)}
                                        className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${i === activeIndex
                                            ? 'bg-blue-50 dark:bg-blue-500/10'
                                            : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                            }`}
                                    >
                                        {/* IATA Badge */}
                                        <div className="shrink-0 w-12 h-8 rounded-md bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                                            <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300">
                                                {airport.iata}
                                            </span>
                                        </div>

                                        {/* Airport Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                {airport.city}
                                                {airport.country && (
                                                    <span className="font-normal text-slate-500 dark:text-slate-400">
                                                        {' · '}{airport.country}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                                                <MapPin className="w-3 h-3 shrink-0" />
                                                {airport.name}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : query.length > 0 && !loading ? (
                                <div className="px-6 py-6 text-center text-slate-400 text-xs">
                                    No airports found for &ldquo;{query}&rdquo;
                                </div>
                            ) : (
                                <div className="px-6 py-6 text-center text-slate-400 text-xs">
                                    <Plane className="mx-auto mb-2 text-slate-300 dark:text-slate-600" size={24} />
                                    Type a city or airport code to search
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AirportAutocomplete;
