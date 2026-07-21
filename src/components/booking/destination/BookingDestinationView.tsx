'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { CheckCircle, Luggage, ArrowRight, MapPinned } from 'lucide-react';
import { useProperty, useBookingDates, useBookingId } from '@/stores/bookingStore';
import { useUserCurrency, useUserCountry } from '@/stores/searchStore';
import { useWeather } from '@/hooks/useWeather';
import { WeatherWidget } from '@/components/property/WeatherWidget';
import { buildPropertySlug } from '@/lib/utils';
import type { MappableProperty } from '@/components/map/types';
import { DestinationClocks, resolveDestTimeZone } from './DestinationClocks';
import { CurrencyConverterCard } from './CurrencyConverterCard';

// Mapbox must not run during SSR — mirror MapSearchLayout's dynamic import.
const PropertyMapView = dynamic(
    () => import('@/components/map/PropertyMapView').then((m) => m.PropertyMapView),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ),
    }
);

function hasCoords(p: ReturnType<typeof useProperty>): p is MappableProperty {
    return (
        !!p &&
        p.coordinates != null &&
        typeof p.coordinates.lat === 'number' &&
        typeof p.coordinates.lng === 'number' &&
        !isNaN(p.coordinates.lat) &&
        !isNaN(p.coordinates.lng)
    );
}

const dateFmt = (d: Date | null) =>
    d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export function BookingDestinationView() {
    const t = useTranslations('bookingDestination');
    const router = useRouter();
    const property = useProperty();
    const { checkIn, checkOut } = useBookingDates();
    const bookingId = useBookingId();
    const userCurrency = useUserCurrency();
    const userCountry = useUserCountry();

    const hotel = hasCoords(property) ? property : null;

    // No booked property in the store (e.g. direct visit) → send to trips.
    useEffect(() => {
        if (!hotel) {
            const t = setTimeout(() => router.replace('/trips'), 1500);
            return () => clearTimeout(t);
        }
    }, [hotel, router]);

    // Map selection state (this page shows a single booked hotel)
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const properties = useMemo<MappableProperty[]>(() => (hotel ? [hotel] : []), [hotel]);

    const lat = hotel?.coordinates.lat;
    const lng = hotel?.coordinates.lng;

    const { weather, isLoading: weatherLoading, refetch } = useWeather({
        lat,
        lng,
        enabled: !!hotel,
    });

    const originTimeZone = useMemo(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
            return 'UTC';
        }
    }, []);

    const originLabel = useMemo(() => {
        const city = originTimeZone.split('/').pop()?.replace(/_/g, ' ') || originTimeZone;
        return userCountry ? `${city}, ${userCountry}` : city;
    }, [originTimeZone, userCountry]);

    const destTimeZone = useMemo(() => resolveDestTimeZone(weather?.timezone, lng), [weather?.timezone, lng]);
    const destinationLabel = hotel?.city || hotel?.location || hotel?.name || 'Destination';
    const destinationCurrency = hotel?.currency || 'USD';

    const handleViewDetails = useCallback(
        (id: string) => {
            if (!hotel) return;
            router.push(`/property/${buildPropertySlug(hotel.name, id)}`);
        },
        [hotel, router]
    );

    if (!hotel) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 h-[60vh] px-6 text-center">
                <MapPinned className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('noBooking')}
                </p>
                <button
                    onClick={() => router.replace('/trips')}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                >
                    {t('goToTrips')}
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-[calc(100dvh-4rem)] min-h-[560px] flex flex-col">
            <div className="shrink-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2">
                    {/* Confirmation */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">{t('confirmed')}</p>
                                {bookingId && (
                                    <span className="hidden sm:inline font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        #{bookingId}
                                    </span>
                                )}
                                <span className="hidden lg:inline text-[10px] text-slate-400 dark:text-slate-500">· {t('emailed')}</span>
                            </div>
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                {hotel.name}
                                {checkIn && checkOut && (
                                    <span className="hidden md:inline text-slate-400 dark:text-slate-500 font-medium">
                                        {' · '}{dateFmt(checkIn)} – {dateFmt(checkOut)}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Widgets */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <DestinationClocks
                            originLabel={originLabel}
                            originTimeZone={originTimeZone}
                            destinationLabel={destinationLabel}
                            destinationTimeZone={destTimeZone}
                        />
                        <CurrencyConverterCard
                            originCurrency={userCurrency}
                            destinationCurrency={destinationCurrency}
                        />
                        <WeatherWidget weather={weather} isLoading={weatherLoading} onRefresh={refetch} isFullscreen />
                        <button
                            onClick={() => router.push('/trips')}
                            className="hidden sm:flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity active:scale-95"
                        >
                            <Luggage size={14} />
                            <span className="hidden md:inline">{t('myTrips')}</span>
                            <ArrowRight size={13} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Map (≥80% of the page) ── */}
            <div className="relative flex-1 min-h-0 w-full max-w-[1400px] mx-auto px-4 sm:px-6 pt-4 pb-4">
                <PropertyMapView
                    properties={properties}
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    onSelect={setSelectedId}
                    onHover={setHoveredId}
                    onViewDetails={handleViewDetails}
                />
            </div>
        </div>
    );
}

export default BookingDestinationView;
