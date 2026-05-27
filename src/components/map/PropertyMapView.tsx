'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox';
import { NavigationControl, Popup, Source, Layer } from 'react-map-gl/mapbox';
import { Navigation, Layers } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { useMapDetails } from '@/components/mapbox/hooks/useMapDetails';
import { MapDetailsPanel } from '@/components/mapbox/components/MapDetailsPanel';
import { MapMarker } from './MapMarker';
import { MapPopup } from './MapPopup';
import { MapPOIPopup } from './MapPOIPopup';
import { NearbyPlaceMarker } from './NearbyPlaceMarker';
import { NearbyPlacePopup } from './NearbyPlacePopup';
import { MapGemsPanel } from './MapGemsPanel';
import { useNearbyGems } from '@/components/property/hooks/useNearbyGems';
import type { NearbyPlace } from './useMapNearbyPlaces';
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

function createCircleGeoJSON(center: [number, number], radiusMeters: number): GeoJSON.Feature {
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

const POI_CLASSES = new Set([
    'food_and_drink', 'retail', 'education', 'entertainment', 'accommodation',
    'medical', 'sport', 'religion', 'transport', 'arts_and_entertainment',
    'finance', 'beauty_and_spa', 'gas_station', 'grocery', 'hotel', 'cafe',
    'bar', 'restaurant', 'fast_food', 'bakery', 'gym', 'pharmacy', 'hospital',
    'park', 'place_of_worship', 'school', 'university', 'bank', 'atm',
    'supermarket', 'convenience', 'shopping_mall', 'cinema', 'museum',
    'nightclub', 'library', 'post_office', 'police', 'fire_station',
]);

function detectPOI(
    map: mapboxgl.Map,
    point: [number, number],
    lngLat: { lat: number; lng: number },
    layers?: string[]
): POIState | null {
    const features = map.queryRenderedFeatures(point, {
        layers: layers && layers.length > 0 ? layers : undefined,
    });
    const poi = features.find((f) => {
        const p = f.properties;
        if (!p?.name) return false;
        if (f.sourceLayer === 'poi_label') return true;
        if (f.layer?.type !== 'symbol') return false;
        return POI_CLASSES.has(String(p.class ?? ''));
    });
    if (!poi) return null;
    let lat = lngLat.lat;
    let lng = lngLat.lng;
    if (poi.geometry?.type === 'Point') [lng, lat] = poi.geometry.coordinates as [number, number];
    return {
        name: String(poi.properties?.name_en ?? poi.properties?.name ?? ''),
        category: String(poi.properties?.class ?? poi.properties?.type ?? 'place'),
        lat,
        lng,
    };
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
    const poiLayersRef = useRef<string[]>([]);
    // Prevents the map's onClick from deselecting a hotel immediately after a marker click.
    // In Mapbox v3, the map fires its click event even when a Marker's stopPropagation is called.
    const markerJustClickedRef = useRef(false);
    const targetCurrency = useUserCurrency();

    // Nearby gems state
    const [nearbyCategory, setNearbyCategory] = useState('all');
    const [nearbyRadius, setNearbyRadius] = useState(1000);
    const [activeGemName, setActiveGemName] = useState<string | null>(null);
    const [selectedNearbyPlace, setSelectedNearbyPlace] = useState<NearbyPlace | null>(null);

    const selectedProperty = useMemo(
        () => (selectedId ? properties.find((p) => p.id === selectedId) ?? null : null),
        [selectedId, properties]
    );

    // Use the same rich data hook as the property detail page
    const { nearbyGems, isFetchingGems } = useNearbyGems({
        isLoaded: isMapLoaded && !!selectedProperty,
        coordinates: selectedProperty
            ? { lat: selectedProperty.coordinates.lat, lng: selectedProperty.coordinates.lng }
            : undefined,
        selectedCategory: nearbyCategory,
    });

    // Filter gems client-side by the user's chosen radius
    const filteredGems = useMemo(() => {
        if (!selectedProperty || nearbyGems.length === 0) return [];
        return nearbyGems.filter((gem) => {
            const lng = gem.geometry?.coordinates[0];
            const lat = gem.geometry?.coordinates[1];
            if (lat == null || lng == null) return false;
            return haversineKm(
                selectedProperty.coordinates.lat,
                selectedProperty.coordinates.lng,
                lat, lng,
            ) * 1000 <= nearbyRadius;
        });
    }, [nearbyGems, selectedProperty, nearbyRadius]);

    // Adapt gems to the NearbyPlace shape for map markers
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

    // Clear gem state when hotel is deselected
    useEffect(() => {
        if (!selectedId) {
            setActiveGemName(null);
            setSelectedNearbyPlace(null);
        }
    }, [selectedId]);

    const markerPrices = useMemo(() => {
        const prices: Record<string, number> = {};
        for (const p of properties) {
            prices[p.id] = convertCurrency(p.price, p.currency || 'USD', targetCurrency);
        }
        return prices;
    }, [properties, targetCurrency]);

    const {
        mapType, setMapType,
        showDetailsPanel, setShowDetailsPanel,
        showLabels, setShowLabels,
        mapDetails, handleDetailToggle,
        terrainEnabled, mapStyleUrl, standardConfig,
    } = useMapDetails();

    const bounds = useMemo(() => computeBounds(properties), [properties]);

    const poiDistanceKm = useMemo(() => {
        if (!poiPopup || !selectedProperty) return null;
        return haversineKm(
            selectedProperty.coordinates.lat, selectedProperty.coordinates.lng,
            poiPopup.lat, poiPopup.lng,
        );
    }, [poiPopup, selectedProperty]);

    const hoverDistanceKm = useMemo(() => {
        if (!hoveredPOI || !selectedProperty) return null;
        return haversineKm(
            selectedProperty.coordinates.lat, selectedProperty.coordinates.lng,
            hoveredPOI.lat, hoveredPOI.lng,
        );
    }, [hoveredPOI, selectedProperty]);

    const nearbyPlaceDistanceKm = useMemo(() => {
        if (!selectedNearbyPlace || !selectedProperty) return null;
        return haversineKm(
            selectedProperty.coordinates.lat, selectedProperty.coordinates.lng,
            selectedNearbyPlace.lat, selectedNearbyPlace.lng,
        );
    }, [selectedNearbyPlace, selectedProperty]);

    const radiusCircleGeoJSON = useMemo(() => {
        if (!selectedProperty) return null;
        return createCircleGeoJSON(
            [selectedProperty.coordinates.lng, selectedProperty.coordinates.lat],
            nearbyRadius,
        );
    }, [selectedProperty, nearbyRadius]);

    const handleMarkerClick = useCallback((id: string) => {
        const property = properties.find((p) => p.id === id);
        if (!property) return;
        markerJustClickedRef.current = true;
        setTimeout(() => { markerJustClickedRef.current = false; }, 50);
        setPoiPopup(null);
        setSelectedNearbyPlace(null);
        setActiveGemName(null);
        onSelect(id);
        mapRef.current?.flyTo({
            center: [property.coordinates.lng, property.coordinates.lat],
            zoom: 15, pitch: 45, duration: 800,
        });
    }, [properties, onSelect]);

    const handlePopupClose = useCallback(() => {
        onSelect(null);
        setPoiPopup(null);
        setSelectedNearbyPlace(null);
        setActiveGemName(null);
    }, [onSelect]);

    const handlePOIClose = useCallback(() => setPoiPopup(null), []);
    const handleNearbyPlaceClose = useCallback(() => {
        setSelectedNearbyPlace(null);
        setActiveGemName(null);
    }, []);

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
        setPoiPopup(null);
        setSelectedNearbyPlace({
            name,
            category: gem.properties?.category || 'place',
            lat,
            lng,
            rating: gem.properties?.rating,
            userRatingsTotal: gem.properties?.userRatingsTotal,
            placeId: gem.properties?.place_id,
            vicinity: gem.properties?.vicinity,
        });
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, pitch: 30, duration: 600 });
    }, [activeGemName]);

    const handleMapClick = useCallback((e: MapMouseEvent) => {
        if (markerJustClickedRef.current) return;
        const map = mapRef.current?.getMap();
        if (!map) { onSelect(null); setPoiPopup(null); setSelectedNearbyPlace(null); setActiveGemName(null); return; }
        const poi = detectPOI(map, [e.point.x, e.point.y], e.lngLat, poiLayersRef.current);
        if (poi) {
            setPoiPopup(poi);
            setHoveredPOI(null);
            setSelectedNearbyPlace(null);
            setActiveGemName(null);
        } else {
            onSelect(null);
            setPoiPopup(null);
            setSelectedNearbyPlace(null);
            setActiveGemName(null);
        }
    }, [onSelect]);

    const handleMouseMove = useCallback((e: MapMouseEvent) => {
        if (poiPopup) return;
        const map = mapRef.current?.getMap();
        if (!map) return;
        if (map.isMoving() || map.isZooming() || map.isRotating()) {
            if (hoveredPOINameRef.current !== null) {
                hoveredPOINameRef.current = null;
                setHoveredPOI(null);
                map.getCanvas().style.cursor = '';
            }
            return;
        }
        const now = Date.now();
        if (now - lastMouseMoveRef.current < 150) return;
        lastMouseMoveRef.current = now;
        const poi = detectPOI(map, [e.point.x, e.point.y], e.lngLat, poiLayersRef.current);
        const name = poi?.name ?? null;
        if (name === hoveredPOINameRef.current) return;
        hoveredPOINameRef.current = name;
        setHoveredPOI(poi);
        map.getCanvas().style.cursor = poi ? 'pointer' : '';
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
            map.flyTo({ center: [bounds.centerLng, bounds.centerLat], zoom: 14, duration: 0 });
            return;
        }
        map.fitBounds(
            [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
            { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: 15, duration: 0 }
        );
    }, [properties, bounds]);

    const handleMapLoad = useCallback(() => {
        setIsMapLoaded(true);
        const map = mapRef.current?.getMap();
        if (map) {
            poiLayersRef.current = map.getStyle().layers
                .filter(l => l.type === 'symbol' || l.id.includes('poi'))
                .map(l => l.id);
        }
        fitBounds();
    }, [fitBounds]);

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
                    zoom: 12, pitch: 0, bearing: 0,
                }}
                maxPitch={60}
                onClick={handleMapClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onLoad={handleMapLoad}
                className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-800"
            >
                <NavigationControl position="top-right" showCompass visualizePitch />

                {/* Radius circle */}
                {radiusCircleGeoJSON && (
                    <Source id="nearby-radius" type="geojson" data={radiusCircleGeoJSON}>
                        <Layer id="nearby-radius-fill" type="fill"
                            paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.06 }} />
                        <Layer id="nearby-radius-outline" type="line"
                            paint={{ 'line-color': '#3b82f6', 'line-width': 1.5, 'line-opacity': 0.35, 'line-dasharray': [3, 2] }} />
                    </Source>
                )}

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

                {selectedProperty && (
                    <MapPopup
                        property={selectedProperty}
                        onClose={handlePopupClose}
                        onViewDetails={onViewDetails}
                        mapRef={mapRef}
                    />
                )}

                {selectedNearbyPlace && (
                    <NearbyPlacePopup
                        place={selectedNearbyPlace}
                        distanceKm={nearbyPlaceDistanceKm}
                        onClose={handleNearbyPlaceClose}
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
                            <p className="font-semibold text-xs leading-tight truncate">{hoveredPOI.name}</p>
                            <p className="text-[10px] text-slate-300 mt-0.5">{formatCategory(hoveredPOI.category)}</p>
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

            {/* Property count badge — hidden when gems panel is showing */}
            {!selectedProperty && (
                <div className="absolute bottom-10 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-slate-900 dark:white px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-xs font-medium z-10">
                    {properties.length} {properties.length === 1 ? 'property' : 'properties'} on map
                </div>
            )}

            {/* Nearby gems panel — slides up from bottom when a hotel is selected */}
            {selectedProperty && (
                <div className="absolute bottom-2 left-2 right-2 z-10">
                    <MapGemsPanel
                        gems={filteredGems}
                        isLoading={isFetchingGems}
                        selectedCategory={nearbyCategory}
                        onCategoryChange={setNearbyCategory}
                        radiusMeters={nearbyRadius}
                        onRadiusChange={setNearbyRadius}
                        activeGemName={activeGemName}
                        onGemClick={handleGemClick}
                    />
                </div>
            )}

            {/* Layers button */}
            {!showDetailsPanel && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowDetailsPanel(true); }}
                    className="absolute top-4 left-4 z-20 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer flex items-center gap-2 group"
                >
                    <Layers className="w-5 h-5 text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                    <svg className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            )}

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
