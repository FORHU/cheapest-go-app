"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { SearchFilters } from '@/stores/searchStore';

interface ActiveFiltersSummaryProps {
    filters: SearchFilters;
}

export const ActiveFiltersSummary = ({ filters }: ActiveFiltersSummaryProps) => {
    const t = useTranslations('search');
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
            <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">{t('results.activeFilters')}</p>
            <div className="flex flex-wrap gap-1">
                {hotelName && chip(t('results.namePrefix', { name: hotelName }), 'name')}
                {starRating.length > 0 && chip(t('results.starSuffix', { stars: starRating.join(', ') }), 'stars')}
                {minRating > 0 && chip(t('results.ratingPrefix', { rating: minRating }), 'rating')}
                {minReviewsCount > 0 && chip(t('results.reviewsSuffix', { count: minReviewsCount }), 'reviews')}
                {facilities.length > 0 && chip(t('results.amenitiesSuffix', { count: facilities.length }), 'amenities')}
                {propertyTypes.map(propType => chip(propType.charAt(0).toUpperCase() + propType.slice(1), `pt-${propType}`))}
                {boardTypes.map(c => chip(t(`results.boardTypes.${c}`) || c, `bt-${c}`))}
                {refundable === true && chip(t('results.freeCancellation'), 'refundable')}
            </div>
        </motion.div>
    );
};
