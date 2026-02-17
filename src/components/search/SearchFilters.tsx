"use client";

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, Map as MapIcon, RotateCcw } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { useSearchFilters, useSearchStore } from '@/stores/searchStore';
import { STAR_RATINGS, GUEST_RATING_OPTIONS, REVIEW_COUNT_OPTIONS, FACILITIES } from '@/lib/constants';
import { FilterSection } from './FilterSection';
import { CheckboxItem } from './CheckboxItem';
import { RadioItem } from './RadioItem';
import { ActiveFiltersSummary } from './ActiveFiltersSummary';

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
    const { setFilters, toggleStarRating, toggleFacility, resetFilters } = useSearchStore();
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
        const current = new URLSearchParams(searchParams.toString());
        ['hotelName', 'starRating', 'minRating', 'minReviewsCount', 'facilities', 'strictFacilityFiltering'].forEach(key => {
            current.delete(key);
        });
        router.push(`/search?${current.toString()}`);
    }, [resetFilters, searchParams, router]);

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
                {previewCoordinates ? (
                    <div className="absolute inset-0 pointer-events-none">
                        <Map
                            mapStyle="standard"
                            initialViewState={{
                                longitude: previewCoordinates.lng,
                                latitude: previewCoordinates.lat,
                                zoom: 12,
                                pitch: 0,
                                bearing: 0
                            }}
                            scrollZoom={false}
                            dragPan={false}
                            attributionControl={false}
                            reuseMaps
                        />
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <MapIcon className="text-slate-400" />
                    </div>
                )}
                <button
                    onClick={() => {
                        const current = new URLSearchParams(searchParams.toString());
                        current.set('view', 'map');
                        router.push(`/search?${current.toString()}`);
                    }}
                    className="absolute inset-0 m-auto w-max h-max bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-white/10 opacity-90 hover:opacity-100 hover:scale-105 transition-all cursor-pointer z-10"
                >
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
                <div className="flex flex-col gap-1">
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
};

export default SearchFilters;

