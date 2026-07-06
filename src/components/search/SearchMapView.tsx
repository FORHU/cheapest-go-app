'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MapPropertyCard } from '@/components/map/MapPropertyCard';
import type { MappableProperty } from '@/components/map/types';
import { type Property } from '@/types';
import { ArrowLeft, MapPin, List, SlidersHorizontal, Calendar, Users, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn, buildPropertySlug } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency, useSearchStore, useSearchFilters, useDates, useActiveDropdown } from '@/stores/searchStore';
import { DatePicker } from '@/components/landing/hero/search/DatePicker';
import CurrencySelector from '@/components/common/CurrencySelector';
import { useTranslations, useLocale } from 'next-intl';

const SearchMapContainer = dynamic(
    () => import('../mapbox/SearchMapContainer').then(m => ({ default: m.SearchMapContainer })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 h-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        ),
    }
);

// ── Sort ────────────────────────────────────────────────
const SORT_PILLS = [
    { value: 'recommended', labelKey: 'recommended' },
    { value: 'price-low', labelKey: 'cheapest' },
    { value: 'rating', labelKey: 'topRated' },
    { value: 'most-reviewed', labelKey: 'mostReviewed' },
    { value: 'price-high', labelKey: 'priceHighToLow' },
] as const;
type SortValue = typeof SORT_PILLS[number]['value'];

// ── Board-type loose matcher (reused from SearchResults) ─
function matchesBoardType(hotelBoardTypes: string[], selected: string[]): boolean {
    return hotelBoardTypes.some(bt => {
        const lower = bt.toLowerCase();
        return selected.some(code => {
            if (code === 'RO') return lower === 'ro' || (lower.includes('room') && lower.includes('only'));
            if (code === 'BB') return lower === 'bb' || lower.includes('breakfast');
            if (code === 'HB') return lower === 'hb' || lower.includes('half');
            if (code === 'FB') return lower === 'fb' || lower.includes('full board');
            if (code === 'AI') return lower === 'ai' || lower.includes('all inclusive') || lower.includes('all-inclusive');
            return lower === code.toLowerCase();
        });
    });
}



// Fallback coordinates when a search returns 0 mappable results.
// Keyed by lowercase city/country name (partial prefix match).
const CITY_COORDS: Record<string, [number, number]> = {
    tokyo: [139.6917, 35.6895],
    osaka: [135.5023, 34.6937],
    kyoto: [135.7681, 35.0116],
    sapporo: [141.3469, 43.0618],
    fukuoka: [130.4017, 33.5904],
    hiroshima: [132.4553, 34.3963],
    seoul: [126.9780, 37.5665],
    busan: [129.0756, 35.1796],
    jeju: [126.5312, 33.4996],
    bangkok: [100.5018, 13.7563],
    phuket: [98.3923, 7.8804],
    'chiang mai': [98.9853, 18.7883],
    singapore: [103.8198, 1.3521],
    'kuala lumpur': [101.6869, 3.1390],
    bali: [115.1889, -8.4095],
    jakarta: [106.8456, -6.2088],
    'hong kong': [114.1694, 22.3193],
    taipei: [121.5654, 25.0330],
    beijing: [116.4074, 39.9042],
    shanghai: [121.4737, 31.2304],
    dubai: [55.2708, 25.2048],
    istanbul: [28.9784, 41.0082],
    delhi: [77.1025, 28.7041],
    mumbai: [72.8777, 19.0760],
    london: [-0.1278, 51.5074],
    paris: [2.3522, 48.8566],
    amsterdam: [4.9041, 52.3676],
    barcelona: [2.1734, 41.3851],
    rome: [12.4964, 41.9028],
    'new york': [-74.0059, 40.7128],
    'los angeles': [-118.2437, 34.0522],
    sydney: [151.2093, -33.8688],
    manila: [120.9842, 14.5995],
    baguio: [120.5960, 16.4023],
    cebu: [123.8854, 10.3157],
};

function getDestinationCoords(destination: string): { lng: number; lat: number } | null {
    const key = destination.toLowerCase().trim();
    if (CITY_COORDS[key]) {
        const [lng, lat] = CITY_COORDS[key];
        return { lng, lat };
    }
    // Prefix match (e.g. "Tokyo, Japan" → "tokyo")
    for (const [city, [lng, lat]] of Object.entries(CITY_COORDS)) {
        if (key.startsWith(city) || city.startsWith(key.split(',')[0].trim().toLowerCase())) {
            return { lng, lat };
        }
    }
    return null;
}

