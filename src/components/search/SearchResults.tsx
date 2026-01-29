"use client";

import React, { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Property, baguioProperties } from '@/data/mockProperties';
import { PropertyCard } from '@/components/shared';
import { ChevronDown, ArrowUpDown } from 'lucide-react';

interface SearchResultsProps {
    initialProperties?: Property[];
}

const SearchResultsContent = ({ initialProperties = [] }: SearchResultsProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const destination = searchParams.get('destination') || '';
    const [sortBy, setSortBy] = useState('recommended');
    const [visibleCount, setVisibleCount] = useState(12);

    const handlePropertyClick = (propertyId: string) => {
        const currentParams = new URLSearchParams(searchParams.toString());
        router.push(`/property/${propertyId}?${currentParams.toString()}`);
    };

    // Filter properties based on search params
    const filteredProperties = useMemo(() => {
        // If we have initialProperties passed from server, use them
        if (initialProperties && initialProperties.length > 0) {
            return initialProperties;
        }

        return [];
    }, [initialProperties]);

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
                    <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                        {destination ? `Stays in ${destination}` : 'All properties'}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {filteredProperties.length} properties found · Prices may change based on availability.
                    </p>
                </div>

                <div className="relative group">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400">Sort by:</span>
                        <span className="text-slate-900 dark:text-white capitalize">{sortBy}</span>
                        <ChevronDown size={14} className="text-slate-400" />
                    </button>
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
