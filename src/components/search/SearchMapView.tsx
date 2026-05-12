'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MapPropertyCard } from '@/components/map/MapPropertyCard';
import type { MappableProperty } from '@/components/map/types';
import { type Property } from '@/types';
import { ArrowLeft, MapPin, List, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn, buildPropertySlug } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency, useSearchStore, useSearchFilters } from '@/stores/searchStore';
import CurrencySelector from '@/components/common/CurrencySelector';

const SearchMapContainer = dynamic(
    () => import('../mapbox/SearchMapContainer').then(m => ({ default: m.SearchMapContainer })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 h-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        ),
    }
);

// ── Sort ────────────────────────────────────────────────
const SORT_PILLS = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'price-low',   label: 'Cheapest' },
    { value: 'rating',      label: 'Top Rated' },
    { value: 'most-reviewed', label: 'Most Reviewed' },
    { value: 'price-high',  label: 'Price: High to Low' },
] as const;
type SortValue = typeof SORT_PILLS[number]['value'];

// ── Board-type loose matcher (reused from SearchResults) ─
function matchesBoardType(hotelBoardTypes: string[], selected: string[]): boolean {
    return hotelBoardTypes.some(bt => {
        const lower = bt.toLowerCase();
        return selected.some(code => {
            if (code === 'RO') return lower === 'ro' || (lower.includes('room') && lower.includes('only'));
            if (code === 'BB') return lower === 'bb' || lower.includes('breakfast');
            if (code === 'HB') return lower === 'hb' || lower.includes('half');
            if (code === 'FB') return lower === 'fb' || lower.includes('full board');
            if (code === 'AI') return lower === 'ai' || lower.includes('all inclusive') || lower.includes('all-inclusive');
            return lower === code.toLowerCase();
        });
    });
}

const PROPERTY_TYPE_OPTIONS = [
    { value: 'hotel',     label: 'Hotel' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'resort',    label: 'Resort' },
    { value: 'villa',     label: 'Villa' },
];
const BOARD_TYPE_OPTIONS = [
    { code: 'RO', label: 'Room Only' },
    { code: 'BB', label: 'Breakfast Included' },
    { code: 'HB', label: 'Half Board' },
    { code: 'FB', label: 'Full Board' },
    { code: 'AI', label: 'All Inclusive' },
];

// Fallback coordinates when a search returns 0 mappable results.
// Keyed by lowercase city/country name (partial prefix match).
const CITY_COORDS: Record<string, [number, number]> = {
    tokyo: [139.6917, 35.6895],
    osaka: [135.5023, 34.6937],
    kyoto: [135.7681, 35.0116],
    sapporo: [141.3469, 43.0618],
    fukuoka: [130.4017, 33.5904],
    hiroshima: [132.4553, 34.3963],
    seoul: [126.9780, 37.5665],
    busan: [129.0756, 35.1796],
    jeju: [126.5312, 33.4996],
    bangkok: [100.5018, 13.7563],
    phuket: [98.3923, 7.8804],
    'chiang mai': [98.9853, 18.7883],
    singapore: [103.8198, 1.3521],
    'kuala lumpur': [101.6869, 3.1390],
    bali: [115.1889, -8.4095],
    jakarta: [106.8456, -6.2088],
    'hong kong': [114.1694, 22.3193],
    taipei: [121.5654, 25.0330],
    beijing: [116.4074, 39.9042],
    shanghai: [121.4737, 31.2304],
    dubai: [55.2708, 25.2048],
    istanbul: [28.9784, 41.0082],
    delhi: [77.1025, 28.7041],
    mumbai: [72.8777, 19.0760],
    london: [-0.1278, 51.5074],
    paris: [2.3522, 48.8566],
    amsterdam: [4.9041, 52.3676],
    barcelona: [2.1734, 41.3851],
    rome: [12.4964, 41.9028],
    'new york': [-74.0059, 40.7128],
    'los angeles': [-118.2437, 34.0522],
    sydney: [151.2093, -33.8688],
    manila: [120.9842, 14.5995],
    baguio: [120.5960, 16.4023],
    cebu: [123.8854, 10.3157],
};

function getDestinationCoords(destination: string): { lng: number; lat: number } | null {
    const key = destination.toLowerCase().trim();
    if (CITY_COORDS[key]) {
        const [lng, lat] = CITY_COORDS[key];
        return { lng, lat };
    }
    // Prefix match (e.g. "Tokyo, Japan" → "tokyo")
    for (const [city, [lng, lat]] of Object.entries(CITY_COORDS)) {
        if (key.startsWith(city) || city.startsWith(key.split(',')[0].trim().toLowerCase())) {
            return { lng, lat };
        }
    }
    return null;
}

