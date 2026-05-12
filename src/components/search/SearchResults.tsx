"use client";

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type Property } from '@/types';
import { PropertyCard } from '@/components/shared';
import { MapPin } from 'lucide-react';
import { cn, buildPropertySlug } from '@/lib/utils';
import CurrencySelector from '@/components/common/CurrencySelector';
import { useSearchStore } from '@/stores/searchStore';

const SORT_OPTIONS = ['recommended', 'price-low', 'price-high', 'rating', 'most-reviewed'] as const;
type SortValue = typeof SORT_OPTIONS[number];

const SORT_PILLS: { value: SortValue; label: string }[] = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'price-low', label: 'Cheapest' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'most-reviewed', label: 'Most Reviewed' },
    { value: 'price-high', label: 'Price: High to Low' },
];

// Match TGX board codes loosely so we handle whatever OTV returns
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

interface SearchResultsProps {
    initialProperties?: Property[];
    totalCount?: number;
    rawSearchParams?: Record<string, any>;
}

const SearchResultsContent = ({ initialProperties = [], totalCount: initialTotalCount = 0, rawSearchParams = {} }: SearchResultsProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const destination = searchParams?.get('destination') || '';

    const rawSort = searchParams?.get('sort');
    const initialSort: SortValue = SORT_OPTIONS.includes(rawSort as SortValue) ? (rawSort as SortValue) : 'recommended';
    const [sortBy, setSortBy] = useState<SortValue>(initialSort);

    // Client-side filters from the sidebar store
    const { filters } = useSearchStore();
    const { propertyTypes, boardTypes, refundable } = filters;

    const handleSortChange = useCallback((value: SortValue) => {
        setSortBy(value);
        const params = new URLSearchParams(window.location.search);
        if (value === 'recommended') params.delete('sort');
        else params.set('sort', value);
        window.history.replaceState(null, '', `?${params.toString()}`);
    }, []);

    const [allProperties, setAllProperties] = React.useState<Property[]>(initialProperties);
    const [totalCount, setTotalCount] = React.useState(initialTotalCount || initialProperties.length);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);

    const buildPropertyUrl = useCallback((property: Property) => {
        const params = new URLSearchParams(window.location.search);
        if (property.rateId) params.set('rateId', property.rateId);
        return `/property/${buildPropertySlug(property.name, property.id)}?${params.toString()}`;
    }, []);

    const handlePropertyClick = (property: Property) => {
        router.push(buildPropertyUrl(property));
    };

    const handlePropertyPrefetch = useCallback((property: Property) => {
        router.prefetch(buildPropertyUrl(property));
    }, [router, buildPropertyUrl]);

    // Navigate to map view
    const handleViewOnMap = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        params.set('view', 'map');
        router.push(`/search?${params.toString()}`);
    }, [router]);

    // Reset when search changes
    React.useEffect(() => {
        setAllProperties(initialProperties);
        setTotalCount(initialTotalCount || initialProperties.length);
    }, [destination, searchParams]);

    // Count mappable properties (from allProperties for the map button badge)
    const mappableCount = useMemo(
        () => allProperties.filter(
            (p) => p.coordinates && p.coordinates.lat !== 0 && p.coordinates.lng !== 0
        ).length,
        [allProperties]
    );

    // Filter and sort all loaded properties (client-side)
    const filteredProperties = useMemo(() => {
        let props = allProperties && allProperties.length > 0 ? [...allProperties] : [];

        // Property type
        if (propertyTypes.length > 0) {
            props = props.filter(p => propertyTypes.includes(p.type));
        }

        // Board / meal plan
        if (boardTypes.length > 0) {
            props = props.filter(p =>
                p.boardTypes && p.boardTypes.length > 0
                    ? matchesBoardType(p.boardTypes, boardTypes)
                    : boardTypes.includes('RO')
            );
        }

        // Refundable
        if (refundable === true) {
            props = props.filter(p => p.refundableTag === 'RFN');
        }

        // Sort
        if (sortBy === 'price-low') props.sort((a, b) => a.price - b.price);
        else if (sortBy === 'price-high') props.sort((a, b) => b.price - a.price);
        else if (sortBy === 'rating') props.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'most-reviewed') props.sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));

        return props;
    }, [allProperties, sortBy, propertyTypes, boardTypes, refundable]);

    const hasMore = allProperties.length < totalCount;

    const handleLoadMore = async () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        try {
            const res = await fetch('/api/search/more', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...rawSearchParams, offset: allProperties.length, limit: 10 }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data?.data && Array.isArray(data.data)) {
                    setAllProperties(prev => [...prev, ...data.data]);
                    if (data.totalCount) setTotalCount(data.totalCount);
                }
            }
        } catch (e) {
            console.error('[LoadMore] error:', e);
        } finally {
            setIsLoadingMore(false);
        }
    };

    return (
        <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3 md:mb-4">
                <div>
                    <h1 className="text-[14px] md:text-xl lg:text-2xl font-display font-bold text-slate-900 dark:text-white leading-tight">
                        {destination ? `Stays in ${destination}` : 'All properties'}
                    </h1>
                    <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {filteredProperties.length} properties found · Prices may change based on availability.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <CurrencySelector variant="pill" align="left" className="md:hidden" />
                    {mappableCount > 0 && (
                        <button
                            onClick={handleViewOnMap}
                            className="flex items-center gap-1 px-2.5 h-[28px] md:h-9 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] md:text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                            <MapPin size={12} />
                            <span className="hidden sm:inline">Map</span>
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{mappableCount}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Sort pills */}
            <div className="flex gap-1.5 flex-wrap mb-4 md:mb-5">
                {SORT_PILLS.map(pill => (
                    <button
                        key={pill.value}
                        onClick={() => handleSortChange(pill.value)}
                        className={cn(
                            "px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                            sortBy === pill.value
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500"
                        )}
                    >
                        {pill.label}
                    </button>
                ))}
            </div>

            {/* Property List */}
            {
                filteredProperties.length > 0 ? (
                    <div className="space-y-4">
                        {filteredProperties.map((property, index) => (
                            <div key={property.id} onMouseEnter={() => handlePropertyPrefetch(property)}>
                                <PropertyCard
                                    variant="horizontal"
                                    property={property}
                                    index={index}
                                    onClick={() => handlePropertyClick(property)}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4">
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                            {destination ? `No hotels found in ${destination}` : 'No properties found'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                            Our supplier may not cover this destination yet. Try different dates, adjust your filters, or search a nearby city.
                        </p>
                    </div>
                )
            }

            {/* Load More skeleton + button */}
            {
                filteredProperties.length > 0 && (
                    <div className="mt-4 md:mt-8">
                        {isLoadingMore && (
                            <div className="space-y-4 mb-4">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex gap-4 h-44 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-pulse">
                                        <div className="w-44 shrink-0 bg-slate-200 dark:bg-slate-700" />
                                        <div className="flex-1 py-4 pr-4 space-y-3">
                                            <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                                            <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded" />
                                            <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-center">
                            {hasMore ? (
                                <button
                                    onClick={handleLoadMore}
                                    disabled={isLoadingMore}
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold rounded-full transition-all active:scale-95 shadow-md shadow-blue-600/10"
                                >
                                    {isLoadingMore ? 'Loading...' : 'Load More Results'}
                                </button>
                            ) : (
                                <button className="px-4 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 text-[11px] font-medium rounded-full cursor-not-allowed opacity-50">
                                    End of results
                                </button>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Floating Map Toggle for Mobile - REMOVED */}
        </div >
    );
};

const SearchResults = ({ initialProperties = [], totalCount = 0, rawSearchParams = {} }: SearchResultsProps) => {
    return (
        <Suspense fallback={
            <div className="flex-1 min-w-0">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                    <div className="space-y-4 mt-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-48 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        }>
            <SearchResultsContent initialProperties={initialProperties} totalCount={totalCount} rawSearchParams={rawSearchParams} />
        </Suspense>
    );
};

export default SearchResults;
