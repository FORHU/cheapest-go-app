'use client';

import React, { useMemo, useCallback } from 'react';
import { MappableProperty } from './utils/buildGeoJson';
import { useMapboxInstance } from './hooks/useMapboxInstance';
import { useMapInteractions, PoiData } from './hooks/useMapInteractions';
import { useMapViewport } from './hooks/useMapViewport';
import { MapContainer } from './components/MapContainer';
import { SelectedPropertyPopup } from './components/SelectedPropertyPopup';
import { Source, Layer } from 'react-map-gl/mapbox';

import { PoiPopup } from './components/PoiPopup';
import { MapMarker } from '../map/MapMarker';
import { MapPopup } from '../map/MapPopup';
import { MapSearchOverlay } from './components/MapSearchOverlay';
import { useRouter } from 'next/navigation';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useMapDetails } from './hooks/useMapDetails';
import { MapDetailsPanel } from './components/MapDetailsPanel';
import { env } from '@/utils/env';
import { Layers } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn, formatCurrency } from '@/lib/utils';
import { MapGemsPanel } from '../map/MapGemsPanel';
import { NearbyPlaceMarker } from '../map/NearbyPlaceMarker';
import { NearbyPlacePopup } from '../map/NearbyPlacePopup';
import { useNearbyGems } from '../property/hooks/useNearbyGems';
import type { NearbyPlace } from '../map/useMapNearbyPlaces';

