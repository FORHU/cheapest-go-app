"use client";

import React from 'react';
import { motion } from 'framer-motion';
import type { SearchFilters } from '@/stores/searchStore';

interface ActiveFiltersSummaryProps {
    filters: SearchFilters;
}

const BOARD_LABELS: Record<string, string> = {
    RO: 'Room Only', BB: 'Breakfast', HB: 'Half Board', FB: 'Full Board', AI: 'All Inclusive',
};

export const ActiveFiltersSummary = ({ filters }: ActiveFiltersSummaryProps) => {
    const { hotelName, starRating, minRating, minReviewsCount, facilities, propertyTypes, boardTypes, refundable } = filters;
    const hasActiveFilters = hotelName || starRating.length > 0 || minRating > 0 ||
        minReviewsCount > 0 || facilities.length > 0 ||
        propertyTypes.length > 0 || boardTypes.length > 0 || refundable !== null;

    if (!hasActiveFilters) return null;

    const chip = (label: string, key: string) => (
        <span key={key} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded">
            {label}
        </span>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
            <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">Active Filters:</p>
            <div className="flex flex-wrap gap-1">
                {hotelName && chip(`Name: ${hotelName}`, 'name')}
                {starRating.length > 0 && chip(`${starRating.join(', ')} stars`, 'stars')}
                {minRating > 0 && chip(`Rating ${minRating}+`, 'rating')}
                {minReviewsCount > 0 && chip(`${minReviewsCount}+ reviews`, 'reviews')}
                {facilities.length > 0 && chip(`${facilities.length} amenities`, 'amenities')}
                {propertyTypes.map(t => chip(t.charAt(0).toUpperCase() + t.slice(1), `pt-${t}`))}
                {boardTypes.map(c => chip(BOARD_LABELS[c] ?? c, `bt-${c}`))}
                {refundable === true && chip('Free cancellation', 'refundable')}
            </div>
        </motion.div>
    );
};
