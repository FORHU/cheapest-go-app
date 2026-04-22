'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox';
import { NavigationControl, Popup } from 'react-map-gl/mapbox';
import { Navigation, Layers } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { useMapDetails } from '@/components/mapbox/hooks/useMapDetails';
import { MapDetailsPanel } from '@/components/mapbox/components/MapDetailsPanel';
import { MapMarker } from './MapMarker';
import { MapPopup } from './MapPopup';
import { MapPOIPopup } from './MapPOIPopup';
import { computeBounds } from './types';
import type { MappableProperty } from './types';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

interface PropertyMapViewProps {
    properties: MappableProperty[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string | null) => void;
    onHover: (id: string | null) => void;
    onViewDetails: (id: string) => void;
}

interface POIState {
    name: string;
    category: string;
    lat: number;
    lng: number;
}

// Haversine formula — returns distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCategory(raw: string): string {
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDistance(km: number): string {
    return km < 1
        ? `${Math.round(km * 1000)} m from property`
        : `${km.toFixed(2)} km from property`;
}

// Mapbox Standard style POI class values that represent actual places/businesses
const POI_CLASSES = new Set([
    'food_and_drink', 'retail', 'education', 'entertainment', 'accommodation',
    'medical', 'sport', 'religion', 'transport', 'arts_and_entertainment',
    'finance', 'beauty_and_spa', 'gas_station', 'grocery', 'hotel', 'cafe',
    'bar', 'restaurant', 'fast_food', 'bakery', 'gym', 'pharmacy', 'hospital',
    'park', 'place_of_worship', 'school', 'university', 'bank', 'atm',
    'supermarket', 'convenience', 'shopping_mall', 'cinema', 'museum',
    'nightclub', 'library', 'post_office', 'police', 'fire_station',
]);

// Place-level class values to ignore (city, suburb, etc. — not clickable POIs)
const PLACE_CLASSES = new Set([
    'country', 'region', 'state', 'province', 'city', 'town',
    'village', 'suburb', 'neighborhood', 'locality', 'place',
]);

function detectPOI(
    map: mapboxgl.Map,
    point: [number, number],
    lngLat: { lat: number; lng: number },
): POIState | null {
    const features = map.queryRenderedFeatures(point);

    const poi = features.find((f) => {
        const p = f.properties;
        if (!p?.name) return false;
        // Primary: Mapbox Streets v8 POI source layer — most reliable signal
        if (f.sourceLayer === 'poi_label') return true;
        // Fallback: any symbol layer with a known POI class
        if (f.layer?.type !== 'symbol') return false;
        const cls = p.class ? String(p.class) : '';
        return POI_CLASSES.has(cls);
    });

    if (!poi) return null;

    // Anchor popup to the feature's actual point geometry, not the cursor
    let lat = lngLat.lat;
    let lng = lngLat.lng;
    if (poi.geometry?.type === 'Point') {
        [lng, lat] = poi.geometry.coordinates as [number, number];
    }

    const name = String(poi.properties?.name_en ?? poi.properties?.name ?? '');
    const category = String(poi.properties?.class ?? poi.properties?.type ?? 'place');

    return { name, category, lat, lng };
}

