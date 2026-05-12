'use client';

import React, { useMemo, useCallback } from 'react';
import { MappableProperty } from './utils/buildGeoJson';
import { useMapboxInstance } from './hooks/useMapboxInstance';
import { useMapInteractions, PoiData } from './hooks/useMapInteractions';
import { useMapViewport } from './hooks/useMapViewport';
import { MapContainer } from './components/MapContainer';
import { ClusterLayer } from './components/ClusterLayer';
import { SelectedPropertyPopup } from './components/SelectedPropertyPopup';
import { Source, Layer } from 'react-map-gl/mapbox';

import { PoiPopup } from './components/PoiPopup';
import { MapMarker } from '../map/MapMarker';
import { ClusterMarker } from '../map/ClusterMarker';
import { MapPopup } from '../map/MapPopup';
import useSupercluster from 'use-supercluster';
import { BBox } from 'supercluster';
import { MapSearchOverlay } from './components/MapSearchOverlay';
import { useRouter } from 'next/navigation';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useMapDetails } from './hooks/useMapDetails';
import { MapDetailsPanel } from './components/MapDetailsPanel';
import { env } from '@/utils/env';
import { Layers } from 'lucide-react';
import { useKakaoSearch } from './hooks/useKakaoSearch';
import { isLocationInKorea } from '@/utils/geo';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn, formatCurrency } from '@/lib/utils';

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
    const [bounds, setBounds] = React.useState<BBox | null>(null);
    const [zoom, setZoom] = React.useState(12);

    // Update bounds and zoom when map moves
    const updateMapState = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        
        const b = map.getBounds();
        setBounds([
            b.getWest(),
            b.getSouth(),
            b.getEast(),
            b.getNorth()
        ]);
        setZoom(map.getZoom());
    }, [mapRef]);

    // Initial state and event listeners
    React.useEffect(() => {
        if (isMapLoaded) {
            updateMapState();
        }
    }, [isMapLoaded, updateMapState]);

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

    // 4. Map Data & Preparation
    const points = useMemo(() => mappableProperties.map(p => ({
        type: 'Feature' as const,
        properties: {
            cluster: false,
            propertyId: p.id,
            price: markerPrices[p.id],
            property: p
        },
        geometry: {
            type: 'Point' as const,
            coordinates: [p.coordinates.lng, p.coordinates.lat]
        }
    })), [mappableProperties, markerPrices]);

    const { clusters, supercluster } = useSupercluster({
        points: points as any,
        bounds: bounds!,
        zoom,
        options: { radius: 75, maxZoom: 16 }
    });

    // POI Selection/Hover State
    const [selectedPoi, setSelectedPoi] = React.useState<PoiData | null>(null);
    const [hoveredPoi, setHoveredPoi] = React.useState<PoiData | null>(null);

    // GPS Directions State
    const [routeGeometry, setRouteGeometry] = React.useState<any>(null);
    const [carDuration, setCarDuration] = React.useState<string | null>(null);
    const [walkDuration, setWalkDuration] = React.useState<string | null>(null);

    // 5. Interactions
    const { handleMapClick, onMouseMove } = useMapInteractions({
        mapRef,
        onSelectId,
        onSelectPoi: setSelectedPoi,
        onHoverPoi: setHoveredPoi,
    });

    // 6. Viewport Management
    useMapViewport({
        mapRef,
        isMapLoaded,
        properties: mappableProperties,
        selectedId,
    });

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
        exploreEnabled,
        mapStyleUrl,
        standardConfig,
    } = useMapDetails();

    // 7. Kakao Discovery for Korea
    const { results: recommendedPlaces, fetchRecommendations: fetchKakaoRecommendations } = useKakaoSearch();
    const lastDiscoveryFetch = React.useRef<{ lat: number, lng: number } | null>(null);

    /** Runs the Kakao discovery check for the current map centre. */
    const runKakaoDiscovery = useCallback(() => {
        if (!isMapLoaded || !exploreEnabled) return;

        const center = mapRef.current?.getCenter();
        if (!center) return;

        const distance = lastDiscoveryFetch.current
            ? calculateDistance(lastDiscoveryFetch.current, { lat: center.lat, lng: center.lng })
            : 1000;

        if (Number(distance) > 2 && isLocationInKorea(center.lat, center.lng)) {
            fetchKakaoRecommendations(center.lat, center.lng);
            lastDiscoveryFetch.current = { lat: center.lat, lng: center.lng };
        }
    }, [isMapLoaded, exploreEnabled, fetchKakaoRecommendations, mapRef]);

    // Trigger on load / toggle
    React.useEffect(() => {
        runKakaoDiscovery();
    }, [runKakaoDiscovery]);

    // Construct GeoJSON for recommended places
    const recommendedGeoJson = useMemo(() => {
        if (!exploreEnabled || !recommendedPlaces.length) return null;
        return {
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
        };
    }, [exploreEnabled, recommendedPlaces]);

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
                    longitude: defaultCenter?.lng ?? 139.6917, // Tokyo as world-wide fallback
                    latitude: defaultCenter?.lat ?? 35.6895,
                    zoom: 12,
                    pitch: 20,
                    bearing: -10,
                }}
                onLoad={handleMapLoad}
                onStyleReady={handleMapLoad}
                onClick={handleMapClick}
                onMouseMove={onMouseMove}
                // Update bounds/zoom on every move
                onMove={updateMapState}
                onMoveEnd={() => {
                    updateMapState();
                    runKakaoDiscovery();
                }}
                hideLayersButton={true}
            >

                {isMapLoaded && (
                    <>
                        {/* Clusters and Markers */}
                        {clusters.map(cluster => {
                            const [longitude, latitude] = cluster.geometry.coordinates;
                            const {
                                cluster: isCluster,
                                point_count: pointCount,
                                propertyId,
                                property
                            } = cluster.properties;

                            if (isCluster) {
                                // Find min price in this cluster
                                const leaves = supercluster?.getLeaves(cluster.id as number);
                                const minPrice = leaves?.reduce((min, leaf) => 
                                    Math.min(min, leaf.properties.price), Infinity) || 0;

                                return (
                                    <ClusterMarker
                                        key={`cluster-${cluster.id}`}
                                        latitude={latitude}
                                        longitude={longitude}
                                        count={pointCount}
                                        minPrice={minPrice}
                                        currency={targetCurrency}
                                        onClick={() => {
                                            const leaves = supercluster?.getLeaves(cluster.id as number, Infinity);
                                            if (leaves && leaves.length > 0) {
                                                const lons = leaves.map(l => l.geometry.coordinates[0]);
                                                const lats = leaves.map(l => l.geometry.coordinates[1]);
                                                const bounds: [[number, number], [number, number]] = [
                                                    [Math.min(...lons), Math.min(...lats)],
                                                    [Math.max(...lons), Math.max(...lats)]
                                                ];
                                                
                                                // If all points are at the same location, zoom in specifically
                                                if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) {
                                                    mapRef.current?.flyTo({
                                                        center: [longitude, latitude],
                                                        zoom: Math.min((zoom || 12) + 2, 18),
                                                        duration: 1000
                                                    });
                                                } else {
                                                    mapRef.current?.fitBounds(bounds, {
                                                        padding: 80,
                                                        duration: 1000
                                                    });
                                                }
                                            } else {
                                                const expansionZoom = Math.min(
                                                    supercluster?.getClusterExpansionZoom(cluster.id as number) || 18,
                                                    18
                                                );
                                                mapRef.current?.flyTo({
                                                    center: [longitude, latitude],
                                                    zoom: expansionZoom,
                                                    duration: 1000
                                                });
                                            }
                                        }}
                                    />
                                );
                            }

                            // Single point
                            const p = property as any;
                            return (
                                <MapMarker
                                    key={`marker-${p.id}`}
                                    property={p}
                                    displayPrice={markerPrices[p.id] ?? 0}
                                    displayCurrency={targetCurrency}
                                    isSelected={p.id === selectedId}
                                    isHovered={p.id === hoveredId}
                                    onClick={onSelectId}
                                    onHover={onHoverId}
                                />
                            );
                        })}

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

                        {exploreEnabled && recommendedPlaces.length > 0 && (
                            <Source id="explore-source" type="geojson" data={recommendedGeoJson}>
                                {/* Outer glow layer */}
                                <Layer
                                    id="explore-poi-glow"
                                    type="circle"
                                    minzoom={13}
                                    paint={{
                                        'circle-radius': 15,
                                        'circle-color': [
                                            'match',
                                            ['get', 'category'],
                                            'restaurant', '#f43f5e',
                                            'cafe', '#f97316',
                                            'park', '#22c55e',
                                            'transit', '#3b82f6',
                                            '#8b5cf6'
                                        ],
                                        'circle-opacity': [
                                            'interpolate',
                                            ['linear'],
                                            ['zoom'],
                                            13, 0,
                                            14, 0.2
                                        ],
                                        'circle-pitch-alignment': 'map',
                                    }}
                                />
                                <Layer
                                    id="explore-poi-dots"
                                    type="circle"
                                    paint={{
                                        'circle-radius': [
                                            'interpolate',
                                            ['linear'],
                                            ['zoom'],
                                            10, 4,
                                            15, 8
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
                                        'circle-stroke-width': 1.5,
                                        'circle-stroke-color': '#fff',
                                        'circle-pitch-alignment': 'map',
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
                    isMobile={isMobile}
                />
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
                            }}
                            onViewDetails={onViewDetails}
                            isCentered={true}
                        />
                    </div>
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
