"use client";

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type Property } from '@/types';
import { PropertyCard } from '@/components/shared';
import { ChevronDown, MapPin, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CurrencySelector from '@/components/common/CurrencySelector';

const SORT_OPTIONS = ['recommended', 'price-low', 'price-high', 'rating'] as const;
type SortValue = typeof SORT_OPTIONS[number];

interface SearchResultsProps {
    initialProperties?: Property[];
}

const SearchResultsContent = ({ initialProperties = [] }: SearchResultsProps) => {
    const SORT_LABELS: Record<SortValue, string> = {
        'recommended': 'Recommended',
        'price-low': 'Price: Low to High',
        'price-high': 'Price: High to Low',
        'rating': 'Highest Rated'
    };

    const router = useRouter();
    const searchParams = useSearchParams();
    const destination = searchParams?.get('destination') || '';

    const rawSort = searchParams?.get('sort');
    const initialSort: SortValue = SORT_OPTIONS.includes(rawSort as SortValue) ? (rawSort as SortValue) : 'recommended';
    const [sortBy, setSortBy] = useState<SortValue>(initialSort);

    const handleSortChange = useCallback((value: SortValue) => {
        setSortBy(value);
        // Update URL without triggering a server navigation
        const params = new URLSearchParams(window.location.search);
        if (value === 'recommended') {
            params.delete('sort');
        } else {
            params.set('sort', value);
        }
        window.history.replaceState(null, '', `?${params.toString()}`);
    }, []);

    const [visibleCount, setVisibleCount] = useState(12);

    const buildPropertyUrl = useCallback((property: Property) => {
        const params = new URLSearchParams(window.location.search);
        if (property.rateId) params.set('rateId', property.rateId);
        return `/property/${property.id}?${params.toString()}`;
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

    // Filter and sort properties
    const filteredProperties = useMemo(() => {
        const props = initialProperties && initialProperties.length > 0 ? [...initialProperties] : [];

        if (sortBy === 'price-low') {
            props.sort((a, b) => a.price - b.price);
        } else if (sortBy === 'price-high') {
            props.sort((a, b) => b.price - a.price);
        } else if (sortBy === 'rating') {
            props.sort((a, b) => b.rating - a.rating);
        }

        return props;
    }, [initialProperties, sortBy]);

    // Count mappable properties
    const mappableCount = useMemo(
        () => filteredProperties.filter(
            (p) => p.coordinates && p.coordinates.lat !== 0 && p.coordinates.lng !== 0
        ).length,
        [filteredProperties]
    );

    // Reset visible count when filters/destination change
    React.useEffect(() => {
        setVisibleCount(12);
    }, [destination, searchParams]);

    // Show only visible properties
    const visibleProperties = filteredProperties.slice(0, visibleCount);
    const hasMore = visibleCount < filteredProperties.length;

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 12);
    };

    return (
        <div className="flex-1 min-w-0">
            {/* Header / sorting */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-6 relative z-20">
                <div>
                    <h1 className="text-[14px] md:text-xl lg:text-2xl font-display font-bold text-slate-900 dark:text-white leading-tight">
                        {destination ? `Stays in ${destination}` : 'All properties'}
                    </h1>
                    <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {filteredProperties.length} properties found · Prices may change based on availability.
                    </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end">
                    {/* Mobile Currency Selector */}
                    <CurrencySelector variant="pill" align="left" className="md:hidden" />

                    {/* Show on map button */}
                    {mappableCount > 0 && (
                        <button
                            onClick={handleViewOnMap}
                            className="flex items-center gap-1 px-2.5 h-[28px] md:h-10 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] md:text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                            <MapPin size={12} className="md:w-3.5 md:h-3.5" />
                            <span className="hidden sm:inline">Show on map</span>
                            <span className="sm:hidden">Map</span>
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                                {mappableCount}
                            </span>
                        </button>
                    )}

                    {/* Sort dropdown */}
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
                                    onClick={() => handleSortChange(opt)}
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

            {/* Property List */}
            {
                visibleProperties.length > 0 ? (
                    <div className="space-y-4">
                        {visibleProperties.map((property, index) => (
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
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No properties found</h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Try adjusting your filters or searching for a different destination.</p>
                    </div>
                )
            }

            {/* Pagination / Load More */}
            {
                filteredProperties.length > 0 && (
                    <div className="mt-4 md:mt-8 flex justify-center">
                        {hasMore ? (
                            <button
                                onClick={handleLoadMore}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-full transition-all active:scale-95 shadow-md shadow-blue-600/10"
                            >
                                Load More Results
                            </button>
                        ) : (
                            <button className="px-4 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 text-[11px] font-medium rounded-full cursor-not-allowed opacity-50">
                                End of results
                            </button>
                        )}
                    </div>
                )
            }

            {/* Floating Map Toggle for Mobile - REMOVED */}
        </div >
    );
};

const SearchResults = ({ initialProperties = [] }: SearchResultsProps) => {
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
            <SearchResultsContent initialProperties={initialProperties} />
        </Suspense>
    );
};

export default SearchResults;