const PropertyMapView = React.memo(function PropertyMapView({
    properties,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
    onViewDetails,
}: PropertyMapViewProps) {
    const mapRef = useRef<MapRef>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [poiPopup, setPoiPopup] = useState<POIState | null>(null);
    const [hoveredPOI, setHoveredPOI] = useState<POIState | null>(null);
    const hoveredPOINameRef = useRef<string | null>(null);
    const lastMouseMoveRef = useRef<number>(0);
    const lastFittedKeyRef = useRef<string | null>(null);
    const targetCurrency = useUserCurrency();

    // Pre-compute display prices once per properties/currency change instead of
    // calling convertCurrency() for every marker on every render.
    const markerPrices = useMemo(() => {
        const prices: Record<string, number> = {};
        for (const p of properties) {
            prices[p.id] = convertCurrency(p.price, p.currency || 'USD', targetCurrency);
        }
        return prices;
    }, [properties, targetCurrency]);

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
    } = useMapDetails();

    const bounds = useMemo(() => computeBounds(properties), [properties]);

    const selectedProperty = useMemo(
        () => (selectedId ? properties.find((p) => p.id === selectedId) ?? null : null),
        [selectedId, properties]
    );

    const poiDistanceKm = useMemo(() => {
        if (!poiPopup || !selectedProperty) return null;
        return haversineKm(
            selectedProperty.coordinates.lat,
            selectedProperty.coordinates.lng,
            poiPopup.lat,
            poiPopup.lng,
        );
    }, [poiPopup, selectedProperty]);

    const hoverDistanceKm = useMemo(() => {
        if (!hoveredPOI || !selectedProperty) return null;
        return haversineKm(
            selectedProperty.coordinates.lat,
            selectedProperty.coordinates.lng,
            hoveredPOI.lat,
            hoveredPOI.lng,
        );
    }, [hoveredPOI, selectedProperty]);

    const handleMarkerClick = useCallback(
        (id: string) => {
            const property = properties.find((p) => p.id === id);
            if (!property) return;

            setPoiPopup(null);
            onSelect(id);
            mapRef.current?.flyTo({
                center: [property.coordinates.lng, property.coordinates.lat],
                zoom: 15,
                pitch: 45,
                duration: 1200,
            });
        },
        [properties, onSelect]
    );

    const handlePopupClose = useCallback(() => {
        onSelect(null);
        setPoiPopup(null);
    }, [onSelect]);

    const handlePOIClose = useCallback(() => {
        setPoiPopup(null);
    }, []);

    const handleMapClick = useCallback(
        (e: MapMouseEvent) => {
            const map = mapRef.current?.getMap();
            if (!map) { onSelect(null); setPoiPopup(null); return; }

            const poi = detectPOI(map, [e.point.x, e.point.y], e.lngLat);

            if (poi) {
                setPoiPopup(poi);
                setHoveredPOI(null); // click popup takes over
            } else {
                onSelect(null);
                setPoiPopup(null);
            }
        },
        [onSelect]
    );

    const handleMouseMove = useCallback((e: MapMouseEvent) => {
        if (poiPopup) return;

        // Throttle to ~50ms (~20fps) — queryRenderedFeatures is a GPU read
        const now = Date.now();
        if (now - lastMouseMoveRef.current < 50) return;
        lastMouseMoveRef.current = now;

        const map = mapRef.current?.getMap();
        if (!map) return;

        const poi = detectPOI(map, [e.point.x, e.point.y], e.lngLat);
        const name = poi?.name ?? null;

        if (name === hoveredPOINameRef.current) return;
        hoveredPOINameRef.current = name;

        setHoveredPOI(poi);

        const canvas = map.getCanvas();
        canvas.style.cursor = poi ? 'pointer' : '';
    }, [poiPopup]);

    const handleMouseLeave = useCallback(() => {
        if (hoveredPOINameRef.current !== null) {
            hoveredPOINameRef.current = null;
            setHoveredPOI(null);
            const canvas = mapRef.current?.getMap()?.getCanvas();
            if (canvas) canvas.style.cursor = '';
        }
    }, []);

    const fitBounds = useCallback(() => {
        const map = mapRef.current;
        if (!map || properties.length === 0) return;

        const key = properties.map(p => p.id).join(',');
        if (lastFittedKeyRef.current === key) return;
        lastFittedKeyRef.current = key;

        if (properties.length === 1) {
            map.flyTo({
                center: [bounds.centerLng, bounds.centerLat],
                zoom: 14,
                duration: 0,
            });
            return;
        }

        map.fitBounds(
            [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
            { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: 15, duration: 0 }
        );
    }, [properties, bounds]);

    const handleMapLoad = useCallback(() => {
        setIsMapLoaded(true);
        fitBounds();
    }, [fitBounds]);

    // Re-fit when properties arrive after the map is already loaded
    useEffect(() => {
        if (!isMapLoaded) return;
        fitBounds();
    }, [isMapLoaded, fitBounds]);

    return (
        <div className="relative w-full h-full">
            <Map
                ref={mapRef}
                mapStyle={mapStyleUrl}
                standardConfig={mapType === 'default-3d' ? { ...standardConfig, show3dFacades: false } : undefined}
                enable3DTerrain={terrainEnabled}
                terrainExaggeration={1.5}
                initialViewState={{
                    longitude: bounds.centerLng || 120.596,
                    latitude: bounds.centerLat || 16.402,
                    zoom: 12,
                    pitch: 0,
                    bearing: 0,
                }}
                maxPitch={60}
                onClick={handleMapClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onLoad={handleMapLoad}
                className="rounded-none"
            >
                <NavigationControl position="top-right" showCompass visualizePitch />

                {properties.map((property) => (
                    <MapMarker
                        key={property.id}
                        property={property}
                        displayPrice={markerPrices[property.id] ?? 0}
                        displayCurrency={targetCurrency}
                        isSelected={selectedId === property.id}
                        isHovered={hoveredId === property.id}
                        onClick={handleMarkerClick}
                        onHover={onHover}
                    />
                ))}

                {selectedProperty && (
                    <MapPopup
                        property={selectedProperty}
                        onClose={handlePopupClose}
                        onViewDetails={onViewDetails}
                        mapRef={mapRef}
                    />
                )}

                {poiPopup && (
                    <MapPOIPopup
                        name={poiPopup.name}
                        category={poiPopup.category}
                        lat={poiPopup.lat}
                        lng={poiPopup.lng}
                        distanceKm={poiDistanceKm}
                        onClose={handlePOIClose}
                    />
                )}

                {/* Hover tooltip — only when no click popup is active */}
                {hoveredPOI && !poiPopup && (
                    <Popup
                        latitude={hoveredPOI.lat}
                        longitude={hoveredPOI.lng}
                        anchor="bottom"
                        offset={16}
                        closeButton={false}
                        closeOnClick={false}
                        className="map-poi-hover"
                    >
                        <div className="bg-slate-900/90 backdrop-blur-sm text-white rounded-lg px-3 py-2 shadow-xl min-w-[150px] max-w-[220px]">
                            <p className="font-semibold text-xs leading-tight truncate">
                                {hoveredPOI.name}
                            </p>
                            <p className="text-[10px] text-slate-300 mt-0.5">
                                {formatCategory(hoveredPOI.category)}
                            </p>
                            {hoverDistanceKm !== null && (
                                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-blue-300 font-medium">
                                    <Navigation className="w-2.5 h-2.5 shrink-0" />
                                    <span>{formatDistance(hoverDistanceKm)}</span>
                                </div>
                            )}
                            <p className="text-[9px] text-slate-400 mt-1">Click for details</p>
                        </div>
                    </Popup>
                )}
            </Map>

            {/* Property count badge */}
            <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-slate-900 dark:white px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-xs font-medium">
                {properties.length} {properties.length === 1 ? 'property' : 'properties'} on map
            </div>

            {/* ── Layers button ── */}
            {!showDetailsPanel && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowDetailsPanel(true);
                    }}
                    className="absolute top-4 left-4 z-20 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer flex items-center gap-2 group"
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

export { PropertyMapView };
export type { PropertyMapViewProps };
