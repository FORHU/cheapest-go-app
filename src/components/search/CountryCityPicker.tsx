'use client';

import { useTranslations } from 'next-intl';
import { MapPin, ChevronRight } from 'lucide-react';
import { COUNTRY_POPULAR_CITIES, COUNTRY_DEFAULT_CITY, COUNTRY_SEARCH_LIST } from '@/lib/constants/countries';

interface CountryCityPickerProps {
    searchParams: Record<string, string>;
}

function buildCityUrl(searchParams: Record<string, string>, city: string): string {
    const params = new URLSearchParams(searchParams);
    params.set('destination', city);
    params.delete('destinationType');
    return `/search?${params.toString()}`;
}

/**
 * Shown on the results page when the user searched by country instead of city.
 * Displays which city is currently showing and lets them jump to other popular cities.
 */
export function CountryCityPicker({ searchParams }: CountryCityPickerProps) {
    const t = useTranslations('search');
    if (searchParams.destinationType !== 'country') return null;

    const countryCode = searchParams.countryCode || '';
    const cities = COUNTRY_POPULAR_CITIES[countryCode] ?? [];
    if (cities.length === 0) return null;

    const countryName =
        COUNTRY_SEARCH_LIST.find(c => c.code === countryCode)?.name ??
        searchParams.destination ??
        '';

    const currentCity =
        searchParams.destination && !COUNTRY_SEARCH_LIST.some(c => c.name === searchParams.destination)
            ? searchParams.destination
            : (COUNTRY_DEFAULT_CITY[countryCode] ?? cities[0]);

    return (
        <div className="w-full mb-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                {/* Context label */}
                <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0">
                    <MapPin size={13} className="shrink-0" />
                    <span>
                        {t('results.showingHotelsIn')} <strong>{currentCity}</strong>
                        {countryName ? ` · ${countryName}` : ''}
                    </span>
                    <ChevronRight size={13} className="shrink-0 opacity-60" />
                    <span className="text-slate-500 dark:text-slate-400 font-normal">
                        {t('results.otherCities')}
                    </span>
                </div>

                {/* City pills */}
                <div className="flex flex-wrap gap-1.5">
                    {cities
                        .filter(city => city !== currentCity)
                        .map(city => (
                            <a
                                key={city}
                                href={buildCityUrl(searchParams, city)}
                                className="px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                {city}
                            </a>
                        ))}
                </div>
            </div>
        </div>
    );
}
