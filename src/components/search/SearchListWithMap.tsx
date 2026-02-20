'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MapRef } from 'react-map-gl/mapbox';
import { NavigationControl } from 'react-map-gl/mapbox';
import { Map } from '@/components/ui/map';
import { MapMarker } from '@/components/map/MapMarker';
import { MapPopup } from '@/components/map/MapPopup';
import { computeBounds } from '@/components/map/types';
import type { MappableProperty } from '@/components/map/types';
import type { Property } from '@/data/mockProperties';
import { MapModal } from '@/components/map/MapModal';
import { MapPin } from 'lucide-react';

interface SearchListWithMapProps {
    properties: Property[];
    /** The left-side content (filters + results) rendered by the server */
    children: React.ReactNode;
}

/**
 * Wraps the search list view with a sticky map sidebar on the RIGHT.
 *
 * Layout on desktop (lg+):
 *   LEFT  — filters + search results (children, scrollable)
 *   RIGHT — sticky Mapbox map with property markers + popups
 *
 * On mobile/tablet (< lg): map is accessible via a FAB that opens a full-screen modal.
 * Tablet (md): Can optionally show side-by-side if screened is large enough, or just use modal.
 * User requested "tablet 50/50 layout".
 */
function SearchListWithMap({ properties, children }: SearchListWithMapProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const mapRef = useRef<MapRef>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [showMobileMap, setShowMobileMap] = useState(false);

    // Filter only properties with real coordinates
    const mappableProperties = useMemo<MappableProperty[]>(
        () =>
            properties.filter(
                (p): p is MappableProperty =>
                    p.coordinates != null &&
                    typeof p.coordinates.lat === 'number' &&
                    typeof p.coordinates.lng === 'number' &&
                    p.coordinates.lat !== 0 &&
                    p.coordinates.lng !== 0
            ),
        [properties]
    );

    const bounds = useMemo(() => computeBounds(mappableProperties), [mappableProperties]);

    const selectedProperty = useMemo(
        () => (selectedId ? mappableProperties.find((p) => p.id === selectedId) ?? null : null),
        [selectedId, mappableProperties]
    );

    // ── Handlers ──────────────────────────────────────────────

    const handleViewDetails = useCallback(
        (id: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('view');
            router.push(`/property/${id}?${params.toString()}`);
        },
        [router, searchParams]
    );

    const handleMarkerClick = useCallback(
        (id: string) => {
            const property = mappableProperties.find((p) => p.id === id);
            if (!property) return;

            setSelectedId(id);

            mapRef.current?.flyTo({
                center: [property.coordinates.lng, property.coordinates.lat],
                zoom: 15,
                pitch: 45,
                duration: 1200,
            });
        },
        [mappableProperties]
    );

    const handleHover = useCallback((id: string | null) => {
        setHoveredId(id);
    }, []);

    const handlePopupClose = useCallback(() => {
        setSelectedId(null);
    }, []);

    const handleMapClick = useCallback(() => {
        setSelectedId(null);
    }, []);

    const handleMapLoad = useCallback(() => {
        if (mappableProperties.length === 0) return;
        const map = mapRef.current;
        if (!map) return;

        if (mappableProperties.length === 1) {
            map.flyTo({
                center: [bounds.centerLng, bounds.centerLat],
                zoom: 15,
                pitch: 45,
                bearing: -10,
                duration: 0,
            });
            return;
        }

        map.fitBounds(
            [
                [bounds.minLng, bounds.minLat],
                [bounds.maxLng, bounds.maxLat],
            ],
            {
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                maxZoom: 16,
                duration: 0,
                pitch: 45,
                bearing: -10,
            }
        );
    }, [mappableProperties.length, bounds]);

    // If no mappable properties, just render children without map
    if (mappableProperties.length === 0) {
        return <>{children}</>;
    }

    return (
        <div className="flex flex-col md:flex-row gap-0 w-full relative">
            {/* LEFT — Filters + Search Results (scrollable, passed as children) */}
            <div className="flex-1 min-w-0">
                {children}
            </div>

            {/* RIGHT — Sticky Map Sidebar (desktop/tablet only) */}
            {/* Hidden on mobile (< md), Visible on tablet (md+) */}
            <div className="hidden md:block md:w-[45%] lg:w-[45%] xl:w-[40%] flex-shrink-0">
                <div className="sticky top-[80px] h-[calc(100vh-120px)] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 ml-4 lg:ml-6">
                    <Map
                        ref={mapRef}
                        mapStyle="standard"
                        standardConfig={{
                            lightPreset: 'day',
                            show3dObjects: true,
                            show3dBuildings: true,
                        }}
                        initialViewState={{
                            longitude: bounds.centerLng || 120.596,
                            latitude: bounds.centerLat || 14.599,
                            zoom: 14,
                            pitch: 45,
                            bearing: -10,
                        }}
                        maxPitch={60}
                        onClick={handleMapClick}
                        onLoad={handleMapLoad}
                        className="!rounded-none !min-h-0 h-full"
                    >
                        <NavigationControl position="top-right" showCompass visualizePitch />

                        {mappableProperties.map((property) => (
                            <MapMarker
                                key={property.id}
                                property={property}
                                isSelected={selectedId === property.id}
                                isHovered={hoveredId === property.id}
                                onClick={handleMarkerClick}
                                onHover={handleHover}
                            />
                        ))}

                        {selectedProperty && (
                            <MapPopup
                                property={selectedProperty}
                                onClose={handlePopupClose}
                                onViewDetails={handleViewDetails}
                            />
                        )}
                    </Map>

                    {/* Property count badge */}
                    <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {mappableProperties.length} properties on map
                    </div>
                </div>
            </div>

            {/* Mobile: Map Toggle FAB (< md) */}
            <button
                onClick={() => setShowMobileMap(true)}
                className="md:hidden fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-full shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
                <MapPin size={18} />
                <span className="text-sm font-semibold">Map</span>
            </button>

            {/* Mobile Map Modal */}
            <MapModal
                isOpen={showMobileMap}
                onClose={() => setShowMobileMap(false)}
                properties={mappableProperties}
                selectedId={selectedId}
                onSelectId={setSelectedId}
                hoveredId={hoveredId}
                onHoverId={setHoveredId}
                onViewDetails={handleViewDetails}
            />
        </div>
    );
}

export { SearchListWithMap };
export type { SearchListWithMapProps };
