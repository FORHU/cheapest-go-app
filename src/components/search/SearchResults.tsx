"use client";

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type Property } from '@/types';
import { PropertyCard } from '@/components/shared';
import { MapPin } from 'lucide-react';
import { cn, buildPropertySlug } from '@/lib/utils';
import CurrencySelector from '@/components/common/CurrencySelector';
import { useSearchStore } from '@/stores/searchStore';
import { useTranslations } from 'next-intl';

const SORT_OPTIONS = ['recommended', 'price-low', 'price-high', 'rating', 'most-reviewed'] as const;
type SortValue = typeof SORT_OPTIONS[number];

const SORT_PILLS: { value: SortValue; labelKey: 'recommended' | 'cheapest' | 'topRated' | 'mostReviewed' | 'priceHighToLow' }[] = [
    { value: 'recommended', labelKey: 'recommended' },
    { value: 'price-low', labelKey: 'cheapest' },
    { value: 'rating', labelKey: 'topRated' },
    { value: 'most-reviewed', labelKey: 'mostReviewed' },
    { value: 'price-high', labelKey: 'priceHighToLow' },
];

// Match TGX board codes loosely so we handle whatever OTV returns
function matchesBoardType(hotelBoardTypes: string[], selected: string[]): boolean {
    return hotelBoardTypes.some(bt => {
        const lower = bt.toLowerCase();
        return selected.some(code => {
            if (code === 'RO') return lower === 'ro' || lower === 'nomeal' || lower === 'room_only' || (lower.includes('room') && lower.includes('only'));
            if (code === 'BB') return lower === 'bb' || lower === 'breakfast' || lower === 'breakfast_included' || lower.includes('breakfast');
            if (code === 'HB') return lower === 'hb' || lower === 'halfboard' || lower === 'half_board' || lower.includes('half');
            if (code === 'FB') return lower === 'fb' || lower === 'fullboard' || lower === 'full_board' || lower.includes('full board');
            if (code === 'AI') return lower === 'ai' || lower === 'allinclusive' || lower === 'all_inclusive' || lower.includes('all inclusive') || lower.includes('all-inclusive');
            return lower === code.toLowerCase();
        });
    });
}

interface SearchResultsProps {
    initialProperties?: Property[];
    totalCount?: number;
    rawSearchParams?: Record<string, any>;
    onSwitchToMap?: () => void;
    slowSearch?: boolean;
}

const PAGE_SIZE = 20;