interface SearchMapViewProps {
    properties: Property[];
    destination?: string;
    totalCount?: number;
    allMappable?: any[];
    rawSearchParams?: Record<string, any>;
    isStreaming?: boolean;
    onSwitchToList?: () => void;
}

const LOADING_TIPS = [
    'comparingRates',
    'Checking availability for your dates…',
    'Finding the best deals in the area…',
    'Almost there — great results incoming…',
    'Securing live prices from our suppliers…',
];

function PriceLoadingSidebar({ destination }: { destination: string }) {
    const t = useTranslations('hotels.mapView');
    const [tipIdx, setTipIdx] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTipIdx(i => (i + 1) % LOADING_TIPS.length), 3000);
        return () => clearInterval(id);
    }, []);
    return (
        <div className="flex flex-col gap-3 p-3 overflow-y-auto">
            <div className="px-1 py-3 text-center select-none">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    {destination ? t('findingHotelsIn', { destination }) : t('findingHotels')}
                </p>
                <p className="text-[11px] text-blue-500 dark:text-blue-400 transition-all duration-500 min-h-[16px]">
                    {LOADING_TIPS[tipIdx] === 'comparingRates' ? t('comparingRates') : LOADING_TIPS[tipIdx]}
                </p>
            </div>
            {[1, 2, 3, 4].map(n => (
                <div key={n} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 flex gap-3 animate-pulse">
                    <div className="w-16 h-16 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 flex flex-col gap-2 py-1">
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                        <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mt-auto" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Search Refinement Bar ───────────────────────────────────────────────────
function SearchRefinementBar({ rawSearchParams }: { rawSearchParams: Record<string, any> }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('hotels.mapView');

    // Use the same store-backed DatePicker as the landing page
    const { setDates, setActiveDropdown } = useSearchStore();
    const { checkIn: storeCheckIn, checkOut: storeCheckOut } = useDates();
    const activeDropdown = useActiveDropdown();

    const [adults, setAdults] = useState<number>(Number(rawSearchParams.adults) || 2);
    const [children, setChildren] = useState<number>(Number(rawSearchParams.children) || 0);

    // Sync URL params → store on mount so the bar reflects the current search dates
    useEffect(() => {
        const checkinStr = rawSearchParams.checkin || rawSearchParams.checkIn;
        const checkoutStr = rawSearchParams.checkout || rawSearchParams.checkOut;
        if (checkinStr) {
            setDates({
                checkIn: new Date(checkinStr + 'T00:00:00'),
                checkOut: checkoutStr ? new Date(checkoutStr + 'T00:00:00') : null,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkin = storeCheckIn ? storeCheckIn.toISOString().slice(0, 10) : '';
    const checkout = storeCheckOut ? storeCheckOut.toISOString().slice(0, 10) : '';

    const nights = useMemo(() => {
        if (!storeCheckIn || !storeCheckOut) return 1;
        const n = Math.round((storeCheckOut.getTime() - storeCheckIn.getTime()) / 86_400_000);
        return n > 0 ? n : 1;
    }, [storeCheckIn, storeCheckOut]);

    function handleSearch() {
        if (!checkin || !checkout) return;
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('checkin', checkin);
        params.set('checkout', checkout);
        params.set('adults', String(adults));
        params.set('children', String(children));
        router.push(`/search?${params.toString()}`);
    }

    const locale = useLocale();
    const fmtDay = (date: Date | null) => {
        if (!date) return '—';
        return new Date(date).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="shrink-0 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 px-4 py-2">
            <div className="max-w-2xl mx-auto">
                {/* overflow-visible so the DatePicker dropdown can escape the bar */}
                <div className="flex items-center w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm h-14">

                    {/* Check-in — relative wrapper so DatePicker positions itself here */}
                    <div className="relative flex-1 h-full">
                        <div
                            className="flex flex-col justify-center px-5 h-full cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-r border-slate-100 dark:border-slate-800 rounded-l-2xl"
                            onClick={() => setActiveDropdown(activeDropdown === 'dates-in' ? null : 'dates-in')}
                            data-datepicker-trigger
                        >
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('checkIn')}</span>
                            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">{fmtDay(storeCheckIn)}</span>
                        </div>
                        <DatePicker triggerDropdown="dates-in" />
                    </div>

                    {/* Nights divider */}
                    <div className="flex flex-col items-center justify-center px-2.5 h-full bg-slate-50 dark:bg-slate-800/40 border-r border-slate-100 dark:border-slate-800 shrink-0">
                        <span className="text-[11px] font-bold text-blue-500">{nights}</span>
                        <span className="text-[9px] text-slate-400 leading-none">{t('nights')}</span>
                    </div>

                    {/* Check-out — relative wrapper so DatePicker positions itself here */}
                    <div className="relative flex-1 h-full">
                        <div
                            className="flex flex-col justify-center px-5 h-full cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-r border-slate-100 dark:border-slate-800"
                            onClick={() => setActiveDropdown(activeDropdown === 'dates-out' ? null : 'dates-out')}
                            data-datepicker-trigger
                        >
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('checkOut')}</span>
                            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">{fmtDay(storeCheckOut)}</span>
                        </div>
                        <DatePicker initialCheckOutMode triggerDropdown="dates-out" />
                    </div>

                    {/* Guests */}
                    <div className="flex flex-col justify-center px-5 border-r border-slate-100 dark:border-slate-800 shrink-0 h-full">
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('guests')}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <button onClick={() => setAdults(a => Math.max(1, a - 1))} className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-base font-light flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer leading-none select-none">−</button>
                            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 w-4 text-center tabular-nums">{adults + children}</span>
                            <button onClick={() => setAdults(a => Math.min(16, a + 1))} className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-base font-light flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer leading-none select-none">+</button>
                        </div>
                    </div>

                    {/* Search */}
                    <button
                        onClick={handleSearch}
                        className="flex items-center gap-2 px-6 h-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold transition-colors cursor-pointer shrink-0 rounded-r-2xl"
                    >
                        <Search size={15} />
                        <span>{t('search')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Full-page Agoda-style split map layout.
 *
 * LEFT  — scrollable property card list with sort + filter controls
 * RIGHT — sticky Mapbox map, full viewport height
 */
function SearchMapView({
    properties,
    destination,
    totalCount: _totalCount = 0,
    allMappable = [],
    rawSearchParams = {},
    isStreaming = false,
    onSwitchToList,
}: SearchMapViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('hotels.mapView');
    const tr = useTranslations('hotels.searchResults');
    const tc = useTranslations('hotels.card');

    const PROPERTY_TYPE_OPTIONS = React.useMemo(() => [
        { value: 'hotel', label: t('filterOptions.propertyTypes.hotel') },
        { value: 'apartment', label: t('filterOptions.propertyTypes.apartment') },
        { value: 'resort', label: t('filterOptions.propertyTypes.resort') },
        { value: 'villa', label: t('filterOptions.propertyTypes.villa') },
    ], [t]);
    const BOARD_TYPE_OPTIONS = React.useMemo(() => [
        { code: 'RO', label: t('filterOptions.boardTypes.roomOnly') },
        { code: 'BB', label: t('filterOptions.boardTypes.breakfast') },
        { code: 'HB', label: t('filterOptions.boardTypes.halfBoard') },
        { code: 'FB', label: t('filterOptions.boardTypes.fullBoard') },
        { code: 'AI', label: t('filterOptions.boardTypes.allInclusive') },
    ], [t]);

    // State — seed from properties, padded with any allMappable hotels not already present
    // (allMappable may contain more hotels than properties when the server cache is stale)
    const [allProperties, setAllProperties] = React.useState<Property[]>(() => {
        const ids = new Set(properties.map(p => p.id));
        const extra = allMappable
            .filter((m: any) => m.name && m.price > 0 && !ids.has(m.id ?? m.hotelId))
            .map((m: any): Property => ({
                id: m.id ?? m.hotelId,
                name: m.name,
                price: m.price,
                currency: m.currency || 'USD',
                image: m.image || '',
                images: m.image ? [m.image] : [],
                coordinates: m.coordinates || { lat: 0, lng: 0 },
                rating: m.rating || 0,
                reviews: 0,
                location: '',
                description: '',
                amenities: [],
                badges: [],
                type: 'hotel',
                boardTypes: [],
                city: '',
            }));
        return [...properties, ...extra];
    });
    // Sync streaming hotel updates: merge incoming into local state.
    // Also patches existing entries whose location/image was empty when first received
    // (the `done` event may arrive with the same count as `hotels` but with enriched data).
    React.useEffect(() => {
        if (properties.length === 0) return;
        setAllProperties(prev => {
            const incomingMap = new Map(properties.map(p => [p.id, p]));
            let changed = false;

            // Update existing entries that have empty location/image OR no price yet.
            // Drop priceLoading hotels that disappeared from properties (TGX had no availability).
            // Update existing entries that have empty location/image OR no price yet.
            // Drop priceLoading hotels that disappeared from properties (TGX had no availability).
            const updated = prev.map((p: any) => {
                const id = p.id ?? p.hotelId;
                const incoming = incomingMap.get(id);
                if (!incoming) return (p as any).priceLoading ? null : p;
                if (!incoming) return (p as any).priceLoading ? null : p;
                const wantsLocation = !p.location && incoming.location;
                const wantsImage = !p.image && incoming.image;
                // Sync price when catalog sent price:0 and TGX prices have now arrived
                const wantsPrice = (p.price === 0 || p.priceLoading) && (incoming as any).price > 0;
                if (!wantsLocation && !wantsImage && !wantsPrice) return p;
                changed = true;
                return {
                    ...p,
                    location: incoming.location || p.location,
                    image: incoming.image || p.image,
                    images: incoming.images?.length ? incoming.images : p.images,
                    ...(wantsPrice && {
                        price: (incoming as any).price,
                        currency: (incoming as any).currency ?? p.currency,
                        offerId: (incoming as any).offerId ?? p.offerId,
                        refundableTag: (incoming as any).refundableTag ?? p.refundableTag,
                        boardCode: (incoming as any).boardCode ?? p.boardCode,
                        _tgx: (incoming as any)._tgx ?? p._tgx,
                        priceLoading: false,
                    }),
                };
            });

            // Append brand-new hotels not previously in the list
            const existingIds = new Set(prev.map((p: any) => p.id ?? p.hotelId));
            const newOnes = properties.filter(p => !existingIds.has(p.id));

            const filtered = updated.filter(Boolean);
            if (!changed && newOnes.length === 0 && filtered.length === prev.length) return prev;
            return [...(changed || filtered.length < prev.length ? filtered : prev), ...newOnes];
        });
    }, [properties]);

    // ── Client-side display pagination ───────────────────────────
    const LIST_PAGE_SIZE = 15;
    const [displayCount, setDisplayCount] = useState(LIST_PAGE_SIZE);
    const searchKey = JSON.stringify(rawSearchParams);
    React.useEffect(() => { setDisplayCount(LIST_PAGE_SIZE); }, [searchKey]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const cardRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
    const lastScrolledIdRef = React.useRef<string | null>(null);
    const [sortBy, setSortBy] = useState<SortValue>('recommended');
    const [showMobileMap, setShowMobileMap] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const targetCurrency = useUserCurrency();

    // Shared filter state from sidebar store
    const filters = useSearchFilters();
    const { togglePropertyType, toggleBoardType, setRefundable, resetFilters } = useSearchStore();
    const { propertyTypes, boardTypes, refundable } = filters;

    const activeFilterCount = propertyTypes.length + boardTypes.length + (refundable !== null ? 1 : 0);

    // ── Map Pins ─────────────────────────────────────────────
    // Use allMappable (fast coord-only list) if provided, otherwise fall back to allProperties.
    // allMappable is used for map pins only; sortedProperties drives the list.
    const mappableProperties = useMemo<MappableProperty[]>(() => {
        // Use allProperties (full priced set) for pins; allMappable is only a fallback for
        // the brief window before the done event arrives.
        const source = allProperties.length > 0 ? allProperties : allMappable;
        const filtered = source
            .filter(
                (p: any): p is MappableProperty =>
                    p.coordinates != null &&
                    typeof p.coordinates.lat === 'number' &&
                    typeof p.coordinates.lng === 'number' &&
                    p.coordinates.lat !== 0 &&
                    p.coordinates.lng !== 0
            )
            .map((p: any) => ({
                ...p,
                id: p.id || p.hotelId,
                location: p.location || '',
                image: p.image || '',
                rating: p.rating || 0,
                reviews: p.reviews || 0,
                price: p.price || 0,
                currency: p.currency || 'USD',
            }));

        // Deduplicate by proximity — TGX and ETG can both return the same hotel.
        // If two pins are within ~100m (0.001°), keep the lower-price entry.
        const PROX_DEG = 0.001;
        const unique: MappableProperty[] = [];
        for (const pin of filtered) {
            const dupeIdx = unique.findIndex(
                u =>
                    Math.abs(u.coordinates.lat - pin.coordinates.lat) < PROX_DEG &&
                    Math.abs(u.coordinates.lng - pin.coordinates.lng) < PROX_DEG
            );
            if (dupeIdx !== -1) {
                if (pin.price < unique[dupeIdx].price) unique[dupeIdx] = pin;
            } else {
                unique.push(pin);
            }
        }
        return unique;
    }, [allMappable, allProperties]);

    // Apply client-side filters + sort to ALL loaded properties (includes Load More results)
    const sortedProperties = useMemo(() => {
        // Raw hotel codes from OTV look like 'yello_hotel' or 'cebu_hilltop_hotel' — all lowercase,
        // digits, and underscores with no spaces. Exclude them until ETG enrichment populates real names.
        const isRawCode = (name: string) => /^[a-z0-9_]+$/.test(name) && name.includes('_');
        let list = allProperties.filter((p: any) =>
            p.name && !isRawCode(p.name) && p.price > 0 && !(p as any).priceLoading
        );

        if (propertyTypes.length > 0) {
            list = list.filter((p: any) => propertyTypes.includes(p.type));
        }
        if (boardTypes.length > 0) {
            list = list.filter((p: any) =>
                p.boardTypes && p.boardTypes.length > 0
                    ? matchesBoardType(p.boardTypes, boardTypes)
                    : boardTypes.includes('RO')
            );
        }
        if (refundable === true) {
            list = list.filter((p: any) => p.refundableTag === 'RFN');
        }

        if (sortBy === 'price-low') list.sort((a: any, b: any) => a.price - b.price);
        else if (sortBy === 'price-high') list.sort((a: any, b: any) => b.price - a.price);
        else if (sortBy === 'rating') list.sort((a: any, b: any) => b.rating - a.rating);
        else if (sortBy === 'most-reviewed') list.sort((a: any, b: any) => (b.reviews ?? 0) - (a.reviews ?? 0));

        // Always push hotels with no image to the bottom regardless of sort order
        const hasImg = (p: any) => (p.image || (p.images && p.images.length > 0)) ? 0 : 1;
        list.sort((a: any, b: any) => hasImg(a) - hasImg(b));

        return list;
    }, [allProperties, sortBy, propertyTypes, boardTypes, refundable]);

    // Client-side display pagination — all hotels are already in sortedProperties from streaming
    const canLoadMore = displayCount < sortedProperties.length;
    const loadMoreFirstIdxRef = React.useRef<number | null>(null);
    const handleShowMore = useCallback(() => {
        setDisplayCount(prev => {
            loadMoreFirstIdxRef.current = prev;
            return prev + LIST_PAGE_SIZE;
        });
    }, []);
    const visibleProperties = useMemo(
        () => sortedProperties.slice(0, displayCount),
        [sortedProperties, displayCount]
    );

    // After Load More, scroll the list to the first newly visible card
    React.useEffect(() => {
        if (loadMoreFirstIdxRef.current === null) return;
        const idx = loadMoreFirstIdxRef.current;
        loadMoreFirstIdxRef.current = null;
        const firstNew = sortedProperties[idx];
        if (!firstNew) return;
        const card = cardRefs.current.get(firstNew.id);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [visibleProperties]); // eslint-disable-line react-hooks/exhaustive-deps

    // Always seed the map with the destination's coordinates so it starts centred on
    // the right city. The guard on mappableProperties was incorrectly cleared this,
    // causing the map to default to Tokyo (or globe view) while pins were loading.
    const fallbackCoords = useMemo(() => {
        return destination ? getDestinationCoords(destination) : null;
    }, [destination]);

    // ── Handlers ────────────────────────────────────────────

    const handleBackToList = useCallback(() => {
        if (onSwitchToList) {
            onSwitchToList();
        } else {
            const params = new URLSearchParams(searchParams?.toString() || '');
            params.set('view', 'list');
            router.push(`/search?${params.toString()}`);
        }
    }, [onSwitchToList, router, searchParams]);

    const handleViewDetails = useCallback(
        (id: string) => {
            const params = new URLSearchParams(searchParams?.toString() || '');
            params.delete('view');
            const prop = properties.find(p => p.id === id);
            if (prop?.rateId) params.set('rateId', prop.rateId);

            // Ensure dates are always forwarded. Landing-page clicks don't put dates in the URL,
            // so the property page would fall back to same-day defaults (near-zero OTV inventory).
            // Use rawSearchParams (the actual dates the search ran with) when the URL has none.
            if (!params.has('checkIn') && !params.has('checkin')) {
                const ci = rawSearchParams.checkin || rawSearchParams.checkIn;
                const co = rawSearchParams.checkout || rawSearchParams.checkOut;
                if (ci) params.set('checkIn', ci);
                if (co) params.set('checkOut', co);
            }

            const slug = prop ? buildPropertySlug(prop.name, id) : id;
            router.push(`/property/${slug}?${params.toString()}`);
        },
        [router, searchParams, rawSearchParams, properties]
    );

    const handleCardSelect = useCallback(
        (id: string) => {
            setSelectedId((prev) => (prev === id ? null : id));
        },
        [mappableProperties]
    );

    const handleHover = useCallback((id: string | null) => {
        setHoveredId(id);
    }, []);

    // Scroll the desktop list to show the selected hotel card
    React.useEffect(() => {
        if (!selectedId) {
            lastScrolledIdRef.current = null;
            return;
        }
        if (lastScrolledIdRef.current === selectedId) return;
        const card = cardRefs.current.get(selectedId);
        if (card) {
            lastScrolledIdRef.current = selectedId;
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Card not rendered yet — expand the visible list to include it
            const idx = sortedProperties.findIndex((p: any) => p.id === selectedId);
            if (idx !== -1) {
                setDisplayCount(prev => Math.max(prev, idx + 1));
            }
        }
    }, [selectedId, visibleProperties]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Price range summary ─────────────────────────────────
    const priceRange = useMemo(() => {
        if (mappableProperties.length === 0) return null;
        const prices = mappableProperties.map((p) => p.price).filter((p) => p > 0);
        if (prices.length === 0) return null;
        return {
            min: Math.min(...prices),
            max: Math.max(...prices),
        };
    }, [mappableProperties]);


    // ── Render ──────────────────────────────────────────────
    // Show all sorted properties in sidebar — Load More appends via API
    // Filter panel (shared between desktop list and mobile)
    const filterPanel = (
        <AnimatePresence>
            {showFilters && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                >
                    <div className="max-w-[1400px] mx-auto px-4 py-3 flex flex-wrap gap-6">
                        {/* Property Type */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t('filterOptions.propertyType')}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {PROPERTY_TYPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => togglePropertyType(opt.value)}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                                            propertyTypes.includes(opt.value)
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Meal Plan */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t('filterOptions.mealPlan')}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {BOARD_TYPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.code}
                                        onClick={() => toggleBoardType(opt.code)}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                                            boardTypes.includes(opt.code)
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cancellation */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t('cancellation')}</p>
                            <div className="flex gap-1.5">
                                {[{ v: null, l: t('any') }, { v: true, l: tc('freeCancellation') }].map(({ v, l }) => (
                                    <button
                                        key={String(v)}
                                        onClick={() => setRefundable(v as boolean | null)}
                                        className={cn(
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                                            refundable === v
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                        )}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeFilterCount > 0 && (
                            <div className="flex items-end">
                                <button
                                    onClick={() => resetFilters()}
                                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                                >
                                    {t('clearFilters')}
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div className="flex flex-col h-full w-full">
            {/* ── Search refinement bar ── */}
            <SearchRefinementBar rawSearchParams={rawSearchParams} />

            {/* ── Top bar ── */}
            <div className="shrink-0 bg-white dark:bg-slate-950 z-30 relative border-b border-slate-100 dark:border-slate-800/60 landscape-compact-topbar p-[10px]">
                <div className="max-w-[1400px] mx-auto px-3 flex items-center gap-2">
                    <a
                        href="/"
                        className="flex items-center gap-1 text-[10px] sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={12} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">{t('back')}</span>
                    </a>

                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

                    <div className="flex items-center gap-1 landscape-compact:hidden">
                        <MapPin size={12} className="text-blue-500" />
                        <span className="text-sm md:text-base font-semibold text-slate-900 dark:text-white truncate max-w-[100px] sm:max-w-[200px]">
                            {destination || t('searchFallback')}
                        </span>
                    </div>

                    {priceRange && (
                        <>
                            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />
                            <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline">
                                {t('pricePerNight', {
                                    min: formatCurrency(convertCurrency(priceRange.min, mappableProperties[0]?.currency || 'USD', targetCurrency), targetCurrency),
                                    max: formatCurrency(convertCurrency(priceRange.max, mappableProperties[0]?.currency || 'USD', targetCurrency), targetCurrency),
                                })}
                            </span>
                        </>
                    )}

                    <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                        <CurrencySelector variant="pill" align="right" className="sm:hidden" />

                        {/* Property count pill */}
                        <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-[10px] md:text-[11px] font-semibold border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            {activeFilterCount > 0
                                ? tr('filteredCount', { filtered: sortedProperties.length, total: allProperties.filter((p: any) => p.name && (p.price > 0 || (p as any).priceLoading)).length })
                                : tr('hotelsCount', { count: sortedProperties.length })
                            }
                        </span>

                        {/* Sort pills — scrollable on small screens */}
                        <div className="hidden sm:flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                            {SORT_PILLS.map(pill => (
                                <button
                                    key={pill.value}
                                    onClick={() => setSortBy(pill.value)}
                                    className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[10px] md:text-[11px] font-semibold border whitespace-nowrap transition-colors cursor-pointer",
                                        sortBy === pill.value
                                            ? "bg-blue-600 text-white border-blue-600"
                                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                                    )}
                                >
                                    {tr(`sort.${pill.labelKey}`)}
                                </button>
                            ))}
                        </div>

                        {/* Filter toggle button */}
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={cn(
                                "flex items-center gap-1 px-2.5 h-[24px] md:h-8 rounded-full border text-[10px] md:text-[11px] font-bold transition-colors cursor-pointer",
                                showFilters || activeFilterCount > 0
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                            )}
                        >
                            <SlidersHorizontal size={12} />
                            <span className="hidden sm:inline">{t('filters')}</span>
                            {activeFilterCount > 0 && (
                                <span className={cn(
                                    "w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center",
                                    showFilters || activeFilterCount > 0 ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                                )}>{activeFilterCount}</span>
                            )}
                        </button>

                        {/* List view toggle */}
                        <button
                            onClick={handleBackToList}
                            className="hidden sm:flex items-center gap-1 px-2.5 h-[24px] md:h-8 rounded-full border text-[10px] md:text-[11px] font-bold transition-colors cursor-pointer bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                        >
                            <List size={12} />
                            <span>{t('list')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Filter panel (below top bar) ── */}
            {filterPanel}

            {/* ── Desktop Split layout ── */}
            <div className="hidden lg:flex flex-1 min-h-0 relative gap-4 p-4">
                {/* LEFT: Property list — outer wrapper does NOT scroll; inner list does */}
                <div className="w-[420px] xl:w-[calc(420px+max(0px,50vw-700px))] xl:pl-[max(0px,50vw-700px)] shrink-0 h-full flex flex-col">
                    {sortedProperties.length > 0 ? (
                        <>
                            {/* Scrollable hotel cards — scrollbar hidden so it doesn't steal width from cards */}
                            <div className="flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {visibleProperties.map((property, idx) => (
                                    <div
                                        key={property.id}
                                        ref={(el) => {
                                            if (el) cardRefs.current.set(property.id, el);
                                            else cardRefs.current.delete(property.id);
                                        }}
                                    >
                                        <MapPropertyCard
                                            property={property}
                                            isSelected={selectedId === property.id}
                                            isHovered={hoveredId === property.id}
                                            onSelect={handleCardSelect}
                                            onHover={handleHover}
                                            onViewDetails={handleViewDetails}
                                            index={idx + 1}
                                        />
                                    </div>
                                ))}
                            </div>
                            {/* Sticky pagination footer — always visible, never scrolls */}
                            <div className="shrink-0 py-3 px-3">
                                {canLoadMore ? (
                                    <button
                                        onClick={handleShowMore}
                                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-full transition-all active:scale-95 cursor-pointer"
                                    >
                                        {tr('loadMoreShowing', { shown: displayCount, total: sortedProperties.length })}
                                    </button>
                                ) : (
                                    <p className="text-center text-[10px] text-slate-400 font-medium">{tr('allResultsLoaded', { count: sortedProperties.length })}</p>
                                )}
                            </div>
                        </>
                    ) : allProperties.some((p: any) => (p as any).priceLoading) ? (
                        // Catalog hotels exist but prices haven't arrived yet — show skeletons
                        <div className="flex flex-col gap-3 p-3 overflow-y-auto">
                            {[1, 2, 3, 4, 5, 6].map(n => (
                                <div key={n} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 flex gap-3 animate-pulse">
                                    <div className="w-16 h-16 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
                                    <div className="flex-1 flex flex-col gap-2 py-1">
                                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                                        <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mt-auto" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : allProperties.some((p: any) => (p as any).priceLoading) ? (
                        <PriceLoadingSidebar destination={destination ?? ''} />

                    ) : (
                        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                            <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {destination ? tr('noHotelsAvailableIn', { destination }) : tr('noHotelsAvailable')}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[220px]">
                                {tr('supplierUnavailableShort')}
                            </p>
                        </div>
                    )}
                </div>

                {/* RIGHT: Map */}
                <div
                    className="flex-1 h-full relative rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
                    style={{ marginRight: 'max(0px, calc((100vw - 1400px) / 2))' }}
                >
                    <SearchMapContainer
                        properties={mappableProperties}
                        selectedId={selectedId}
                        onSelectId={setSelectedId}
                        hoveredId={hoveredId}
                        onHoverId={setHoveredId}
                        onViewDetails={handleViewDetails}
                        searchOverlayClassName="absolute top-4 left-20 z-20 w-[300px] md:w-[360px]"
                        defaultCenter={fallbackCoords ?? undefined}
                    />
                </div>
            </div>

            {/* ── Mobile Map layout ── */}
            <div className={cn("flex lg:hidden flex-1 relative min-h-0 w-full mobile-search-map", showMobileMap ? "map-cards-visible" : "map-cards-hidden")}>
                <SearchMapContainer
                    properties={sortedProperties}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    hoveredId={hoveredId}
                    onHoverId={setHoveredId}
                    onViewDetails={handleViewDetails}
                    searchOverlayClassName="absolute top-4 left-4 right-4 z-20"
                    defaultCenter={fallbackCoords ?? undefined}
                />

                {/* Horizontal Swiper */}
                <AnimatePresence>
                    {showMobileMap && sortedProperties.length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={0.2}
                            dragDirectionLock
                            onDragEnd={(_, info) => {
                                if (info.offset.y > 40) {
                                    setShowMobileMap(false);
                                }
                            }}
                            className="absolute bottom-[58px] left-0 right-0 w-full z-20"
                        >
                            {/* Hotel count badge */}
                            <div className="px-4 pb-1.5 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    {tr('hotelsFound', { count: sortedProperties.length })}
                                </span>
                                <span className="text-[10px] text-slate-400">{t('swipeToBrowse')}</span>
                            </div>
                            <div className="w-full overflow-x-auto pb-2 px-3 snap-x snap-mandatory flex gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {sortedProperties.slice(0, 50).map((property, idx) => (
                                    <div key={property.id} className="snap-center shrink-0 w-[72vw] sm:w-[280px] landscape:w-[240px] shadow-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                        <MapPropertyCard
                                            property={property}
                                            isSelected={selectedId === property.id}
                                            isHovered={hoveredId === property.id}
                                            onSelect={handleCardSelect}
                                            onHover={handleHover}
                                            onViewDetails={handleViewDetails}
                                            index={idx + 1}
                                        />
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Swipe Up Handle when hidden */}
                <AnimatePresence>
                    {!showMobileMap && sortedProperties.length > 0 && (
                        <motion.div
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 50, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="absolute bottom-[80px] left-0 right-0 h-10 z-20 flex justify-center items-center cursor-grab active:cursor-grabbing"
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={0.2}
                            dragDirectionLock
                            onDragEnd={(_, info) => {
                                if (info.offset.y < -30) {
                                    setShowMobileMap(true);
                                }
                            }}
                        >
                            <div className="w-12 h-1.5 bg-slate-400/60 dark:bg-slate-500/60 backdrop-blur-sm rounded-full shadow-sm" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Floating List Button (Repositioned to left, above cards) */}
                <div className={cn(
                    "absolute left-4 z-50 transition-all duration-300",
                    showMobileMap ? "bottom-[168px]" : "bottom-[80px]",
                    "landscape:bottom-[100px] landscape:left-2"
                )}>
                    <button
                        onClick={handleBackToList}
                        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 font-bold text-[11px]"
                    >
                        <List size={14} />
                        {t('list')}
                    </button>
                </div>
            </div>
        </div>
    );
}



export { SearchMapView };