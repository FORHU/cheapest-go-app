'use client';

import React, { useState } from 'react';
import { MapResultsClient } from './MapResultsClient';
import { HotelResultsClient } from './HotelResultsClient';
import SearchFilters from './SearchFilters';
import { CountryCityPicker } from './CountryCityPicker';
import { ResponsiveSearchHeader } from './ResponsiveSearchHeader';
import BackButton from '@/components/common/BackButton';

interface SearchPageClientProps {
    searchParams: Record<string, string>;
    destination: string;
    initialFacilities: Array<{ id: number; name: string }>;
    initialView: 'map' | 'list';
}

export function SearchPageClient({ searchParams, destination, initialFacilities, initialView }: SearchPageClientProps) {
    const [view, setView] = useState<'map' | 'list'>(initialView);
    // Lazy-mount list view — only after user first switches to it (or starts there).
    // Prevents HotelResultsClient from fetching before the map has populated the cache.
    const [listMounted, setListMounted] = useState(initialView === 'list');

    const switchView = (v: 'map' | 'list') => {
        setView(v);
        if (v === 'list') setListMounted(true);
        const params = new URLSearchParams(window.location.search);
        if (v === 'list') params.set('view', 'list');
        else params.delete('view');
        window.history.replaceState(null, '', `/search?${params.toString()}`);
    };

    return (
        <>
            {/* Map view — always mounted once rendered, hidden via CSS when inactive */}
            <main
                className={view === 'map' ? 'h-[calc(100dvh-64px)] w-full overflow-hidden flex flex-col' : 'hidden'}
                aria-hidden={view !== 'map'}
            >
                {searchParams.destinationType === 'country' && (
                    <div className="shrink-0 px-3 pt-2">
                        <CountryCityPicker searchParams={searchParams} />
                    </div>
                )}
                <div className="flex-1 overflow-hidden">
                    <MapResultsClient
                        searchParams={searchParams}
                        destination={destination}
                        onSwitchView={switchView}
                    />
                </div>
            </main>

            {/* List view — lazily mounted on first switch, then kept alive via CSS */}
            {listMounted && (
                <main
                    className={view === 'list' ? 'min-h-screen pt-3 md:pt-6 pb-8 md:pb-16 px-3 md:px-6' : 'hidden'}
                    aria-hidden={view !== 'list'}
                >
                    <div className="max-w-[1400px] mx-auto">
                        <div className="hidden lg:block mb-4">
                            <BackButton label="Back to Home" href="/" />
                        </div>
                        <ResponsiveSearchHeader />
                    </div>
                    <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
                        <SearchFilters
                            initialFacilities={initialFacilities}
                            previewCoordinates={null}
                        />
                        <HotelResultsClient
                            searchParams={searchParams}
                            onSwitchView={switchView}
                        />
                    </div>
                </main>
            )}
        </>
    );
}
