'use client';

import React, { useMemo, useCallback } from 'react';
import { MappableProperty } from './utils/buildGeoJson';
import { useMapboxInstance } from './hooks/useMapboxInstance';
import { useMapMarkers } from './hooks/useMapMarkers';
import { useMapInteractions, PoiData } from './hooks/useMapInteractions';
import { useMapViewport } from './hooks/useMapViewport';
import { MapContainer } from './components/MapContainer';
import { ClusterLayer } from './components/ClusterLayer';
import { SelectedPropertyPopup } from './components/SelectedPropertyPopup';
import { Source, Layer } from 'react-map-gl/mapbox';

import { PoiPopup } from './components/PoiPopup';
import { MapMarker } from '../map/MapMarker';
import { MapSearchOverlay } from './components/MapSearchOverlay';
import { useRouter } from 'next/navigation';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';
import { useMapDetails } from './hooks/useMapDetails';
import { MapDetailsPanel } from './components/MapDetailsPanel';
import { env } from '@/utils/env';
import { Layers } from 'lucide-react';
import { useKakaoSearch } from './hooks/useKakaoSearch';
import { isLocationInKorea } from '@/utils/geo';

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

interface SearchMapContainerProps {
    properties: MappableProperty[];
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    hoveredId: string | null;
    onHoverId: (id: string | null) => void;
    onViewDetails: (id: string, offerId?: string) => void;
    searchOverlayClassName?: string;
}

