"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Map as MapIcon, RotateCcw, X } from 'lucide-react';
import { useSearchFilters, useSearchStore } from '@/stores/searchStore';
import { STAR_RATINGS, GUEST_RATING_OPTIONS, REVIEW_COUNT_OPTIONS, FACILITIES } from '@/lib/constants';
import { FilterSection } from './FilterSection';
import { CheckboxItem } from './CheckboxItem';
import { RadioItem } from './RadioItem';
import { ActiveFiltersSummary } from './ActiveFiltersSummary';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface SearchFiltersProps {
    initialFacilities?: Array<{ id: number; name: string }>;
    previewCoordinates?: { lat: number; lng: number } | null;
}

const SearchFilters = ({ initialFacilities, previewCoordinates }: SearchFiltersProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const initializedRef = useRef(false);

    // Use server-prefetched facilities, fall back to hardcoded constants
    const facilityOptions = useMemo(() => {
        const list = initialFacilities && initialFacilities.length > 0
            ? initialFacilities
            : FACILITIES.map(f => ({ id: f.id, name: f.label }));
        const seen = new Set<number>();
        const unique: Array<{ id: number; name: string }> = [];
        for (const facility of list) {
            const id = Number(facility.id);
            const name = facility.name;
            if (!Number.isFinite(id) || !name) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            unique.push({ id, name });
        }
        return unique;
    }, [initialFacilities]);
    const filters = useSearchFilters();
    const { setFilters, toggleStarRating, toggleFacility, resetFilters, isMobileFiltersOpen, setIsMobileFiltersOpen } = useSearchStore();
    useBodyScrollLock(isMobileFiltersOpen);
    const { hotelName, starRating, minRating, minReviewsCount, facilities, strictFacilityFiltering } = filters;

    // Initialize filters from URL params on mount (only once)
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const urlFilters = {
            hotelName: searchParams?.get('hotelName') || '',
            starRating: searchParams?.get('starRating')?.split(',').map(Number).filter(n => !isNaN(n)) || [],
            minRating: Number(searchParams?.get('minRating')) || 0,
            minReviewsCount: Number(searchParams?.get('minReviewsCount')) || 0,
            facilities: searchParams?.get('facilities')?.split(',').map(Number).filter(n => !isNaN(n)) || [],
            strictFacilityFiltering: searchParams?.get('strictFacilityFiltering') === 'true',
        };
        setFilters(urlFilters);
    }, [searchParams, setFilters]);

    // URL update helper
    const updateURL = useCallback((params: Record<string, string | null>) => {
        const current = new URLSearchParams(searchParams?.toString() || '');
        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === '' || value === '0') {
                current.delete(key);
            } else {
                current.set(key, value);
            }
        });
        router.push(`/search?${current.toString()}`);
    }, [router, searchParams]);

    // Debounced hotel name search
    const handleHotelNameChange = useCallback((value: string) => {
        setFilters({ hotelName: value });
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            updateURL({ hotelName: value || null });
        }, 500);
    }, [setFilters, updateURL]);

    const handleStarRatingToggle = useCallback((star: number) => {
        toggleStarRating(star);
        const newRatings = starRating.includes(star)
            ? starRating.filter(s => s !== star)
            : [...starRating, star].sort((a, b) => b - a);
        updateURL({ starRating: newRatings.length > 0 ? newRatings.join(',') : null });
    }, [toggleStarRating, starRating, updateURL]);

    const handleMinRatingChange = useCallback((value: number) => {
        setFilters({ minRating: value });
        updateURL({ minRating: value > 0 ? String(value) : null });
    }, [setFilters, updateURL]);

    const handleMinReviewsCountChange = useCallback((value: number) => {
        setFilters({ minReviewsCount: value });
        updateURL({ minReviewsCount: value > 0 ? String(value) : null });
    }, [setFilters, updateURL]);

    const handleFacilityToggle = useCallback((facilityId: number) => {
        toggleFacility(facilityId);
        const newFacilities = facilities.includes(facilityId)
            ? facilities.filter(f => f !== facilityId)
            : [...facilities, facilityId];
        updateURL({ facilities: newFacilities.length > 0 ? newFacilities.join(',') : null });
    }, [toggleFacility, facilities, updateURL]);

    const handleStrictFilteringToggle = useCallback((checked: boolean) => {
        setFilters({ strictFacilityFiltering: checked });
        updateURL({ strictFacilityFiltering: checked ? 'true' : null });
    }, [setFilters, updateURL]);

    const handleResetFilters = useCallback(() => {
        resetFilters();
        const current = new URLSearchParams(searchParams?.toString() || '');
        ['hotelName', 'starRating', 'minRating', 'minReviewsCount', 'facilities', 'strictFacilityFiltering'].forEach(key => {
            current.delete(key);
        });
        router.push(`/search?${current.toString()}`);
    }, [resetFilters, searchParams, router]);

    const hasActiveFilters = hotelName || starRating.length > 0 || minRating > 0 ||
        minReviewsCount > 0 || facilities.length > 0;

    const content = (
        <div className="w-full flex-shrink-0 space-y-4 pb-20 lg:pb-0">            {/* Header with Reset */}
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

            {/* Guest Rating */}
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

            {/* Amenities */}
            <FilterSection title="Amenities" index={4}>
                <div className="grid grid-cols-2 gap-2">
                    {facilityOptions.map((facility) => (
                        <CheckboxItem
                            key={facility.id}
                            label={facility.name}
                            checked={facilities.includes(facility.id)}
                            onChange={() => handleFacilityToggle(facility.id)}
                        />
                    ))}
                </div>

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
            <ActiveFiltersSummary filters={filters} />
        </div>
    );

    return (
        <>
            {/* Desktop persistent sidebar */}
            <div className="hidden lg:block w-[280px] flex-shrink-0">
                {content}
            </div>

            {/* Mobile modal overlay as a Dropdown */}
            <AnimatePresence>
                {isMobileFiltersOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[90] bg-black/40 lg:hidden pointer-events-auto"
                            onClick={() => setIsMobileFiltersOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: "100%", scale: 1 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 sm:top-[88px] sm:bottom-auto sm:left-auto sm:w-[340px] sm:max-h-[calc(100vh-120px)] max-h-[85vh] z-[100] bg-alabaster dark:bg-obsidian bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px] flex flex-col lg:hidden shadow-2xl rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200/50 dark:border-slate-800/50 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Background Sparkles */}
                            <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
                                <GlobalSparkle />
                            </div>

                            {/* Header */}
                            <div className="p-4 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 flex-shrink-0">
                                <button
                                    onClick={() => setIsMobileFiltersOpen(false)}
                                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors -ml-2"
                                >
                                    <X size={20} className="text-slate-700 dark:text-slate-300" />
                                </button>
                                <h2 className="font-semibold text-slate-900 dark:text-white absolute left-1/2 -translate-x-1/2">Filters</h2>
                                <div className="w-auto relative z-20">
                                    {hasActiveFilters && (
                                        <button
                                            onClick={handleResetFilters}
                                            className="text-sm font-semibold text-slate-900 dark:text-white underline underline-offset-2"
                                        >
                                            Clear all
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Filter Content */}
                            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar relative z-10">
                                {content}
                            </div>

                            {/* Fixed Footer */}
                            <div className="p-4 border-t border-slate-200/50 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex justify-center flex-shrink-0 relative z-10">
                                <button
                                    onClick={() => setIsMobileFiltersOpen(false)}
                                    className="w-full max-w-sm py-3.5 bg-alabaster-accent dark:bg-obsidian-accent text-white rounded-xl font-bold flex items-center justify-center transition-transform active:scale-[0.98] shadow-md hover:shadow-lg"
                                >
                                    Show places
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default SearchFilters;
