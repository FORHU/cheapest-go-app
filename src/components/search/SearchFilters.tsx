"use client";

import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, Map, RotateCcw } from 'lucide-react';
import {
    useSearchFilters,
    useSearchStore,
} from '@/stores/searchStore';


// LiteAPI Facility IDs (common ones)
const FACILITIES = [
    { id: 28, label: 'Free WiFi' },
    { id: 433, label: 'Swimming Pool' },
    { id: 107, label: 'Spa' },
    { id: 2, label: 'Parking' },
    { id: 7, label: 'Restaurant' },
    { id: 91, label: 'Fitness Center' },
    { id: 6, label: 'Room Service' },
    { id: 76, label: 'Airport Shuttle' },
    { id: 11, label: 'Breakfast Included' },
    { id: 5, label: 'Air Conditioning' },
    { id: 25, label: 'Pet Friendly' },
    { id: 46, label: 'Business Center' },
];

const STAR_RATINGS = [5, 4, 3, 2, 1];

const GUEST_RATING_OPTIONS = [
    { value: 0, label: 'Any' },
    { value: 9, label: 'Excellent 9+' },
    { value: 8, label: 'Very Good 8+' },
    { value: 7, label: 'Good 7+' },
    { value: 6, label: 'Pleasant 6+' },
];

const REVIEW_COUNT_OPTIONS = [
    { value: 0, label: 'Any' },
    { value: 10, label: '10+ reviews' },
    { value: 50, label: '50+ reviews' },
    { value: 100, label: '100+ reviews' },
    { value: 500, label: '500+ reviews' },
];

interface FilterSectionProps {
    title: string;
    children: React.ReactNode;
    index?: number;
}

const FilterSection = ({ title, children, index = 0 }: FilterSectionProps) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay: index * 0.05, duration: 0.4 }}
        className="border-b border-slate-200 dark:border-white/5 py-4 last:border-0"
    >
        <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">{title}</h4>
        <div className="space-y-2">
            {children}
        </div>
    </motion.div>
);

interface CheckboxItemProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const CheckboxItem = ({ label, checked, onChange }: CheckboxItemProps) => (
    <label className="flex items-center gap-3 cursor-pointer group mb-2 last:mb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded transition-colors">
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex-1">
            {label}
        </span>
    </label>
);

interface RadioItemProps {
    name: string;
    label: string;
    checked: boolean;
    onChange: () => void;
}

const RadioItem = ({ name, label, checked, onChange }: RadioItemProps) => (
    <label className="flex items-center gap-3 cursor-pointer group mb-2 last:mb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded transition-colors">
        <input
            type="radio"
            name={name}
            checked={checked}
            onChange={onChange}
            className="w-4 h-4 border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex-1">
            {label}
        </span>
    </label>
);

