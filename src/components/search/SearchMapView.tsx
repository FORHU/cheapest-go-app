'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPropertyCard } from '@/components/map/MapPropertyCard';
import { computeBounds } from '@/components/map/types';
import type { MappableProperty } from '@/components/map/types';
import type { Property } from '@/data/mockProperties';
import { ArrowLeft, MapPin, ChevronDown, List } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
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
        const params = new URLSearchParams(searchParams.toString());
        params.delete('view');
        router.push(`/search?${params.toString()}`);
    }, [router, searchParams]);

    const handleViewDetails = useCallback(
        (id: string) => {
            const params = new URLSearchParams(searchParams.toString());
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
            <div className="flex-shrink-0 h-12 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 z-10">
                <div className="max-w-[1400px] mx-auto px-6 h-full flex items-center gap-3">
                    <button
                        onClick={handleBackToList}
                        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={16} />
                        <span className="hidden sm:inline">Back to list</span>
                    </button>

                    <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

                    <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-blue-500" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {destination || 'Search results'}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            · {mappableProperties.length} on map
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

            {/* ── Split layout ── */}
            <div className="flex flex-1 min-h-0">
                {/* LEFT: Property list */}
                <div className="w-full lg:w-[calc(420px+max(0px,50vw-700px))] lg:pl-[max(0px,50vw-700px)] flex-shrink-0 h-full overflow-y-auto overscroll-contain bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
                    {sortedProperties.length > 0 ? (
                        sortedProperties.map((property) => (
                            <MapPropertyCard
                                key={property.id}
                                property={property}
                                isSelected={selectedId === property.id}
                                isHovered={hoveredId === property.id}
                                onSelect={handleCardSelect}
                                onHover={handleHover}
                            />
                        ))
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
                    className="hidden lg:block flex-1 h-full relative"
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
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 hover:bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-0.5 flex items-center gap-2 text-sm font-semibold backdrop-blur-sm"
                    >
                        <List size={18} />
                        Show List
                    </button>
                </div>
            </div>

            {/* Mobile: show map toggle FAB */}
            <MobileMapToggle
                properties={mappableProperties}
                selectedId={selectedId}
                onSelectId={setSelectedId}
                hoveredId={hoveredId}
                onHoverId={setHoveredId}
                onViewDetails={handleViewDetails}
            />
        </div>
    );
}

// ── Mobile full-screen map overlay ──────────────────────
function MobileMapToggle({
    properties,
    selectedId,
    onSelectId,
    hoveredId,
    onHoverId,
    onViewDetails,
}: {
    properties: MappableProperty[];
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    hoveredId: string | null;
    onHoverId: (id: string | null) => void;
    onViewDetails: (id: string) => void;
}) {
    const [showMobileMap, setShowMobileMap] = useState(false);

    if (properties.length === 0) return null;

    return (
        <>
            {/* FAB */}
            <button
                onClick={() => setShowMobileMap((prev) => !prev)}
                className="lg:hidden fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-xl shadow-blue-600/30 flex items-center gap-2 transition-colors cursor-pointer"
            >
                <MapPin size={16} />
                <span className="text-sm font-semibold">
                    {showMobileMap ? 'List' : 'Map'}
                </span>
            </button>

            {/* Full-screen mobile map */}
            {showMobileMap && (
                <div className="lg:hidden fixed inset-0 z-40 bg-white dark:bg-slate-950 flex flex-col">
                    <div className="relative flex-1">
                        <SearchMapContainer
                            properties={properties}
                            selectedId={selectedId}
                            onSelectId={onSelectId}
                            hoveredId={hoveredId}
                            onHoverId={onHoverId}
                            onViewDetails={onViewDetails}
                        />
                        <button
                            onClick={() => setShowMobileMap(false)}
                            className="absolute top-4 right-4 bg-white p-2 rounded-full shadow-md z-50 text-slate-800"
                        >
                            <ChevronDown className="rotate-180" size={20} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export { SearchMapView };