const SearchResultsContent = ({ initialProperties = [], totalCount: initialTotalCount = 0, rawSearchParams = {}, onSwitchToMap, slowSearch = false }: SearchResultsProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const destination = searchParams?.get('destination') || '';
    const t = useTranslations('hotels.searchResults');

    const rawSort = searchParams?.get('sort');
    const initialSort: SortValue = SORT_OPTIONS.includes(rawSort as SortValue) ? (rawSort as SortValue) : 'recommended';
    const [sortBy, setSortBy] = useState<SortValue>(initialSort);

    // Client-side filters from the sidebar store
    const { filters } = useSearchStore();
    const { propertyTypes, boardTypes, refundable } = filters;

    // District/alias bbox filter — when user searched a neighbourhood the bbox is in the URL.
    const districtName = rawSearchParams?.districtName as string | undefined;
    const canonicalCity = rawSearchParams?.canonicalCity as string | undefined;
    const rawBbox = rawSearchParams?.bbox as string | undefined;
    const districtBbox = React.useMemo<[number, number, number, number] | null>(() => {
        if (!rawBbox) return null;
        const parts = rawBbox.split(',').map(Number);
        return parts.length === 4 && parts.every(Number.isFinite)
            ? parts as [number, number, number, number]
            : null;
    }, [rawBbox]);
    const [showAllCity, setShowAllCity] = React.useState(false);

    // Reset to page 1 whenever filters change
    React.useEffect(() => { setPage(1); }, [propertyTypes, boardTypes, refundable]);

    const handleSortChange = useCallback((value: SortValue) => {
        setSortBy(value);
        setPage(1);
        const params = new URLSearchParams(window.location.search);
        if (value === 'recommended') params.delete('sort');
        else params.set('sort', value);
        window.history.replaceState(null, '', `?${params.toString()}`);
    }, []);

    const [allProperties, setAllProperties] = React.useState<Property[]>(initialProperties);
    const [totalCount, setTotalCount] = React.useState(initialTotalCount || initialProperties.length);
    const [page, setPage] = React.useState(1);

    const buildPropertyUrl = useCallback((property: Property) => {
        const params = new URLSearchParams(window.location.search);
        if (property.rateId) params.set('rateId', property.rateId);
        return `/property/${buildPropertySlug(property.name, property.id)}?${params.toString()}`;
    }, []);

    const handlePropertyClick = (property: Property) => {
        router.push(buildPropertyUrl(property));
    };

    const handlePropertyPrefetch = useCallback((property: Property) => {
        router.prefetch(buildPropertyUrl(property));
    }, [router, buildPropertyUrl]);

    // Navigate to map view
    const handleViewOnMap = useCallback(() => {
        if (onSwitchToMap) {
            onSwitchToMap();
        } else {
            const params = new URLSearchParams(window.location.search);
            params.set('view', 'map');
            router.push(`/search?${params.toString()}`);
        }
    }, [onSwitchToMap, router]);

    const updateRecentSearchPrice = useSearchStore((s) => s.updateRecentSearchPrice);

    // Reset when search changes and capture cheapest price for "Continue Your Search"
    React.useEffect(() => {
        setAllProperties(initialProperties);
        setTotalCount(initialTotalCount || initialProperties.length);
        setPage(1);
        if (destination && initialProperties.length > 0) {
            const cheapest = initialProperties.reduce((min, p) => p.price < min.price ? p : min, initialProperties[0]);
            if (cheapest.price > 0) {
                updateRecentSearchPrice(destination, cheapest.price, cheapest.currency || 'USD');
            }
        }
    }, [destination, searchParams]);

    // Count mappable properties (from allProperties for the map button badge)
    const mappableCount = useMemo(
        () => allProperties.filter(
            (p) => p.coordinates && p.coordinates.lat !== 0 && p.coordinates.lng !== 0
        ).length,
        [allProperties]
    );

    // Filter and sort all loaded properties (client-side)
    const filteredProperties = useMemo(() => {
        let props = allProperties && allProperties.length > 0 ? [...allProperties] : [];

        // District bbox filter: show only hotels within the searched neighbourhood
        // unless the user has explicitly expanded to the full city.
        if (districtBbox && !showAllCity) {
            const [minLng, minLat, maxLng, maxLat] = districtBbox;
            props = props.filter(p => {
                const lat = p.coordinates?.lat;
                const lng = p.coordinates?.lng;
                if (!lat || !lng) return false;
                return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
            });
        }

        // Property type
        if (propertyTypes.length > 0) {
            props = props.filter(p => propertyTypes.includes(p.type));
        }

        // Board / meal plan
        if (boardTypes.length > 0) {
            props = props.filter(p =>
                p.boardTypes && p.boardTypes.length > 0
                    ? matchesBoardType(p.boardTypes, boardTypes)
                    : boardTypes.includes('RO')
            );
        }

        // Refundable
        if (refundable === true) {
            props = props.filter(p => p.refundableTag === 'RFN');
        }

        // Sort
        if (sortBy === 'price-low') props.sort((a, b) => a.price - b.price);
        else if (sortBy === 'price-high') props.sort((a, b) => b.price - a.price);
        else if (sortBy === 'rating') props.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'most-reviewed') props.sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));

        return props;
    }, [allProperties, sortBy, propertyTypes, boardTypes, refundable]);

    const visibleProperties = filteredProperties.slice(0, page * PAGE_SIZE);
    const hasMore = visibleProperties.length < filteredProperties.length;

    const handleLoadMore = () => setPage(p => p + 1);

    return (
        <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3 md:mb-4">
                <div>
                    <h1 className="text-[14px] md:text-xl lg:text-2xl font-display font-bold text-slate-900 dark:text-white leading-tight">
                        {districtName && !showAllCity
                            ? districtName
                            : (destination ? t('staysIn', { destination }) : t('allProperties'))}
                    </h1>
                    <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('propertiesFound', { count: filteredProperties.length })} · {t('pricesMayChange')}
                        {districtName && !showAllCity && (
                            <button
                                onClick={() => setShowAllCity(true)}
                                className="ml-2 text-blue-500 hover:text-blue-600 underline underline-offset-2 cursor-pointer"
                            >
                                Show all in {canonicalCity || destination}
                            </button>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <CurrencySelector variant="pill" align="left" className="md:hidden" />
                    {mappableCount > 0 && (
                        <button
                            onClick={handleViewOnMap}
                            className="flex items-center gap-1 px-2.5 h-[28px] md:h-9 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] md:text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                            <MapPin size={12} />
                            <span className="hidden sm:inline">{t('map')}</span>
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{mappableCount}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Sort pills */}
            <div className="flex gap-1.5 flex-wrap mb-4 md:mb-5">
                {SORT_PILLS.map(pill => (
                    <button
                        key={pill.value}
                        onClick={() => handleSortChange(pill.value)}
                        className={cn(
                            "px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                            sortBy === pill.value
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500"
                        )}
                    >
                        {t(`sort.${pill.labelKey}`)}
                    </button>
                ))}
            </div>

            {/* Property List */}
            {
                filteredProperties.length > 0 ? (
                    <div className="space-y-4">
                        {visibleProperties.map((property, index) => (
                            <div key={property.id} onMouseEnter={() => handlePropertyPrefetch(property)}>
                                <PropertyCard
                                    variant="horizontal"
                                    property={property}
                                    index={index}
                                    priority={index === 0}
                                    onClick={() => handlePropertyClick(property)}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4">
                        {slowSearch ? (
                            <>
                                <div className="text-3xl mb-3">⏳</div>
                                <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                                    Still loading {destination ? `hotels in ${destination}` : 'hotels'}
                                </h3>
                                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm max-w-xs mx-auto">
                                    This destination is being indexed for the first time. Please search again — results should appear now.
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-4 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
                                >
                                    Search again
                                </button>
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                                    {destination ? t('noHotelsFoundIn', { destination }) : t('noPropertiesFound')}
                                </h3>
                                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                                    {t('supplierUnavailable')}
                                </p>
                            </>
                        )}
                    </div>
                )
            }

            {/* Load More */}
            {filteredProperties.length > 0 && (
                <div className="mt-4 md:mt-8 flex justify-center">
                    {hasMore ? (
                        <button
                            onClick={handleLoadMore}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-full transition-all active:scale-95 shadow-md shadow-blue-600/10"
                        >
                            {t('showMoreRemaining', { count: filteredProperties.length - visibleProperties.length })}
                        </button>
                    ) : (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {t('allResultsShown', { count: filteredProperties.length })}
                        </span>
                    )}
                </div>
            )}

            {/* Floating Map Toggle for Mobile - REMOVED */}
        </div >
    );
};

const SearchResults = ({ initialProperties = [], totalCount = 0, rawSearchParams = {}, onSwitchToMap, slowSearch = false }: SearchResultsProps) => {
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
            <SearchResultsContent initialProperties={initialProperties} totalCount={totalCount} rawSearchParams={rawSearchParams} onSwitchToMap={onSwitchToMap} slowSearch={slowSearch} />
        </Suspense>
    );
};

export default SearchResults;