// Haversine distance — defined outside component to avoid re-creation on every render
const calculateDistance = (l1: { lat: number; lng: number }, l2: { lat: number; lng: number }) => {
    const R = 6371;
    const dLat = (l2.lat - l1.lat) * (Math.PI / 180);
    const dLng = (l2.lng - l1.lng) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(l1.lat * (Math.PI / 180)) * Math.cos(l2.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(2);
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createCircleGeoJSON(center: [number, number], radiusMeters: number): any {
    const points = 64;
    const coords: [number, number][] = [];
    const R = 6371000;
    const lat = (center[1] * Math.PI) / 180;
    const lng = (center[0] * Math.PI) / 180;
    for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const dlat = (radiusMeters / R) * Math.cos(angle);
        const dlng = (radiusMeters / R) * Math.sin(angle) / Math.cos(lat);
        coords.push([((lng + dlng) * 180) / Math.PI, ((lat + dlat) * 180) / Math.PI]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

interface SearchMapContainerProps {
    properties: MappableProperty[];
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    hoveredId: string | null;
    onHoverId: (id: string | null) => void;
    onViewDetails: (id: string, offerId?: string) => void;
    searchOverlayClassName?: string;
    /** Override the initial map center when properties list is empty */
    defaultCenter?: { lng: number; lat: number };
}

export const SearchMapContainer = React.memo(({
    properties,
    selectedId,
    onSelectId,
    hoveredId,
    onHoverId,
    onViewDetails,
    searchOverlayClassName,
    defaultCenter,
}: SearchMapContainerProps) => {
    // 1. Map Instance
    const { mapRef, isMapLoaded, handleMapLoad, handleMapStyleChange } = useMapboxInstance();

    const isMobile = useIsMobile();
    const router = useRouter();
    const targetCurrency = useUserCurrency();

    // 3. Derived State & Currency Conversion
    const mappableProperties = useMemo(() => {
        return properties.filter(
            (p) =>
                p.coordinates &&
                p.coordinates.lat !== 0 &&
                p.coordinates.lng !== 0
        );
    }, [properties]);

    const markerPrices = useMemo(() => {
        const prices: Record<string, number> = {};
        for (const p of mappableProperties) {
            prices[p.id] = convertCurrency(p.price, p.currency || 'USD', targetCurrency);
        }
        return prices;
    }, [mappableProperties, targetCurrency]);

    const displayPrices = useMemo(() => {
        const formatted: Record<string, string> = {};
        for (const p of mappableProperties) {
            formatted[p.id] = formatCurrency(markerPrices[p.id] || 0, targetCurrency);
        }
        return formatted;
    }, [mappableProperties, markerPrices, targetCurrency]);

    // POI Selection/Hover State
    const [selectedPoi, setSelectedPoi] = React.useState<PoiData | null>(null);
    const [hoveredPoi, setHoveredPoi] = React.useState<PoiData | null>(null);

    // GPS Directions State
    const [routeGeometry, setRouteGeometry] = React.useState<any>(null);
    const [carDuration, setCarDuration] = React.useState<string | null>(null);
    const [walkDuration, setWalkDuration] = React.useState<string | null>(null);

    // 5. Interactions
    const { handleMapClick, onMouseMove, attachMouseLeave } = useMapInteractions({
        mapRef,
        onSelectId,
        onSelectPoi: setSelectedPoi,
        onHoverPoi: setHoveredPoi,
    });

    // Attach the mouseleave listener once the map instance is ready.
    // This restores the cursor to the CSS 'grab' base whenever the pointer
    // exits the canvas — fixes the invisible-cursor bug during throttle gaps.
    React.useEffect(() => {
        if (!isMapLoaded || !mapRef.current) return;
        const map = mapRef.current.getMap();
        if (!map) return;
        const cleanup = attachMouseLeave(map);
        return cleanup;
    }, [isMapLoaded, attachMouseLeave]);

    // 6. Viewport Management — no auto-zoom when a marker is clicked
    useMapViewport({
        mapRef,
        isMapLoaded,
        properties: mappableProperties,
        selectedId,
        disableFlyToSelected: true,
    });

    // Center and zoom to the selected property.
    // On desktop the MapPopup (anchor="bottom", offset=60) floats ~180px above the marker.
    // offset [0, 120] positions the hotel ~120px below viewport centre so the popup is
    // visually centred and clears the ~150px-tall gems panel at the bottom.
    // Mobile uses zoom 14 (vs 16 on desktop) to avoid loading heavy 3D tiles mid-animation.
    React.useEffect(() => {
        if (!selectedId || !isMapLoaded) return;
        const prop = mappableProperties.find(p => p.id === selectedId);
        if (!prop) return;
        const currentZoom = mapRef.current?.getZoom() ?? 12;
        const targetZoom = isMobile ? Math.max(currentZoom, 14) : Math.max(currentZoom, 16);
        mapRef.current?.easeTo({
            center: [prop.coordinates.lng, prop.coordinates.lat],
            zoom: targetZoom,
            offset: isMobile ? [0, 0] : [0, 120],
            duration: 800,
            essential: true,
        });
    }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Index map: propertyId → 1-based position in mappableProperties (for marker number badges)
    const propertyIndexMap = useMemo(() => {
        const map: Record<string, number> = {};
        mappableProperties.forEach((p, i) => { map[p.id] = i + 1; });
        return map;
    }, [mappableProperties]);

    // On pan: keep the hotel selection so POI markers stay visible on the map.
    // Only clear sub-selections (clicked POI popup and active gem highlight).
    const handleDragStart = useCallback(() => {
        setSelectedPoi(null);
        setActiveGemName(null);
        setSelectedNearbyPlace(null);
    }, []);

    // 7. Derived UI State

    const selectedProperty = useMemo(
        () => mappableProperties.find((p: MappableProperty) => p.id === selectedId) ?? null,
        [mappableProperties, selectedId]
    );
    const hoveredProperty = useMemo(
        () => mappableProperties.find((p: MappableProperty) => p.id === hoveredId) ?? null,
        [mappableProperties, hoveredId]
    );

    // Preview logic: prefer hover state for quick feedback, fallback to selected
    const previewProperty = useMemo(
        () => hoveredProperty || selectedProperty,
        [hoveredProperty, selectedProperty]
    );
    const activePoi = useMemo(() => hoveredPoi || selectedPoi, [hoveredPoi, selectedPoi]);

    const poiDistance = useMemo(
        () => previewProperty && activePoi
            ? calculateDistance(previewProperty.coordinates, activePoi.coordinates)
            : null,
        [previewProperty, activePoi]
    );

    // ── Nearby Gems (POI discovery panel) ────────────────────────────────────
    const [nearbyCategory, setNearbyCategory] = React.useState('all');
    const [nearbyRadius, setNearbyRadius] = React.useState(1000);
    const [activeGemName, setActiveGemName] = React.useState<string | null>(null);
    const [selectedNearbyPlace, setSelectedNearbyPlace] = React.useState<NearbyPlace | null>(null);

    // Delay the gems fetch until after the easeTo animation finishes (800ms duration + 100ms buffer).
    // Firing it immediately causes Google Places + Mapbox SearchBox calls to compete with
    // camera animation startup (Option A lag) and Stage-2 enrichment re-renders to hit
    // right as the map is rendering new tiles after landing (Option C freeze).
    const [gemsEnabled, setGemsEnabled] = React.useState(false);
    const gemsTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        if (gemsTimerRef.current) clearTimeout(gemsTimerRef.current);
        if (!selectedProperty) { setGemsEnabled(false); return; }
        gemsTimerRef.current = setTimeout(() => setGemsEnabled(true), 900);
        return () => { if (gemsTimerRef.current) clearTimeout(gemsTimerRef.current); };
    }, [selectedProperty?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const { nearbyGems, isFetchingGems } = useNearbyGems({
        isLoaded: isMapLoaded && !!selectedProperty && gemsEnabled,
        coordinates: selectedProperty
            ? { lat: selectedProperty.coordinates.lat, lng: selectedProperty.coordinates.lng }
            : undefined,
        selectedCategory: nearbyCategory,
        radiusMeters: nearbyRadius,
    });

    // API already filters by radius — use results directly
    const filteredGems = useMemo(
        () => (selectedProperty ? nearbyGems : []),
        [nearbyGems, selectedProperty],
    );

    const nearbyPlaceMarkers = useMemo<NearbyPlace[]>(() =>
        filteredGems.map((gem) => ({
            name: gem.properties?.name || '',
            category: gem.properties?.category || 'place',
            lat: gem.geometry?.coordinates[1],
            lng: gem.geometry?.coordinates[0],
            rating: gem.properties?.rating,
            userRatingsTotal: gem.properties?.userRatingsTotal,
            placeId: gem.properties?.place_id,
            vicinity: gem.properties?.vicinity,
        })),
        [filteredGems]
    );

    const radiusCircleGeoJSON = useMemo(() => {
        if (!selectedProperty) return null;
        return createCircleGeoJSON(
            [selectedProperty.coordinates.lng, selectedProperty.coordinates.lat],
            nearbyRadius,
        );
    }, [selectedProperty, nearbyRadius]);

    const nearbyPlaceDistanceKm = useMemo(() => {
        if (!selectedNearbyPlace || !selectedProperty) return null;
        return haversineKm(
            selectedProperty.coordinates.lat, selectedProperty.coordinates.lng,
            selectedNearbyPlace.lat, selectedNearbyPlace.lng,
        );
    }, [selectedNearbyPlace, selectedProperty]);

    const handleGemClick = useCallback((gem: any) => {
        const name = gem.properties?.name || gem.name;
        const lng = gem.geometry?.coordinates[0];
        const lat = gem.geometry?.coordinates[1];
        if (activeGemName === name) {
            setActiveGemName(null);
            setSelectedNearbyPlace(null);
            return;
        }
        setActiveGemName(name);
        setSelectedNearbyPlace({
            name,
            category: gem.properties?.category || 'place',
            lat, lng,
            rating: gem.properties?.rating,
            userRatingsTotal: gem.properties?.userRatingsTotal,
            placeId: gem.properties?.place_id,
            vicinity: gem.properties?.vicinity,
        });
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, pitch: 30, duration: 600 });
    }, [activeGemName]);

    // Clear gem state whenever the hotel selection is cleared
    React.useEffect(() => {
        if (!selectedId) {
            setActiveGemName(null);
            setSelectedNearbyPlace(null);
        }
    }, [selectedId]);

    // 6. Fetch Real Road GPS Route — only fires when user CLICKS a POI
    // (not on hover) to avoid unnecessary Directions API calls and re-renders.
    React.useEffect(() => {
        if (!previewProperty || !selectedPoi) {
            setRouteGeometry(null);
            setCarDuration(null);
            setWalkDuration(null);
            return;
        }

        const controller = new AbortController();

        const timer = setTimeout(async () => {
            try {
                const base = `https://api.mapbox.com/directions/v5/mapbox`;
                const coords = `${previewProperty.coordinates.lng},${previewProperty.coordinates.lat};${selectedPoi.coordinates.lng},${selectedPoi.coordinates.lat}`;
                const token = `access_token=${env.MAPBOX_TOKEN}`;
                const signal = controller.signal;

                const [drivingJson, walkingJson] = await Promise.all([
                    fetch(`${base}/driving/${coords}?geometries=geojson&overview=full&${token}`, { signal }).then(r => r.json()),
                    fetch(`${base}/walking/${coords}?overview=full&${token}`, { signal }).then(r => r.json()),
                ]);

                if (drivingJson.code === 'Ok' && drivingJson.routes?.length) {
                    const route = drivingJson.routes[0];
                    setRouteGeometry(route.geometry);
                    setCarDuration(`${Math.max(1, Math.round(route.duration / 60))} min`);
                }

                if (walkingJson.code === 'Ok' && walkingJson.routes?.length) {
                    const route = walkingJson.routes[0];
                    setWalkDuration(`${Math.max(1, Math.round(route.duration / 60))} min`);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') console.error('Directions error:', err);
            }
        }, 400);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [previewProperty, selectedPoi]);

    const poiRouteData = useMemo(() => routeGeometry ? ({
        type: 'Feature' as const,
        properties: {},
        geometry: routeGeometry
    }) : null, [routeGeometry]);

    const {
        mapType,
        setMapType,
        showDetailsPanel,
        setShowDetailsPanel,
        showLabels,
        setShowLabels,
        mapDetails,
        handleDetailToggle,
        terrainEnabled,
        mapStyleUrl,
        standardConfig,
    } = useMapDetails('default-3d');

    // Full 3D standard config for the search map.
    // On mobile, 3D geometry is disabled to avoid GPU overload during tile loading after easeTo.
    const searchStandardConfig = React.useMemo(() => ({
        ...standardConfig,
        show3dObjects: !isMobile,
        show3dBuildings: !isMobile,
        show3dFacades: !isMobile,
        show3dTrees: !isMobile,
        show3dLandmarks: !isMobile,
        lightPreset: 'day' as const,
    }), [standardConfig, isMobile]);


    // Reset loading state on style change to prevent "Style not done loading" errors
    React.useEffect(() => {
        handleMapStyleChange();
    }, [mapStyleUrl, handleMapStyleChange]);

    return (
        <div className="relative h-full w-full">
            <MapContainer
                mapRef={mapRef}
                mapStyle={mapStyleUrl}
                standardConfig={mapType === 'default-3d' ? searchStandardConfig : undefined}
                enable3DTerrain={terrainEnabled}
                antialias={!isMobile}
                maxPitch={85}
                initialViewState={{
                    longitude: defaultCenter?.lng ?? 139.6917,
                    latitude: defaultCenter?.lat ?? 35.6895,
                    zoom: 12,
                    pitch: 20,
                    bearing: -10,
                }}
                onLoad={handleMapLoad}
                onStyleReady={handleMapLoad}
                onClick={handleMapClick}
                onMouseMove={onMouseMove}
                onDragStart={handleDragStart}
                hideLayersButton={true}
            >

                {isMapLoaded && (
                    <>
                        {/* All hotel markers — always visible.
                            The selected hotel's marker is skipped here; SelectedPropertyPopup re-renders
                            it with isSelected=true and attaches the popup card. Other markers stay visible
                            so the user can see all hotels while a selection is active. */}
                        {mappableProperties.map((p) => (
                            selectedId === p.id && selectedProperty ? null :
                            <MapMarker
                                key={`marker-${p.id}`}
                                property={p}
                                displayPrice={markerPrices[p.id] ?? 0}
                                displayCurrency={targetCurrency}
                                isSelected={false}
                                isHovered={p.id === hoveredId}
                                onClick={onSelectId}
                                onHover={onHoverId}
                                index={propertyIndexMap[p.id]}
                            />
                        ))}

                        {/* Radius circle around selected hotel */}
                        {radiusCircleGeoJSON && (
                            <Source id="nearby-radius" type="geojson" data={radiusCircleGeoJSON}>
                                <Layer id="nearby-radius-fill" type="fill"
                                    paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.06 }} />
                                <Layer id="nearby-radius-outline" type="line"
                                    paint={{ 'line-color': '#3b82f6', 'line-width': 1.5, 'line-opacity': 0.35, 'line-dasharray': [3, 2] }} />
                            </Source>
                        )}

                        {/* Nearby place dot markers */}
                        {selectedProperty && nearbyPlaceMarkers.map((place) => (
                            <NearbyPlaceMarker
                                key={`${place.name}-${place.lat}-${place.lng}`}
                                place={place}
                                isSelected={activeGemName === place.name}
                                onClick={(p) => {
                                    const gem = filteredGems.find(g => (g.properties?.name || g.name) === p.name);
                                    if (gem) handleGemClick(gem);
                                }}
                            />
                        ))}

                        {poiRouteData && (
                            <Source id="poi-route-source" type="geojson" data={poiRouteData}>
                                <Layer
                                    id="poi-route-layer"
                                    type="line"
                                    paint={{
                                        'line-color': '#3b82f6',
                                        'line-width': 3,
                                        'line-opacity': 1,
                                    }}
                                />
                            </Source>
                        )}

                        {(selectedPoi || (hoveredPoi && !selectedPoi)) && (
                            <PoiPopup
                                poi={hoveredPoi || selectedPoi!}
                                distance={poiDistance ? `${poiDistance} km` : undefined}
                                carDuration={selectedPoi ? carDuration : null}
                                walkDuration={selectedPoi ? walkDuration : null}
                                onClose={() => setSelectedPoi(null)}
                            />
                        )}

                    </>
                )}

                <SelectedPropertyPopup
                    selectedProperty={selectedProperty}
                    onClose={() => {
                        onSelectId(null);
                        setSelectedPoi(null);
                        setActiveGemName(null);
                        setSelectedNearbyPlace(null);
                    }}
                    onViewDetails={onViewDetails}
                    onSelect={(id) => onSelectId(id)}
                    isMobile={isMobile}
                />

                {selectedNearbyPlace && (
                    <NearbyPlacePopup
                        place={selectedNearbyPlace}
                        distanceKm={nearbyPlaceDistanceKm}
                        onClose={() => {
                            setSelectedNearbyPlace(null);
                            setActiveGemName(null);
                        }}
                    />
                )}
            </MapContainer>

            {/* ── Mobile Centered Property Preview ── */}
            {isMobile && selectedProperty && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[min(200px,calc(100vw-48px))] pointer-events-auto">
                    <div className="relative">
                        <MapPopup
                            property={selectedProperty}
                            onClose={() => {
                                onSelectId(null);
                                setSelectedPoi(null);
                                setActiveGemName(null);
                                setSelectedNearbyPlace(null);
                            }}
                            onViewDetails={onViewDetails}
                            isCentered={true}
                        />
                    </div>
                </div>
            )}

            {/* ── Nearby Gems Panel — slides up when a hotel is selected ── */}
            {selectedProperty && (
                <div className="absolute bottom-2 left-2 right-2 z-10">
                    <MapGemsPanel
                        gems={filteredGems}
                        isLoading={isFetchingGems}
                        selectedCategory={nearbyCategory}
                        onCategoryChange={(cat) => {
                            setNearbyCategory(cat);
                            setActiveGemName(null);
                            setSelectedNearbyPlace(null);
                        }}
                        radiusMeters={nearbyRadius}
                        onRadiusChange={setNearbyRadius}
                        activeGemName={activeGemName}
                        onGemClick={handleGemClick}
                    />
                </div>
            )}

            {/* ── Map Search Overlay (Centered) ── */}
            <MapSearchOverlay
                className={searchOverlayClassName || "absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[60%] sm:w-[320px] md:w-[400px]"}
                onSelect={(r) => {
                    // 1. Move the map visually
                    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 15, pitch: 45, bearing: -10, duration: 1200 });

                    // 2. Trigger a global search refresh by updating URL
                    const params = new URLSearchParams(window.location.search);
                    params.set('destination', r.name);
                    params.set('lat', r.lat.toString());
                    params.set('lng', r.lng.toString());
                    router.push(`/search?${params.toString()}`);
                }}
            />

            {/* ── Layers button (Top-left) ── */}
            {!showDetailsPanel && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowDetailsPanel(true);
                    }}
                    className={cn(
                        "absolute left-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-md shadow-lg border border-slate-200 dark:border-slate-700 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 group h-[30px] shrink-0",
                        "top-[58px] lg:top-4"
                    )}
                >
                    <Layers className="w-4 h-4 text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors" strokeWidth={2} />
                    <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
                    <svg className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            )}

            {/* ── Map Details Panel ── */}
            <MapDetailsPanel
                isOpen={showDetailsPanel}
                onClose={() => setShowDetailsPanel(false)}
                mapType={mapType}
                onMapTypeChange={setMapType}
                details={mapDetails}
                onDetailToggle={handleDetailToggle}
                showLabels={showLabels}
                onLabelsToggle={() => setShowLabels((prev) => !prev)}
            />
        </div>
    );
});