export const SearchMapContainer = React.memo(({
    properties,
    selectedId,
    onSelectId,
    hoveredId,
    onHoverId,
    onViewDetails,
    searchOverlayClassName,
}: SearchMapContainerProps) => {
    // 1. Map Instance
    const { mapRef, isMapLoaded, handleMapLoad, handleMapStyleChange } = useMapboxInstance();

    // 2. Data Preparation
    const { mappableProperties, geoJsonData, shouldCluster } = useMapMarkers(properties);
    const router = useRouter();

    // POI Selection/Hover State
    const [selectedPoi, setSelectedPoi] = React.useState<PoiData | null>(null);
    const [hoveredPoi, setHoveredPoi] = React.useState<PoiData | null>(null);

    // GPS Directions State
    const [routeGeometry, setRouteGeometry] = React.useState<any>(null);
    const [carDuration, setCarDuration] = React.useState<string | null>(null);
    const [walkDuration, setWalkDuration] = React.useState<string | null>(null);

    // 3. Interactions
    const { handleMapClick, onMouseMove } = useMapInteractions({
        mapRef,
        onSelectId,
        onSelectPoi: setSelectedPoi,
        onHoverPoi: setHoveredPoi,
    });

    // 4. Viewport Management
    useMapViewport({
        mapRef,
        isMapLoaded,
        properties: mappableProperties,
        selectedId,
    });

    // 5. Derived State
    const targetCurrency = useUserCurrency();
    const markerPrices = useMemo(() => {
        const prices: Record<string, number> = {};
        for (const p of mappableProperties) {
            prices[p.id] = convertCurrency(p.price, p.currency || 'USD', targetCurrency);
        }
        return prices;
    }, [mappableProperties, targetCurrency]);

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

    // 6. Fetch Real Road GPS Route — debounced so rapid hover/select changes
    // don't fire multiple in-flight Mapbox Directions requests.
    // Route state is reset immediately when either endpoint becomes unavailable.
    React.useEffect(() => {
        if (!previewProperty || !selectedPoi) {
            setRouteGeometry(null);
            setCarDuration(null);
            setWalkDuration(null);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const base = `https://api.mapbox.com/directions/v5/mapbox`;
                const coords = `${previewProperty.coordinates.lng},${previewProperty.coordinates.lat};${selectedPoi.coordinates.lng},${selectedPoi.coordinates.lat}`;
                const token = `access_token=${env.MAPBOX_TOKEN}`;

                // Fetch driving and walking in parallel.
                // No `alternatives=true` — the default single best route is sufficient.
                const [drivingJson, walkingJson] = await Promise.all([
                    fetch(`${base}/driving/${coords}?geometries=geojson&overview=full&${token}`).then(r => r.json()),
                    fetch(`${base}/walking/${coords}?overview=full&${token}`).then(r => r.json()),
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
            } catch (err) {
                console.error('Directions error:', err);
            }
        }, 400);

        return () => clearTimeout(timer);
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
        discoveryEnabled,
        mapStyleUrl,
        standardConfig,
    } = useMapDetails();

    // 7. Kakao Discovery for Korea
    const { results: recommendedPlaces, fetchRecommendations: fetchKakaoRecommendations } = useKakaoSearch();
    const lastDiscoveryFetch = React.useRef<{ lat: number, lng: number } | null>(null);

    /** Runs the Kakao discovery check for the current map centre. */
    const runKakaoDiscovery = useCallback(() => {
        if (!isMapLoaded || !discoveryEnabled) return;

        const center = mapRef.current?.getCenter();
        if (!center) return;

        const distance = lastDiscoveryFetch.current
            ? calculateDistance(lastDiscoveryFetch.current, { lat: center.lat, lng: center.lng })
            : 1000;

        if (Number(distance) > 2 && isLocationInKorea(center.lat, center.lng)) {
            fetchKakaoRecommendations(center.lat, center.lng);
            lastDiscoveryFetch.current = { lat: center.lat, lng: center.lng };
        }
    }, [isMapLoaded, discoveryEnabled, fetchKakaoRecommendations, mapRef]);

    // Trigger on load / toggle
    React.useEffect(() => {
        runKakaoDiscovery();
    }, [runKakaoDiscovery]);

    // Construct GeoJSON for recommended places
    const recommendedGeoJson = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: recommendedPlaces.map(p => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
            properties: {
                name: p.name,
                category: p.category,
                isKakao: true,
                id: p.id
            }
        }))
    }), [recommendedPlaces]);

    // Reset loading state on style change to prevent "Style not done loading" errors
    React.useEffect(() => {
        handleMapStyleChange();
    }, [mapStyleUrl, handleMapStyleChange]);

    return (
        <div className="relative h-full w-full">
            <MapContainer
                mapRef={mapRef}
                mapStyle={mapStyleUrl}
                standardConfig={mapType === 'default-3d' ? standardConfig : undefined}
                enable3DTerrain={terrainEnabled}
                initialViewState={{
                    longitude: 120.596,
                    latitude: 16.402, // Centered on Baguio City
                    zoom: 14.5,
                    pitch: 45,
                    bearing: -10,
                }}
                onLoad={handleMapLoad}
                onStyleReady={handleMapLoad}
                onClick={handleMapClick}
                onMouseMove={onMouseMove}
                // Re-check Kakao discovery whenever the user finishes panning/zooming
                onMoveEnd={runKakaoDiscovery}
                hideLayersButton={true}
            >

                {isMapLoaded && (
                    <>
                        <ClusterLayer
                            geoJsonData={geoJsonData}
                            shouldCluster={shouldCluster}
                        />

                        {mappableProperties.map(property => (
                            <MapMarker
                                key={property.id}
                                property={property}
                                displayPrice={markerPrices[property.id] ?? 0}
                                displayCurrency={targetCurrency}
                                isSelected={property.id === selectedId}
                                isHovered={property.id === hoveredId}
                                onClick={onSelectId}
                                onHover={onHoverId}
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

                        {discoveryEnabled && recommendedPlaces.length > 0 && (
                            <Source id="discovery-source" type="geojson" data={recommendedGeoJson}>
                                {/* Outer glow layer */}
                                <Layer
                                    id="discovery-poi-glow"
                                    type="circle"
                                    paint={{
                                        'circle-radius': 12,
                                        'circle-color': [
                                            'match',
                                            ['get', 'category'],
                                            'restaurant', '#f43f5e',
                                            'cafe', '#f97316',
                                            'park', '#22c55e',
                                            'transit', '#3b82f6',
                                            '#8b5cf6'
                                        ],
                                        'circle-blur': 0.8,
                                        'circle-opacity': 0.4
                                    }}
                                />
                                <Layer
                                    id="discovery-poi-layer"
                                    type="circle"
                                    paint={{
                                        'circle-radius': [
                                            'interpolate',
                                            ['linear'],
                                            ['zoom'],
                                            10, 6,
                                            15, 10
                                        ],
                                        'circle-color': [
                                            'match',
                                            ['get', 'category'],
                                            'restaurant', '#f43f5e',
                                            'cafe', '#f97316',
                                            'park', '#22c55e',
                                            'transit', '#3b82f6',
                                            '#8b5cf6'
                                        ],
                                        'circle-stroke-width': 2,
                                        'circle-stroke-color': '#fff'
                                    }}
                                />
                                <Layer
                                    id="discovery-poi-labels"
                                    type="symbol"
                                    layout={{
                                        'text-field': ['get', 'name'],
                                        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
                                        'text-radial-offset': 1.2,
                                        'text-justify': 'auto',
                                        'text-size': [
                                            'interpolate',
                                            ['linear'],
                                            ['zoom'],
                                            12, 0,
                                            15, 12
                                        ],
                                        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                                    }}
                                    paint={{
                                        'text-color': '#334155',
                                        'text-halo-color': '#ffffff',
                                        'text-halo-width': 2,
                                    }}
                                />
                            </Source>
                        )}
                    </>
                )}

                <SelectedPropertyPopup
                    selectedProperty={selectedProperty}
                    onClose={() => {
                        onSelectId(null);
                        setSelectedPoi(null);
                    }}
                    onViewDetails={onViewDetails}
                    onSelect={(id) => onSelectId(id)}
                />
            </MapContainer>

            {/* ── Map Search Overlay (Centered) ── */}
            <MapSearchOverlay
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[60%] sm:w-[320px] md:w-[400px]"
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
                    className="absolute top-4 left-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 px-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 group h-[38px] shrink-0"
                >
                    <Layers className="w-5 h-5 text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                    <svg className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
