"use client";

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Property } from '@/data/mockProperties';
import { PropertyCard } from '@/components/shared';
import { ChevronDown, MapPin } from 'lucide-react';

const SORT_OPTIONS = ['recommended', 'price-low', 'price-high', 'rating'] as const;
type SortValue = typeof SORT_OPTIONS[number];

interface SearchResultsProps {
    initialProperties?: Property[];
}

const SearchResultsContent = ({ initialProperties = [] }: SearchResultsProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const destination = searchParams.get('destination') || '';

    const rawSort = searchParams.get('sort');
    const sortBy: SortValue = SORT_OPTIONS.includes(rawSort as SortValue) ? (rawSort as SortValue) : 'recommended';

    const handleSortChange = useCallback((value: SortValue) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === 'recommended') {
            params.delete('sort');
        } else {
            params.set('sort', value);
        }
        router.replace(`?${params.toString()}`);
    }, [router, searchParams]);

    const [visibleCount, setVisibleCount] = useState(12);

    const handlePropertyClick = (propertyId: string) => {
        const currentParams = new URLSearchParams(searchParams.toString());
        router.push(`/property/${propertyId}?${currentParams.toString()}`);
    };

    // Navigate to map view
    const handleViewOnMap = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('view', 'map');
        router.push(`/search?${params.toString()}`);
    }, [router, searchParams]);

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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
                        {destination ? `Stays in ${destination}` : 'All properties'}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {filteredProperties.length} properties found · Prices may change based on availability.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Show on map button */}
                    {mappableCount > 0 && (
                        <button
                            onClick={handleViewOnMap}
                            className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                            <MapPin size={14} />
                            Show on map
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                                {mappableCount}
                            </span>
                        </button>
                    )}

                    {/* Sort dropdown */}
                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => handleSortChange(e.target.value as SortValue)}
                            className="appearance-none pl-4 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="recommended">Recommended</option>
                            <option value="price-low">Price: Low to High</option>
                            <option value="price-high">Price: High to Low</option>
                            <option value="rating">Highest Rated</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Property List */}
            {visibleProperties.length > 0 ? (
                <div className="space-y-4">
                    {visibleProperties.map((property, index) => (
                        <PropertyCard
                            key={property.id}
                            variant="horizontal"
                            property={property}
                            index={index}
                            onClick={() => handlePropertyClick(property.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">No properties found</h3>
                    <p className="text-slate-500 dark:text-slate-400">Try searching for "Baguio" to see results.</p>
                </div>
            )}

            {/* Pagination / Load More */}
            {filteredProperties.length > 0 && (
                <div className="mt-8 flex justify-center">
                    {hasMore ? (
                        <button
                            onClick={handleLoadMore}
                            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors shadow-lg shadow-blue-600/20"
                        >
                            Load More Results
                        </button>
                    ) : (
                        <button className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 font-medium rounded-full cursor-not-allowed opacity-50">
                            End of results
                        </button>
                    )}
                </div>
            )}
        </div>
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
