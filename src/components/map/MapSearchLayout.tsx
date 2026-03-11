'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, X } from 'lucide-react';
import { type Property } from '@/types';
import { PropertyMapList, scrollToProperty } from './PropertyMapList';
import { PropertyMapView } from './PropertyMapView';
import { MapModal } from './MapModal';
import type { MappableProperty } from './types';

interface MapSearchLayoutProps {
    /** Properties fetched server-side and passed as props */
    properties: Property[];
    /** Optional title for the property list header */
    title?: string;
}

const LIST_CONTAINER_ID = 'map-property-list';

/**
 * Full-page Agoda/Airbnb-style split layout:
 * LEFT  — scrollable property list
 * RIGHT — sticky Mapbox map
 *
 * All data comes via props (server-fetched). No useEffect, no React Query,
 * no "use server", no client-side fetching.
 */
function MapSearchLayout({ properties, title }: MapSearchLayoutProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [showMap, setShowMap] = useState(true);

    // Filter to only properties with valid coordinates
    const mappableProperties = useMemo<MappableProperty[]>(
        () =>
            properties.filter(
                (p): p is MappableProperty =>
                    p.coordinates != null &&
                    typeof p.coordinates.lat === 'number' &&
                    typeof p.coordinates.lng === 'number' &&
                    !isNaN(p.coordinates.lat) &&
                    !isNaN(p.coordinates.lng)
            ),
        [properties]
    );

    const handleSelect = useCallback((id: string | null) => {
        setSelectedId(id);
        if (id) {
            // Scroll the list card into view
            scrollToProperty(LIST_CONTAINER_ID, id);
        }
    }, []);

    const handleListSelect = useCallback(
        (id: string) => {
            setSelectedId((prev) => (prev === id ? null : id));
        },
        []
    );

    const handleHover = useCallback((id: string | null) => {
        setHoveredId(id);
    }, []);

    const handleViewDetails = useCallback(
        (id: string) => {
            const params = new URLSearchParams(searchParams?.toString() || '');
            router.push(`/property/${id}?${params.toString()}`);
        },
        [router, searchParams]
    );

    return (
        <div className="flex h-full w-full relative">
            {/* LEFT: Property List */}
            <div
                id={LIST_CONTAINER_ID}
                className={`
                    flex-shrink-0 h-full overflow-hidden
                    transition-all duration-300 ease-in-out
                    ${showMap ? 'w-full lg:w-[420px] xl:w-[460px]' : 'w-full'}
                    border-r border-slate-200 dark:border-slate-800
                `}
            >
                <PropertyMapList
                    properties={mappableProperties}
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    onSelect={handleListSelect}
                    onHover={handleHover}
                    title={title}
                />
            </div>

            {/* RIGHT: Map (Tablet/Desktop) */}
            {/* Show side-by-side on md+ */}
            <div className="hidden md:block flex-1 h-full sticky top-0">
                <PropertyMapView
                    properties={mappableProperties}
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    onSelect={handleSelect}
                    onHover={handleHover}
                    onViewDetails={handleViewDetails}
                />
            </div>

            {/* Mobile: Map Toggle FAB */}
            <button
                onClick={() => setShowMap(true)}
                className="md:hidden fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-full shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
                <MapPin size={18} />
                <span className="text-sm font-semibold">Map</span>
            </button>

            {/* Mobile Map Modal */}
            <MapModal
                isOpen={showMap}
                onClose={() => setShowMap(false)}
                properties={mappableProperties}
                selectedId={selectedId}
                onSelectId={handleSelect}
                hoveredId={hoveredId}
                onHoverId={handleHover}
                onViewDetails={handleViewDetails}
            />
        </div>
    );
}

export { MapSearchLayout };
export type { MapSearchLayoutProps };
