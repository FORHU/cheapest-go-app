'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MapPropertyCard } from '@/components/map/MapPropertyCard';
import { MapModal } from '@/components/map/MapModal';
import { computeBounds } from '@/components/map/types';
import type { MappableProperty } from '@/components/map/types';
import { type Property } from '@/types';
import { ArrowLeft, MapPin, ChevronDown, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import CurrencySelector from '@/components/common/CurrencySelector';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SearchMapContainer = dynamic(
    () => import('../mapbox/SearchMapContainer').then(m => ({ default: m.SearchMapContainer })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 h-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        ),
    }
);

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
    const targetCurrency = useUserCurrency();

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
        params.set('view', 'list');
        router.push(`/search?${params.toString()}`);
    }, [router, searchParams]);

    const handleViewDetails = useCallback(
        (id: string) => {
            const params = new URLSearchParams(searchParams?.toString() || '');
            params.delete('view');
            const prop = properties.find(p => p.id === id);
            if (prop?.rateId) params.set('rateId', prop.rateId);
            router.push(`/property/${id}?${params.toString()}`);
        },
        [router, searchParams, properties]
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
            <div className="flex-shrink-0 h-10 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 z-30 relative landscape-compact-topbar">
                <div className="max-w-[1400px] mx-auto px-3 h-full flex items-center gap-2">
                    <button
                        onClick={handleBackToList}
                        className="flex items-center gap-1 text-[10px] sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={12} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Back</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

                    <div className="flex items-center gap-1 landscape-compact:hidden">
                        <MapPin size={12} className="text-blue-500" />
                        <span className="text-[10px] font-semibold text-slate-900 dark:text-white truncate max-w-[100px] sm:max-w-[200px]">
                            {destination || 'Search'}
                        </span>
                    </div>

                    {priceRange && (
                        <>
                            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />
                            <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline">
                                {formatCurrency(convertCurrency(priceRange.min, mappableProperties[0]?.currency || 'USD', targetCurrency), targetCurrency)} – {formatCurrency(convertCurrency(priceRange.max, mappableProperties[0]?.currency || 'USD', targetCurrency), targetCurrency)} /night
                            </span>
                        </>
                    )}

                    <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                        {/* Currency Selector (Mobile) */}
                        <CurrencySelector variant="pill" align="right" className="sm:hidden" />

                        {/* Sort */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center justify-between gap-2 px-3 h-[28px] md:h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-[10px] md:text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[100px] md:min-w-[140px]">
                                    <span className="truncate">{SORT_LABELS[sortBy]}</span>
                                    <ChevronDown size={14} className="text-slate-400 shrink-0 w-3 h-3 md:w-3.5 md:h-3.5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                                {SORT_OPTIONS.map((opt) => (
                                    <DropdownMenuItem
                                        key={opt}
                                        onClick={() => setSortBy(opt)}
                                        className={cn(
                                            "text-[11px] font-semibold py-1.5",
                                            opt === sortBy ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-slate-700 dark:text-slate-300"
                                        )}
                                    >
                                        {SORT_LABELS[opt]}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
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
                        properties={sortedProperties}
                        selectedId={selectedId}
                        onSelectId={setSelectedId}
                        hoveredId={hoveredId}
                        onHoverId={setHoveredId}
                        onViewDetails={handleViewDetails}
                        searchOverlayClassName="absolute top-3 left-3 right-3 z-20"
                    />

                    {/* Property count badge */}
                    <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {mappableProperties.length} properties
                    </div>

                    {/* Floating List View Toggle */}
                    <button
                        onClick={handleBackToList}
                        className="absolute bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-0.5 flex items-center gap-2 text-[14px] font-bold z-50 pointer-events-auto"
                    >
                        <List size={16} strokeWidth={2.5} />
                        Show List
                    </button>
                </div>
            </div>

            {/* ── Mobile Map layout ── */}
            <div className={cn("flex lg:hidden flex-1 relative min-h-0 w-full mobile-search-map", showMobileMap ? "map-cards-visible" : "map-cards-hidden")}>
                <SearchMapContainer
                    properties={sortedProperties}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    hoveredId={hoveredId}
                    onHoverId={setHoveredId}
                    onViewDetails={handleViewDetails}
                    searchOverlayClassName="absolute top-4 left-4 right-4 z-20"
                />

                {/* Horizontal Swiper */}
                <AnimatePresence>
                    {showMobileMap && sortedProperties.length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={0.2}
                            dragDirectionLock
                            onDragEnd={(e, info) => {
                                if (info.offset.y > 40) {
                                    setShowMobileMap(false);
                                }
                            }}
                            className="absolute bottom-2 left-0 right-0 w-full z-20"
                        >
                            <div className="w-full overflow-x-auto pb-2 pt-2 px-3 snap-x snap-mandatory flex gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {sortedProperties.map((property) => (
                                    <div key={property.id} className="snap-center shrink-0 w-[70vw] sm:w-[260px] landscape:w-[240px] shadow-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                        <MapPropertyCard
                                            property={property}
                                            isSelected={selectedId === property.id}
                                            isHovered={hoveredId === property.id}
                                            onSelect={handleCardSelect}
                                            onHover={handleHover}
                                        />
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Swipe Up Handle when hidden */}
                <AnimatePresence>
                    {!showMobileMap && sortedProperties.length > 0 && (
                        <motion.div
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 50, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="absolute bottom-2 left-0 right-0 h-10 z-20 flex justify-center items-center cursor-grab active:cursor-grabbing"
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={0.2}
                            dragDirectionLock
                            onDragEnd={(e, info) => {
                                if (info.offset.y < -30) {
                                    setShowMobileMap(true);
                                }
                            }}
                        >
                            <div className="w-12 h-1.5 bg-slate-400/60 dark:bg-slate-500/60 backdrop-blur-sm rounded-full shadow-sm" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Floating List Button (Repositioned to left, above cards) */}
                <div className={cn(
                    "absolute left-4 z-50 transition-all duration-300",
                    showMobileMap ? "bottom-[115px]" : "bottom-[40px]",
                    "landscape:bottom-[100px] landscape:left-2"
                )}>
                    <button
                        onClick={handleBackToList}
                        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 font-bold text-[11px]"
                    >
                        <List size={14} />
                        List
                    </button>
                </div>
            </div>
        </div>
    );
}



export { SearchMapView };
