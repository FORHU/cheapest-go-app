"use client";

import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Property, baguioProperties } from '@/data/mockProperties';
import PropertyCard from './PropertyCard';
import { ChevronDown, ArrowUpDown } from 'lucide-react';

const SearchResults = () => {
    const searchParams = useSearchParams();
    const destination = searchParams.get('destination') || '';
    const [sortBy, setSortBy] = useState('recommended');

    // Filter properties based on search params (Mock implementation)
    const filteredProperties = useMemo(() => {
        if (!destination) return baguioProperties;

        // For now, if destination contains "Baguio" (case insensitive), show our mock data.
        // Otherwise, maybe show empty or all for demo purposes.
        if (destination.toLowerCase().includes('baguio')) {
            return baguioProperties;
        }

        // Return empty or filtered list for other locations if we had data
        return [];
    }, [destination]);

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
            {filteredProperties.length > 0 ? (
                <div className="space-y-4">
                    {filteredProperties.map((property, index) => (
                        <PropertyCard key={property.id} property={property} index={index} />
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
                    <button className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium rounded-full cursor-not-allowed opacity-50">
                        End of results
                    </button>
                </div>
            )}
        </div>
    );
};

export default SearchResults;