const SearchFilters = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const initializedRef = useRef(false);

    // Use Zustand store instead of useState - prevents re-renders
    const filters = useSearchFilters();
    const { setFilters, toggleStarRating, toggleFacility, resetFilters } = useSearchStore();

    // Destructure for cleaner access
    const { hotelName, starRating, minRating, minReviewsCount, facilities, strictFacilityFiltering } = filters;

    // Initialize filters from URL params on mount (only once)
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const urlFilters = {
            hotelName: searchParams.get('hotelName') || '',
            starRating: searchParams.get('starRating')?.split(',').map(Number).filter(n => !isNaN(n)) || [],
            minRating: Number(searchParams.get('minRating')) || 0,
            minReviewsCount: Number(searchParams.get('minReviewsCount')) || 0,
            facilities: searchParams.get('facilities')?.split(',').map(Number).filter(n => !isNaN(n)) || [],
            strictFacilityFiltering: searchParams.get('strictFacilityFiltering') === 'true',
        };
        setFilters(urlFilters);
    }, [searchParams, setFilters]);

    // URL update helper
    const updateURL = useCallback((params: Record<string, string | null>) => {
        const current = new URLSearchParams(searchParams.toString());

        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === '' || value === '0') {
                current.delete(key);
            } else {
                current.set(key, value);
            }
        });

        router.push(`/search?${current.toString()}`);
    }, [router, searchParams]);

    // Handle hotel name search with debounce using ref (no useState for timeout)
    const handleHotelNameChange = useCallback((value: string) => {
        setFilters({ hotelName: value });

        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Set new timeout for debounced search
        searchTimeoutRef.current = setTimeout(() => {
            updateURL({ hotelName: value || null });
        }, 500);
    }, [setFilters, updateURL]);

    // Handle star rating toggle
    const handleStarRatingToggle = useCallback((star: number) => {
        toggleStarRating(star);
        const newRatings = starRating.includes(star)
            ? starRating.filter(s => s !== star)
            : [...starRating, star].sort((a, b) => b - a);
        updateURL({ starRating: newRatings.length > 0 ? newRatings.join(',') : null });
    }, [toggleStarRating, starRating, updateURL]);

    // Handle guest rating change
    const handleMinRatingChange = useCallback((value: number) => {
        setFilters({ minRating: value });
        updateURL({ minRating: value > 0 ? String(value) : null });
    }, [setFilters, updateURL]);

    // Handle review count change
    const handleMinReviewsCountChange = useCallback((value: number) => {
        setFilters({ minReviewsCount: value });
        updateURL({ minReviewsCount: value > 0 ? String(value) : null });
    }, [setFilters, updateURL]);

    // Handle facility toggle
    const handleFacilityToggle = useCallback((facilityId: number) => {
        toggleFacility(facilityId);
        const newFacilities = facilities.includes(facilityId)
            ? facilities.filter(f => f !== facilityId)
            : [...facilities, facilityId];
        updateURL({ facilities: newFacilities.length > 0 ? newFacilities.join(',') : null });
    }, [toggleFacility, facilities, updateURL]);

    // Handle strict facility filtering
    const handleStrictFilteringToggle = useCallback((checked: boolean) => {
        setFilters({ strictFacilityFiltering: checked });
        updateURL({ strictFacilityFiltering: checked ? 'true' : null });
    }, [setFilters, updateURL]);

    // Reset all filters
    const handleResetFilters = useCallback(() => {
        resetFilters();

        // Preserve non-filter params (destination, dates, etc.)
        const current = new URLSearchParams(searchParams.toString());
        ['hotelName', 'starRating', 'minRating', 'minReviewsCount', 'facilities', 'strictFacilityFiltering'].forEach(key => {
            current.delete(key);
        });

        router.push(`/search?${current.toString()}`);
    }, [resetFilters, searchParams, router]);

    // Check if any filters are active
    const hasActiveFilters = hotelName || starRating.length > 0 || minRating > 0 ||
        minReviewsCount > 0 || facilities.length > 0;

    return (
        <div className="w-full flex-shrink-0 lg:w-[280px] space-y-4">
            {/* Map Preview */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5 }}
                className="relative h-32 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 group cursor-pointer mb-6"
            >
                <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    <Map className="text-slate-400" />
                </div>
                <button className="absolute inset-0 m-auto w-max h-max bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 opacity-90 hover:opacity-100 hover:scale-105 transition-all">
                    View on map
                </button>
            </motion.div>

            {/* Header with Reset */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.4 }}
                className="pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"
            >
                <h3 className="font-display font-bold text-slate-900 dark:text-white">Filter by</h3>
                {hasActiveFilters && (
                    <button
                        onClick={handleResetFilters}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                    >
                        <RotateCcw size={14} />
                        Reset
                    </button>
                )}
            </motion.div>

            {/* Search by Property Name */}
            <div className="py-4 border-b border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">Search by property name</h4>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                        type="text"
                        value={hotelName}
                        onChange={(e) => handleHotelNameChange(e.target.value)}
                        placeholder="e.g. Marriott"
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>
            </div>

            {/* Star Rating */}
            <FilterSection title="Star rating" index={1}>
                <div className="flex flex-col gap-1">
                    {STAR_RATINGS.map(star => (
                        <CheckboxItem
                            key={star}
                            label={`${star} star${star !== 1 ? 's' : ''}`}
                            checked={starRating.includes(star)}
                            onChange={() => handleStarRatingToggle(star)}
                        />
                    ))}
                </div>
            </FilterSection>

            {/* Guest Rating (minRating) */}
            <FilterSection title="Guest rating" index={2}>
                {GUEST_RATING_OPTIONS.map(option => (
                    <RadioItem
                        key={option.value}
                        name="minRating"
                        label={option.label}
                        checked={minRating === option.value}
                        onChange={() => handleMinRatingChange(option.value)}
                    />
                ))}
            </FilterSection>

            {/* Minimum Reviews */}
            <FilterSection title="Minimum reviews" index={3}>
                {REVIEW_COUNT_OPTIONS.map(option => (
                    <RadioItem
                        key={option.value}
                        name="minReviewsCount"
                        label={option.label}
                        checked={minReviewsCount === option.value}
                        onChange={() => handleMinReviewsCountChange(option.value)}
                    />
                ))}
            </FilterSection>

            {/* Facilities/Amenities */}
            <FilterSection title="Amenities" index={4}>
                <div className="flex flex-col gap-1">
                    {FACILITIES.map(facility => (
                        <CheckboxItem
                            key={facility.id}
                            label={facility.label}
                            checked={facilities.includes(facility.id)}
                            onChange={() => handleFacilityToggle(facility.id)}
                        />
                    ))}
                </div>

                {/* Strict Filtering Option - only show when multiple facilities selected */}
                {facilities.length > 1 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <CheckboxItem
                            label="Must have ALL selected amenities"
                            checked={strictFacilityFiltering}
                            onChange={handleStrictFilteringToggle}
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-7">
                            When enabled, only shows hotels with every selected amenity
                        </p>
                    </div>
                )}
            </FilterSection>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
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
            )}
        </div>
    );
};

export default SearchFilters;
