'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPropertyCard } from '@/components/map/MapPropertyCard';
import { MapModal } from '@/components/map/MapModal';
import { computeBounds } from '@/components/map/types';
import type { MappableProperty } from '@/components/map/types';
import type { Property } from '@/data/mockProperties';
import { ArrowLeft, MapPin, ChevronDown, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn } from '@/lib/utils';
import { SearchMapContainer } from '../mapbox/SearchMapContainer';

// ── Sort logic ──────────────────────────────────────────
const SORT_OPTIONS = ['recommended', 'price-low', 'price-high', 'rating'] as const;
type SortValue = typeof SORT_OPTIONS[number];

const SORT_LABELS: Record<SortValue, string> = {
    'recommended': 'Recommended',
    'price-low': 'Lowest Price',
    'price-high': 'Highest Price',
    'rating': 'Top Rated',
};

interface SearchMapViewProps {
    properties: Property[];
    destination?: string;
}

/**
 * Full-page Agoda-style split map layout.
 *
 * LEFT  — scrollable property card list with sort controls
 * RIGHT — sticky Mapbox map, full viewport height
 */
function SearchMapView({ properties, destination }: SearchMapViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // State
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortValue>('recommended');
    const [showMobileMap, setShowMobileMap] = useState(true);

    // Filter only properties with real coordinates (not 0,0)
    const mappableProperties = useMemo<MappableProperty[]>(
        () =>
            properties.filter(
                (p): p is MappableProperty =>
                    p.coordinates != null &&
                    typeof p.coordinates.lat === 'number' &&
                    typeof p.coordinates.lng === 'number' &&
                    p.coordinates.lat !== 0 &&
                    p.coordinates.lng !== 0
            ),
        [properties]
    );

    // Sort
    const sortedProperties = useMemo(() => {
        const sorted = [...mappableProperties];
        if (sortBy === 'price-low') sorted.sort((a, b) => a.price - b.price);
        else if (sortBy === 'price-high') sorted.sort((a, b) => b.price - a.price);
        else if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
        return sorted;
    }, [mappableProperties, sortBy]);

    // Derived
    const bounds = useMemo(() => computeBounds(mappableProperties), [mappableProperties]);

    const selectedProperty = useMemo(
        () => (selectedId ? mappableProperties.find((p) => p.id === selectedId) ?? null : null),
        [selectedId, mappableProperties]
    );

    // ── Handlers ────────────────────────────────────────────

    const handleBackToList = useCallback(() => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.delete('view');
        router.push(`/search?${params.toString()}`);
    }, [router, searchParams]);

    const handleViewDetails = useCallback(
        (id: string) => {
            const params = new URLSearchParams(searchParams?.toString() || '');
            params.delete('view');
            router.push(`/property/${id}?${params.toString()}`);
        },
        [router, searchParams]
    );

    const scrollToCard = useCallback((id: string) => {
        const card = document.querySelector(`[data-property-id="${id}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    const handleCardSelect = useCallback(
        (id: string) => {
            const property = mappableProperties.find((p) => p.id === id);
            if (!property) return;

            setSelectedId((prev) => (prev === id ? null : id));
        },
        [mappableProperties]
    );

    const handleHover = useCallback((id: string | null) => {
        setHoveredId(id);
    }, []);

    // ── Price range summary ─────────────────────────────────
    const priceRange = useMemo(() => {
        if (mappableProperties.length === 0) return null;
        const prices = mappableProperties.map((p) => p.price).filter((p) => p > 0);
        if (prices.length === 0) return null;
        return {
            min: Math.min(...prices),
            max: Math.max(...prices),
        };
    }, [mappableProperties]);


    // ── Render ──────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full w-full">
            {/* ── Top bar ── */}
            <div className="flex-shrink-0 h-12 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 z-10 landscape-compact-topbar">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-full flex items-center gap-2 sm:gap-3">
                    <button
                        onClick={handleBackToList}
                        className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={14} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Back</span>
                    </button>

                    <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

                    <div className="flex items-center gap-1.5 landscape-compact:hidden">
                        <MapPin size={14} className="text-blue-500" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {destination || 'Search'}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            · {mappableProperties.length}
                        </span>
                    </div>

                    {priceRange && (
                        <>
                            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />
                            <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline">
                                {formatCurrency(priceRange.min)} – {formatCurrency(priceRange.max)} /night
                            </span>
                        </>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                        {/* Sort */}
                        <div className="relative">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortValue)}
                                className="appearance-none pl-3 pr-7 py-1.5 bg-slate-100 dark:bg-slate-800 border-0 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                                {SORT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {SORT_LABELS[opt]}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Desktop Split layout ── */}
            <div className="hidden lg:flex flex-1 min-h-0 relative">
                {/* LEFT: Property list */}
                <div className="w-[420px] xl:w-[calc(420px+max(0px,50vw-700px))] xl:pl-[max(0px,50vw-700px)] flex-shrink-0 h-full overflow-y-auto overscroll-contain bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
                    {sortedProperties.length > 0 ? (
                        <div className="flex flex-col">
                            {sortedProperties.map((property) => (
                                <MapPropertyCard
                                    key={property.id}
                                    property={property}
                                    isSelected={selectedId === property.id}
                                    isHovered={hoveredId === property.id}
                                    onSelect={handleCardSelect}
                                    onHover={handleHover}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                            <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                No properties with locations
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                Try a different search to see results on the map
                            </p>
                        </div>
                    )}
                </div>

                {/* RIGHT: Map */}
                <div
                    className="flex-1 h-full relative"
                    style={{ paddingRight: 'max(0px, calc((100vw - 1400px) / 2))' }}
                >
                    <SearchMapContainer
                        properties={mappableProperties}
                        selectedId={selectedId}
                        onSelectId={setSelectedId}
                        hoveredId={hoveredId}
                        onHoverId={setHoveredId}
                        onViewDetails={handleViewDetails}
                    />

                    {/* Property count badge */}
                    <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {mappableProperties.length} properties
                    </div>

                    {/* Floating List View Toggle */}
                    <button
                        onClick={handleBackToList}
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/95 hover:bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-0.5 flex items-center gap-2 text-sm font-semibold backdrop-blur-sm z-50 pointer-events-auto"
                    >
                        <List size={18} />
                        Show List
                    </button>
                </div>
            </div>

            {/* ── Mobile Map layout ── */}
            <div className="flex lg:hidden flex-1 relative min-h-0 w-full">
                <SearchMapContainer
                    properties={mappableProperties}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    hoveredId={hoveredId}
                    onHoverId={setHoveredId}
                    onViewDetails={handleViewDetails}
                />

                {/* Floating "List" Toggle (Top Right) */}
                <button
                    onClick={handleBackToList}
                    className={cn(
                        "absolute top-4 right-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 rounded-full shadow-lg active:scale-95 transition-all flex items-center gap-2 font-semibold z-50 pointer-events-auto",
                        "text-xs landscape:top-2 landscape:right-12"
                    )}
                >
                    <List size={16} />
                    List
                </button>

                {/* Horizontal Swiper */}
                <AnimatePresence>
                    {showMobileMap && sortedProperties.length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="absolute bottom-16 left-0 right-0 w-full overflow-x-auto pb-2 pt-2 px-3 snap-x snap-mandatory flex gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] z-20 landscape:bottom-12"
                        >
                            {sortedProperties.map((property) => (
                                <div key={property.id} className="snap-center shrink-0 w-[75vw] sm:w-[300px] landscape:w-[280px] shadow-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                    <MapPropertyCard
                                        property={property}
                                        isSelected={selectedId === property.id}
                                        isHovered={hoveredId === property.id}
                                        onSelect={handleCardSelect}
                                        onHover={handleHover}
                                    />
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Swiper Toggle Button (Bottom Center Pill) */}
                <button
                    onClick={() => setShowMobileMap(!showMobileMap)}
                    className={cn(
                        "absolute left-1/2 -translate-x-1/2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-800 z-30 active:scale-95 transition-all text-slate-700 dark:text-slate-200 flex items-center gap-1.5",
                        "bottom-4 landscape:bottom-2"
                    )}
                    aria-label={showMobileMap ? "Hide swiper" : "Show swiper"}
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider">{showMobileMap ? 'Hide' : 'Show'}</span>
                    <ChevronDown size={14} className={cn("transition-transform duration-300", !showMobileMap && "rotate-180")} />
                </button>
            </div>
        </div>
    );
}



export { SearchMapView };
