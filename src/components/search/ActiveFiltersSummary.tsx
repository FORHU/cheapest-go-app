"use client";

import React from 'react';
import { motion } from 'framer-motion';
import type { SearchFilters } from '@/stores/searchStore';

interface ActiveFiltersSummaryProps {
    filters: SearchFilters;
}

export const ActiveFiltersSummary = ({ filters }: ActiveFiltersSummaryProps) => {
    const { hotelName, starRating, minRating, minReviewsCount, facilities } = filters;
    const hasActiveFilters = hotelName || starRating.length > 0 || minRating > 0 ||
        minReviewsCount > 0 || facilities.length > 0;

    if (!hasActiveFilters) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
            <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">Active Filters:</p>
            <div className="flex flex-wrap gap-1">
                {hotelName && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded">
                        Name: {hotelName}
                    </span>
                )}
                {starRating.length > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded">
                        {starRating.join(', ')} stars
                    </span>
                )}
                {minRating > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded">
                        Rating: {minRating}+
                    </span>
                )}
                {minReviewsCount > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded">
                        {minReviewsCount}+ reviews
                    </span>
                )}
                {facilities.length > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded">
                        {facilities.length} amenities
                    </span>
                )}
            </div>
        </motion.div>
    );
};