interface SearchMapViewProps {
    properties: Property[];
    destination?: string;
    totalCount?: number;
    allMappable?: any[];
    rawSearchParams?: Record<string, any>;
    isStreaming?: boolean;
}

/**
 * Full-page Agoda-style split map layout.
 *
 * LEFT  — scrollable property card list with sort + filter controls
 * RIGHT — sticky Mapbox map, full viewport height
 */
function SearchMapView({
    properties,
    destination,
    totalCount: initialTotalCount = 0,
    allMappable = [],
    rawSearchParams = {},
    isStreaming = false,
}: SearchMapViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // State — seed from properties, padded with any allMappable hotels not already present
    // (allMappable may contain more hotels than properties when the server cache is stale)
    const [allProperties, setAllProperties] = React.useState<Property[]>(() => {
        const ids = new Set(properties.map(p => p.id));
        const extra = allMappable
            .filter((m: any) => m.name && m.price > 0 && !ids.has(m.id ?? m.hotelId))
            .map((m: any): Property => ({
                id: m.id ?? m.hotelId,
                name: m.name,
                price: m.price,
                currency: m.currency || 'USD',
                image: m.image || '',
                images: m.image ? [m.image] : [],
                coordinates: m.coordinates || { lat: 0, lng: 0 },
                rating: m.rating || 0,
                reviews: 0,
                location: '',
                description: '',
                amenities: [],
                badges: [],
                type: 'hotel',
                boardTypes: [],
                city: '',
            }));
        return [...properties, ...extra];
    });
    const [totalCount, setTotalCount] = React.useState(initialTotalCount || properties.length);

    // Sync streaming hotel updates: parent appends new properties — merge into local state
    React.useEffect(() => {
        if (properties.length === 0) return;
        setAllProperties(prev => {
            const existingIds = new Set(prev.map((p: any) => p.id ?? p.hotelId));
            const newOnes = properties.filter(p => !existingIds.has(p.id));
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
    }, [properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep totalCount in sync with parent (grows as streaming completes)
    React.useEffect(() => {
        if (initialTotalCount > 0) setTotalCount(prev => Math.max(prev, initialTotalCount));
    }, [initialTotalCount]);

    // ── Client-side display pagination ───────────────────────────
    const LIST_PAGE_SIZE = 15;
    const [displayCount, setDisplayCount] = useState(LIST_PAGE_SIZE);
    const searchKey = JSON.stringify(rawSearchParams);
    React.useEffect(() => { setDisplayCount(LIST_PAGE_SIZE); }, [searchKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortValue>('recommended');
    const [showMobileMap, setShowMobileMap] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const targetCurrency = useUserCurrency();

    // Shared filter state from sidebar store
    const filters = useSearchFilters();
    const { togglePropertyType, toggleBoardType, setRefundable, resetFilters } = useSearchStore();
    const { propertyTypes, boardTypes, refundable } = filters;

    const activeFilterCount = propertyTypes.length + boardTypes.length + (refundable !== null ? 1 : 0);

    // ── Map Pins ─────────────────────────────────────────────
    // Use allMappable (the 151 basic objects) if provided, otherwise allProperties
    const mappableProperties = useMemo<MappableProperty[]>(() => {
        const source = allMappable.length > 0 ? allMappable : allProperties;
        const filtered = source
            .filter(
                (p: any): p is MappableProperty =>
                    p.coordinates != null &&
                    typeof p.coordinates.lat === 'number' &&
                    typeof p.coordinates.lng === 'number' &&
                    p.coordinates.lat !== 0 &&
                    p.coordinates.lng !== 0
            )
            .map((p: any) => ({
                ...p,
                id: p.id || p.hotelId,
                location: p.location || '',
                image: p.image || '',
                rating: p.rating || 0,
                reviews: p.reviews || 0,
                price: p.price || 0,
                currency: p.currency || 'USD',
            }));

        // Deduplicate by proximity — TGX and ETG can both return the same hotel.
        // If two pins are within ~100m (0.001°), keep the lower-price entry.
        const PROX_DEG = 0.001;
        const unique: MappableProperty[] = [];
        for (const pin of filtered) {
            const dupeIdx = unique.findIndex(
                u =>
                    Math.abs(u.coordinates.lat - pin.coordinates.lat) < PROX_DEG &&
                    Math.abs(u.coordinates.lng - pin.coordinates.lng) < PROX_DEG
            );
            if (dupeIdx !== -1) {
                if (pin.price < unique[dupeIdx].price) unique[dupeIdx] = pin;
            } else {
                unique.push(pin);
            }
        }
        return unique;
    }, [allMappable, allProperties]);

    // Apply client-side filters + sort to ALL loaded properties (includes Load More results)
    const sortedProperties = useMemo(() => {
        let list = allProperties.filter((p: any) => p.name && p.price > 0);

        if (propertyTypes.length > 0) {
            list = list.filter((p: any) => propertyTypes.includes(p.type));
        }
        if (boardTypes.length > 0) {
            list = list.filter((p: any) =>
                p.boardTypes && p.boardTypes.length > 0
                    ? matchesBoardType(p.boardTypes, boardTypes)
                    : boardTypes.includes('RO')
            );
        }
        if (refundable === true) {
            list = list.filter((p: any) => p.refundableTag === 'RFN');
        }

        if (sortBy === 'price-low') list.sort((a: any, b: any) => a.price - b.price);
        else if (sortBy === 'price-high') list.sort((a: any, b: any) => b.price - a.price);
        else if (sortBy === 'rating') list.sort((a: any, b: any) => b.rating - a.rating);
        else if (sortBy === 'most-reviewed') list.sort((a: any, b: any) => (b.reviews ?? 0) - (a.reviews ?? 0));

        return list;
    }, [allProperties, sortBy, propertyTypes, boardTypes, refundable]);

    // Client-side display pagination — all hotels are already in sortedProperties from streaming
    const canLoadMore = displayCount < sortedProperties.length;
    const handleShowMore = useCallback(() => setDisplayCount(prev => prev + LIST_PAGE_SIZE), []);
    const visibleProperties = useMemo(
        () => sortedProperties.slice(0, displayCount),
        [sortedProperties, displayCount]
    );

    // When no results, fall back to the searched destination's known coordinates
    const fallbackCoords = useMemo(() => {
        if (mappableProperties.length > 0) return null;
        return destination ? getDestinationCoords(destination) : null;
    }, [mappableProperties.length, destination]);

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
            const slug = prop ? buildPropertySlug(prop.name, id) : id;
            router.push(`/property/${slug}?${params.toString()}`);
        },
        [router, searchParams, properties]
    );

    const handleCardSelect = useCallback(
        (id: string) => {
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
    // Show all sorted properties in sidebar — Load More appends via API
    // Filter panel (shared between desktop list and mobile)
    const filterPanel = (
        <AnimatePresence>
            {showFilters && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                >
                    <div className="max-w-[1400px] mx-auto px-4 py-3 flex flex-wrap gap-6">
                        {/* Property Type */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Property Type</p>
                            <div className="flex flex-wrap gap-1.5">
                                {PROPERTY_TYPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => togglePropertyType(opt.value)}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                                            propertyTypes.includes(opt.value)
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Meal Plan */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Meal Plan</p>
                            <div className="flex flex-wrap gap-1.5">
                                {BOARD_TYPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.code}
                                        onClick={() => toggleBoardType(opt.code)}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                                            boardTypes.includes(opt.code)
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cancellation */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Cancellation</p>
                            <div className="flex gap-1.5">
                                {[{ v: null, l: 'Any' }, { v: true, l: 'Free cancellation' }].map(({ v, l }) => (
                                    <button
                                        key={String(v)}
                                        onClick={() => setRefundable(v as boolean | null)}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                                            refundable === v
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                        )}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeFilterCount > 0 && (
                            <div className="flex items-end">
                                <button
                                    onClick={() => resetFilters()}
                                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                                >
                                    Clear filters
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div className="flex flex-col h-full w-full">
            {/* ── Top bar ── */}
            <div className="shrink-0 bg-white dark:bg-slate-950 z-30 relative border-b border-slate-100 dark:border-slate-800/60 landscape-compact-topbar p-[10px]">
                <div className="max-w-[1400px] mx-auto px-3 flex items-center gap-2">
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
                        <span className="text-sm md:text-base font-semibold text-slate-900 dark:text-white truncate max-w-[100px] sm:max-w-[200px]">
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
                        <CurrencySelector variant="pill" align="right" className="sm:hidden" />

                        {/* Sort pills — scrollable on small screens */}
                        <div className="hidden sm:flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                            {SORT_PILLS.map(pill => (
                                <button
                                    key={pill.value}
                                    onClick={() => setSortBy(pill.value)}
                                    className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[10px] md:text-[11px] font-semibold border whitespace-nowrap transition-colors cursor-pointer",
                                        sortBy === pill.value
                                            ? "bg-blue-600 text-white border-blue-600"
                                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                    )}
                                >
                                    {pill.label}
                                </button>
                            ))}
                        </div>

                        {/* Filter toggle button */}
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={cn(
                                "flex items-center gap-1 px-2.5 h-[24px] md:h-8 rounded-full border text-[10px] md:text-[11px] font-bold transition-colors cursor-pointer",
                                showFilters || activeFilterCount > 0
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                            )}
                        >
                            <SlidersHorizontal size={12} />
                            <span className="hidden sm:inline">Filters</span>
                            {activeFilterCount > 0 && (
                                <span className={cn(
                                    "w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center",
                                    showFilters || activeFilterCount > 0 ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                                )}>{activeFilterCount}</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Filter panel (below top bar) ── */}
            {filterPanel}

            {/* ── Desktop Split layout ── */}
            <div className="hidden lg:flex flex-1 min-h-0 relative gap-4 p-4">
                {/* LEFT: Property list — outer wrapper does NOT scroll; inner list does */}
                <div className="w-[420px] xl:w-[calc(420px+max(0px,50vw-700px))] xl:pl-[max(0px,50vw-700px)] shrink-0 h-full flex flex-col">
                    {sortedProperties.length > 0 ? (
                        <>
                            {/* Scrollable hotel cards — scrollbar hidden so it doesn't steal width from cards */}
                            <div className="flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {visibleProperties.map((property) => (
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
                            {/* Sticky pagination footer — always visible, never scrolls */}
                            <div className="shrink-0 py-3 px-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
                                {canLoadMore ? (
                                    <button
                                        onClick={handleShowMore}
                                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-full transition-all active:scale-95 cursor-pointer"
                                    >
                                        Load More · showing {displayCount} of {sortedProperties.length}
                                    </button>
                                ) : isStreaming ? (
                                    <div className="flex items-center justify-center gap-2 py-1 text-[10px] text-slate-500 dark:text-slate-400">
                                        <span className="w-3 h-3 rounded-full border-[1.5px] border-blue-500 border-t-transparent animate-spin shrink-0" />
                                        Loading more hotels…
                                    </div>
                                ) : (
                                    <p className="text-center text-[10px] text-slate-400 font-medium">All {sortedProperties.length} results loaded</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                            <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                No hotels available{destination ? ` in ${destination}` : ''}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[220px]">
                                Our current supplier may not cover this destination yet. Try different dates or a nearby city.
                            </p>
                        </div>
                    )}
                </div>

                {/* RIGHT: Map */}
                <div
                    className="flex-1 h-full relative rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
                    style={{ marginRight: 'max(0px, calc((100vw - 1400px) / 2))' }}
                >
                    <SearchMapContainer
                        properties={sortedProperties}
                        selectedId={selectedId}
                        onSelectId={setSelectedId}
                        hoveredId={hoveredId}
                        onHoverId={setHoveredId}
                        onViewDetails={handleViewDetails}
                        searchOverlayClassName="absolute top-4 left-20 z-20 w-[300px] md:w-[360px]"
                        defaultCenter={fallbackCoords ?? undefined}
                    />

                    {/* Property count badge — shows server-side total, not just loaded count */}
                    <div className="absolute bottom-10 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 z-10">
                        {activeFilterCount > 0
                            ? `${sortedProperties.length} of ${totalCount} (filtered)`
                            : `${totalCount} properties`
                        }
                    </div>

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
                    defaultCenter={fallbackCoords ?? undefined}
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
                            onDragEnd={(_, info) => {
                                if (info.offset.y > 40) {
                                    setShowMobileMap(false);
                                }
                            }}
                            className="absolute bottom-[58px] left-0 right-0 w-full z-20"
                        >
                            <div className="w-full overflow-x-auto pb-2 pt-2 px-3 snap-x snap-mandatory flex gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {sortedProperties.map((property) => (
                                    <div key={property.id} className="snap-center shrink-0 w-[70vw] sm:w-[260px] landscape:w-[240px] shadow-lg rounded-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
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
                            className="absolute bottom-[80px] left-0 right-0 h-10 z-20 flex justify-center items-center cursor-grab active:cursor-grabbing"
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={0.2}
                            dragDirectionLock
                            onDragEnd={(_, info) => {
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
                    showMobileMap ? "bottom-[168px]" : "bottom-[80px]",
                    "landscape:bottom-[100px] landscape:left-2"
                )}>
                    <button
                        onClick={handleBackToList}
                        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 font-bold text-[11px]"
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
