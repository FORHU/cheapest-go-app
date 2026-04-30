'use client';

import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, Car, Bike, X, GraduationCap, Trees, Utensils, Building2, Landmark, Coffee, Library, Pill, ShoppingBasket, Banknote, Church, Bus, Footprints, Search, Maximize, Minimize, ChevronLeft, ChevronRight, Layers, Star, Home, Bed } from 'lucide-react';
import { Map as UIMap } from '@/components/ui/map';
import { Marker, NavigationControl, Source, Layer, GeolocateControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { useMapboxDirections } from '../mapbox/hooks/useMapboxDirections';
import { useGoogleSearch } from '../mapbox/hooks/useGoogleSearch';
import { env } from '@/utils/env';
import { PoiDetailsModal } from './PoiDetailsModal';
import { useMapDetails } from '@/components/mapbox/hooks/useMapDetails';
import { MapDetailsPanel } from '@/components/mapbox/components/MapDetailsPanel';
import Image from 'next/image';
import { useWeather } from '@/hooks/useWeather';
import { WeatherWidget } from './WeatherWidget';
import { isLocationInKorea, normalizeKakaoPoi, calculateHaversineDistance } from '@/utils/geo';
import { formatDuration } from '@/utils/format';
import { getMapboxPoiImage } from '@/utils/images';
import { 
    GOOGLE_MAPS_SEARCH_URL, 
    POI_FILTERS, 
    BAGUIO_DEFAULT_GEMS, 
    NEARBY_CATEGORIES, 
    MAP_FILTER_CONFIG,
    POI_ICON_MAP 
} from '@/config/map-discovery';
import { mapPoiDetails, getMapPoiCategory } from '@/utils/poi-mapper';
import { useNearbyGems } from './hooks/useNearbyGems';
import { MapOverlay } from './components/MapOverlay';
import { PoiDiscovery } from './components/PoiDiscovery';
import { MapSourceLayers } from './components/MapSourceLayers';

interface PropertyMapSidebarProps {
    hotelDetails?: {
        name?: string;
        description?: string;
        address?: string;
        city?: string;
        country?: string;
        image?: string;
    };
    coordinates?: { lat: number; lng: number };
    propertyName?: string;
}

const PropertyMapSidebarContent = React.memo<PropertyMapSidebarProps>(
    ({ hotelDetails, coordinates, propertyName }) => {
        const mapRef = useRef<MapRef>(null);
        const gemsScrollRef = useRef<HTMLDivElement>(null);
        const [isLoaded, setIsLoaded] = useState(false);
        const [mounted, setMounted] = useState(false);
        const [isFullscreen, setIsFullscreen] = useState(false);
        const [activeMapFilters, setActiveMapFilters] = useState<string[]>(['dining', 'lodging', 'nature', 'explore']);





        const isPoiAllowed = useCallback((feature: any) => {
            const catId = getMapPoiCategory(feature);
            return catId && activeMapFilters.includes(catId);
        }, [activeMapFilters, getMapPoiCategory]);
        // Stable session token for Mapbox Search Box API
        const [mapboxSessionToken] = useState(() => Math.random().toString(36).substring(2, 15));

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

        // Trigger map resize after fullscreen transition so it fills the new container
        React.useEffect(() => {
            const id = setTimeout(() => mapRef.current?.resize(), 310);
            return () => clearTimeout(id);
        }, [isFullscreen]);

        // Manage body scroll locking for fullscreen mode
        React.useEffect(() => {
            if (isFullscreen) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
            return () => { document.body.style.overflow = ''; };
        }, [isFullscreen]);

        const [activePoiId, setActivePoiId] = useState<string | null>(null);
        const [selectedNativePoi, setSelectedNativePoi] = useState<any>(null);
        const [modalPoiId, setModalPoiId] = useState<string | null>(null);

        // Mapbox Performance: Synchronize activePoiId with feature-state
        const lastActivePoiId = useRef<string | null>(null);
        React.useEffect(() => {
            const map = mapRef.current?.getMap();
            if (!map || !isLoaded) return;

            // Clear previous state
            if (lastActivePoiId.current && lastActivePoiId.current !== 'hotel') {
                map.setFeatureState(
                    { source: 'gems-source', id: lastActivePoiId.current },
                    { active: false }
                );
            }

            // Set new state
            if (activePoiId && activePoiId !== 'hotel') {
                map.setFeatureState(
                    { source: 'gems-source', id: activePoiId },
                    { active: true }
                );
            }
            lastActivePoiId.current = activePoiId;
        }, [activePoiId, isLoaded]);

        // Directions State
        const [showDirections, setShowDirections] = useState(false);

        // Nearby Categories State
        const [activeCategory, setActiveCategory] = useState<string | null>(null);
        const [categoryResults, setCategoryResults] = useState<any[]>([]);
        const [isSearchingCategory, setIsSearchingCategory] = useState(false);

        // Nearby Image Gems State

        const [selectedCategory, setSelectedCategory] = useState('all');
        const [transportProfile, setTransportProfile] = useState<'driving-traffic' | 'driving' | 'walking' | 'cycling'>('driving-traffic');
        const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
        const [isLocating, setIsLocating] = useState(false);

        // Itinerary & Optimization State
        const [itineraryGems, setItineraryGems] = useState<any[]>([]);
        const [optimizedRouteGeometry, setOptimizedRouteGeometry] = useState<any>(null);
        const [isOptimizing, setIsOptimizing] = useState(false);

        const name = propertyName || hotelDetails?.name || 'Premium Stay';
        const addressLine = hotelDetails?.address || 'Address not available';
        const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

        // Custom Hooks - Logic Extraction
        const { weather, isLoading: isWeatherLoading, refetch: refetchWeather } = useWeather({
            lat: coordinates?.lat,
            lng: coordinates?.lng,
            enabled: !!hasCoordinates,
        });

        const handleLocateMe = async () => {
            if (!navigator.geolocation) return;
            setIsLocating(true);
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                    setIsLocating(false);
                },
                (err) => {
                    console.error('Locate Me failed:', err);
                    setIsLocating(false);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        };

        const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();

        React.useEffect(() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
                (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn('Sidebar geolocation failed:', err),
                { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
            );
        }, []);

        const {
            originQuery,
            originResults,
            showOriginResults,
            setShowOriginResults,
            isSearching,
            origin,
            handleOriginSearch,
            handleSelectOrigin,
            reverseGeocode,
            clearSearch
        } = useGoogleSearch({ proximity: userLocation || (hasCoordinates ? coordinates : undefined) });

        const clearDirections = useCallback(() => {
            setShowDirections(false);
            clearSearch();
        }, [clearSearch]);

        const {
            routeGeometry: poiRouteGeometry,
            travelTime: poiTravelTime,
            walkingTime: poiWalkingTime,
            cyclingTime: poiCyclingTime,
        } = useMapboxDirections({
            origin: hasCoordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
            destination: selectedNativePoi ? { 
                lat: selectedNativePoi.geometry?.coordinates[1] ?? selectedNativePoi.coordinates?.lat, 
                lng: selectedNativePoi.geometry?.coordinates[0] ?? selectedNativePoi.coordinates?.lng 
            } : null,
            enabled: !!selectedNativePoi && hasCoordinates && !showDirections,
            profile: transportProfile
        });

        const {
            routeGeometry: originRouteGeometry,
            travelTime: originTravelTime,
            walkingTime: originWalkingTime,
            cyclingTime: originCyclingTime,
            isFetchingRoute: isFetchingOriginRoute
        } = useMapboxDirections({
            origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
            destination: hasCoordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
            enabled: showDirections && !!origin && hasCoordinates,
            profile: transportProfile
        });

        const { nearbyGems, isFetchingGems, setNearbyGems } = useNearbyGems({
            isLoaded,
            coordinates,
            selectedCategory,
            onClearDirections: clearDirections
        });

        const toggleItineraryGem = useCallback((poi: any) => {
            setItineraryGems(prev => {
                const name = poi.properties?.name || poi.name;
                const exists = prev.find(g => (g.properties?.name || g.name) === name);
                if (exists) {
                    const newItinerary = prev.filter(g => (g.properties?.name || g.name) !== name);
                    if (newItinerary.length === 0) setOptimizedRouteGeometry(null);
                    return newItinerary;
                }
                if (prev.length >= 11) {
                    alert('Maximum 11 places allowed for optimization.');
                    return prev;
                }
                return [...prev, poi];
            });
        }, []);

        const handleOptimizeRoute = useCallback(async () => {
            if (!hasCoordinates || itineraryGems.length === 0) return;
            setIsOptimizing(true);
            
            try {
                // Coordinates string: hotel first, then gems.
                const coordsArray = [
                    `${coordinates.lng},${coordinates.lat}`,
                    ...itineraryGems.map(gem => {
                        const lng = gem.geometry?.coordinates[0] || gem.coordinates?.lng;
                        const lat = gem.geometry?.coordinates[1] || gem.coordinates?.lat;
                        return `${lng},${lat}`;
                    })
                ];
                const coordsString = coordsArray.join(';');
                
                // Mapbox Optimization API (default driving profile)
                const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordsString}?source=first&destination=last&roundtrip=true&geometries=geojson&access_token=${env.MAPBOX_TOKEN}`;
                
                const res = await fetch(url);
                const data = await res.json();
                
                if (data.code === 'Ok' && data.trips?.[0]) {
                    setOptimizedRouteGeometry(data.trips[0].geometry);
                    // Fit bounds to include all itinerary points
                    if (mapRef.current) {
                        const allLats = [coordinates.lat, ...itineraryGems.map(g => g.geometry?.coordinates[1] || g.coordinates?.lat)];
                        const allLngs = [coordinates.lng, ...itineraryGems.map(g => g.geometry?.coordinates[0] || g.coordinates?.lng)];
                        mapRef.current.fitBounds(
                            [[Math.min(...allLngs), Math.min(...allLats)], [Math.max(...allLngs), Math.max(...allLats)]],
                            { padding: 80, duration: 1000 }
                        );
                    }
                }
            } catch (err) {
                console.error('Optimization failed:', err);
            } finally {
                setIsOptimizing(false);
            }
        }, [hasCoordinates, coordinates, itineraryGems]);

        const modalPoi = useMemo(() => {
            if (!modalPoiId) return null;
            const gem = nearbyGems.find(g => (g.properties?.name || g.name) === modalPoiId);
            if (gem) return gem;
            if ((selectedNativePoi?.properties?.name || selectedNativePoi?.name) === modalPoiId) return selectedNativePoi;
            return null;
        }, [modalPoiId, nearbyGems, selectedNativePoi]);

        const handleStyleReady = useCallback(() => {
            setIsLoaded(true);
            
            const map = mapRef.current?.getMap();
            if (!map) return;

            // [AGGRESSIVE OVERRIDE] Apply Blue Theme to all native markers
            try {
                const style = map.getStyle();
                if (style && style.layers) {
                    style.layers.forEach((layer: any) => {
                        const id = layer.id.toLowerCase();
                        const isSymbol = layer.type === 'symbol';
                        
                        // Skip roads, water labels, and administrative boundaries
                        const isNav = id.includes('road') || id.includes('street') || id.includes('bridge') || id.includes('tunnel');
                        const isAdmin = id.includes('admin') || id.includes('boundary') || id.includes('country') || id.includes('state');
                        const isNatural = id.includes('water') || id.includes('land') || id.includes('terrain');
                        
                        if (isSymbol && !isNav && !isAdmin && !isNatural) {
                            if (map.getLayer(layer.id)) {
                                // Force icon tint to Blue
                                try { map.setPaintProperty(layer.id, 'icon-color', '#3b82f6'); } catch(e){}
                                // Force text to Deep Blue
                                try { map.setPaintProperty(layer.id, 'text-color', '#1e3a8a'); } catch(e){}
                                // Boost halo for contrast
                                try { map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(255, 255, 255, 0.95)'); } catch(e){}
                                try { map.setPaintProperty(layer.id, 'text-halo-width', 2); } catch(e){}
                                
                                // Some Mapbox Standard layers use icon-halo-color for the circular background
                                try { map.setPaintProperty(layer.id, 'icon-halo-color', 'rgba(59, 130, 246, 0.2)'); } catch(e){}
                                try { map.setPaintProperty(layer.id, 'icon-halo-width', 1); } catch(e){}
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('Aggressive POI theme application deferred:', e);
            }
        }, []);

        // Reset loading state on style change to prevent "Style not done loading" errors
        React.useEffect(() => {
            setIsLoaded(false);
        }, [mapStyleUrl]);

        // Initial hydration fix
        React.useEffect(() => {
            setMounted(true);
        }, []);




        // Determine which markers/route should be active

        // Determine which route is currently active
        const activeRouteGeometry = showDirections && origin ? originRouteGeometry : poiRouteGeometry;

        const gemsGeojson = useMemo(() => {
            const visibleGems = !showDirections ? nearbyGems.filter(gem => {
                const cat = (gem.properties?.category || gem.category || '').toLowerCase();
                const matched = MAP_FILTER_CONFIG.find(filter =>
                    activeMapFilters.includes(filter.id) &&
                    filter.keywords.some(kw => cat.includes(kw))
                );
                return !!matched;
            }) : [];

            return {
                type: 'FeatureCollection',
                features: visibleGems
            };
        }, [nearbyGems, showDirections, activeMapFilters]);

        const routeGeojson = React.useMemo(() => {
            if (optimizedRouteGeometry && itineraryGems.length > 0) {
                return { type: 'Feature', properties: { isOptimized: true }, geometry: optimizedRouteGeometry };
            }
            if (!activeRouteGeometry) return { type: 'FeatureCollection', features: [] };
            return { type: 'Feature', properties: {}, geometry: activeRouteGeometry };
        }, [activeRouteGeometry, optimizedRouteGeometry, itineraryGems]);

        const displayInfo = activePoiId === 'hotel' ? {
            name,
            address: addressLine,
            distance: 0,
            coordinates,
        } : selectedNativePoi ? {
            name: selectedNativePoi.properties?.name ?? selectedNativePoi.name,
            address: selectedNativePoi.properties?.displayCategory ?? selectedNativePoi.properties?.category ?? selectedNativePoi.category,
            distance: coordinates ? calculateHaversineDistance(
                coordinates.lat, 
                coordinates.lng, 
                selectedNativePoi.geometry?.coordinates[1] ?? selectedNativePoi.coordinates?.lat, 
                selectedNativePoi.geometry?.coordinates[0] ?? selectedNativePoi.coordinates?.lng
            ) : 0,
            coordinates: selectedNativePoi.geometry?.coordinates 
                ? { lat: selectedNativePoi.geometry.coordinates[1], lng: selectedNativePoi.geometry.coordinates[0] } 
                : selectedNativePoi.coordinates,
        } : null;

        const onMapClick = useCallback((event: any) => {
            if (!mapRef.current) return;

            // If we are looking for directions, clicking anywhere on the map sets the Origin pin!
            if (showDirections) {
                handleSelectOrigin({
                    id: `pin-${Date.now()}`,
                    name: 'Dropped Pin',
                    lat: event.lngLat.lat,
                    lng: event.lngLat.lng
                });
                return;
            }

            const map = mapRef.current.getMap();

            // Use a small bbox for more reliable click detection
            const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
                [event.point.x - 5, event.point.y - 5],
                [event.point.x + 5, event.point.y + 5]
            ];

            const hasGemsLayer = map.getLayer('gems-layer');
            const features = hasGemsLayer ? map.queryRenderedFeatures(bbox, { layers: ['gems-layer'] }) : [];
            
            if (features.length > 0) {
                const gem = features[0];
                const props = gem.properties;
                const name = props?.name;
                const coords = (gem.geometry as any).coordinates;
                
                setSelectedNativePoi(gem);
                setActivePoiId(name);
                setModalPoiId(name);
                mapRef.current?.flyTo({ center: [coords[0], coords[1]], zoom: 17, pitch: 45, duration: 800 });
                return;
            }

            // [RESTORATION] Robust detection: query symbol layers first, fallback to ALL layers
            const layersToQuery = symbolLayersRef.current?.filter((id) => map.getLayer(id));
            let allFeatures = layersToQuery && layersToQuery.length > 0
                ? map.queryRenderedFeatures(bbox, { layers: layersToQuery })
                : [];
            
            // If no features found in symbols, try everything in the bbox
            if (allFeatures.length === 0) {
                allFeatures = map.queryRenderedFeatures(bbox);
            }

            const poiFeature = allFeatures.find((f: any) => {
                const layerId = (f.layer?.id || '').toLowerCase();
                const sourceName = (f.source || '').toLowerCase();
                const hasName = f.properties?.name || f.properties?.name_en;
                const skipPatterns = ['road', 'building', 'land', 'water', 'boundary', 'admin', 'tunnel', 'bridge', 'path', 'street'];
                if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;

                // Allow clicking any named POI that Mapbox renders
                return !!hasName;
            });

            if (poiFeature) {
                const geom = poiFeature.geometry as any;
                const coords = geom?.coordinates
                    ? { lng: geom.coordinates[0], lat: geom.coordinates[1] }
                    : { lng: event.lngLat.lng, lat: event.lngLat.lat };

                const details = mapPoiDetails({
                    ...poiFeature,
                    geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
                });
                setSelectedNativePoi(details);
                setActivePoiId(details.name);
            } else {
                if (activePoiId !== 'hotel') {
                    setActivePoiId(null);
                    setSelectedNativePoi(null);
                }
            }
        }, [activePoiId, showDirections, isPoiAllowed]);

        const handleRecenter = useCallback(() => {
            if (!hasCoordinates) return;
            mapRef.current?.flyTo({ center: [coordinates.lng, coordinates.lat], zoom: 16, pitch: 45, duration: 800 });
        }, [hasCoordinates, coordinates]);

        const scrollGems = useCallback((direction: 'left' | 'right') => {
            if (!gemsScrollRef.current) return;
            const scrollAmount = 300;
            gemsScrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }, []);

        // Fit bounds for origin search directions
        React.useEffect(() => {
            if (showDirections && origin && hasCoordinates && mapRef.current) {
                mapRef.current.fitBounds(
                    [[Math.min(origin.lng, coordinates.lng), Math.min(origin.lat, coordinates.lat)],
                    [Math.max(origin.lng, coordinates.lng), Math.max(origin.lat, coordinates.lat)]],
                    { padding: { top: 180, bottom: 60, left: 60, right: 60 }, pitch: 30, duration: 1200, maxZoom: 17 }
                );
            }
        }, [origin, hasCoordinates, coordinates, showDirections]);


        // POI Icons are shown automatically by streets-v12. (No need to scale manually)

        const lastMoveRef = useRef<number>(0);
        const symbolLayersRef = useRef<string[] | null>(null);

        // Invalidate cached symbol layers when the map style URL changes
        React.useEffect(() => {
            symbolLayersRef.current = null;
        }, [mapStyleUrl]);

        const onMouseMove = useCallback((event: any) => {
            if (!mapRef.current || showDirections) return;
            
            const map = mapRef.current.getMap();
            if (!map || !map.loaded()) return;

            // [OPTIMIZATION] Skip expensive POI detection during active map movement
            if (map.isMoving() || map.isZooming() || map.isRotating()) {
                map.getCanvas().style.cursor = '';
                return;
            }

            // Throttle the expensive queryRenderedFeatures to ~7fps
            const now = Date.now();
            if (now - lastMoveRef.current < 150) return;
            lastMoveRef.current = now;

            // Use a small bounding box (5px) instead of exact point for cheaper GPU queries
            const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
                [event.point.x - 5, event.point.y - 5],
                [event.point.x + 5, event.point.y + 5]
            ];
            
            const hasGemsLayer = map.getLayer('gems-layer');
            if (hasGemsLayer) {
                const features = map.queryRenderedFeatures(bbox, { layers: ['gems-layer'] });
                if (features.length > 0) {
                    map.getCanvas().style.cursor = 'pointer';
                    return;
                }
            }

            // Cache symbol layers to avoid querying 3D buildings, terrain, and heavy polygons
            if (!symbolLayersRef.current) {
                try {
                    symbolLayersRef.current = map.getStyle().layers
                        .filter((l: any) => l.type === 'symbol' && !l.id.toLowerCase().includes('road') && !l.id.toLowerCase().includes('street') && !l.id.toLowerCase().includes('state'))
                        .map((l: any) => l.id);
                } catch(e) {
                    symbolLayersRef.current = [];
                }
            }

            // [RESTORATION] Robust detection: query symbol layers first, fallback to ALL layers
            const layersToQuery = symbolLayersRef.current?.filter((id) => map.getLayer(id));
            let allFeatures = layersToQuery && layersToQuery.length > 0
                ? map.queryRenderedFeatures(bbox, { layers: layersToQuery })
                : [];

            if (allFeatures.length === 0) {
                allFeatures = map.queryRenderedFeatures(bbox);
            }

            const poiFeature = allFeatures.find((f: any) => {
                const layerId = (f.layer?.id || '').toLowerCase();
                const sourceName = (f.source || '').toLowerCase();
                const hasName = f.properties?.name || f.properties?.name_en;
                const skipPatterns = ['road', 'building', 'land', 'water', 'boundary', 'admin', 'tunnel', 'bridge', 'path', 'street'];
                if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;

                return !!hasName;
            });

            map.getCanvas().style.cursor = poiFeature ? 'pointer' : '';
        }, [showDirections, isPoiAllowed]);

        if (!mounted) {
            return (
                <div className="h-full w-full flex flex-col rounded-xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-white/10 relative bg-slate-50 dark:bg-slate-900 animate-pulse">
                    <div className="flex-1 flex items-center justify-center">
                        <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col relative dark:bg-slate-950 lg:h-full">
                {/* Map Container */}
                <div className="relative w-full h-[320px] sm:h-[450px] lg:h-full mb-2 lg:mb-0">
                    {isFullscreen && mounted ? createPortal(
                        <div className="fixed inset-0 z-[10000] bg-slate-950/20 dark:bg-slate-950 flex flex-col">
                            <div className="relative flex-1">
                                <div className="absolute inset-0">
                                    {hasCoordinates ? (
                                        <UIMap
                                            ref={mapRef}
                                            mapStyle={mapStyleUrl}
                                            standardConfig={standardConfig}
                                            enable3DTerrain={terrainEnabled}
                                            terrainExaggeration={1.5}
                                            initialViewState={{ longitude: coordinates.lng, latitude: coordinates.lat, zoom: 16, pitch: 45, bearing: 0 }}
                                            onStyleReady={handleStyleReady}
                                            onClick={onMapClick}
                                            onMouseMove={onMouseMove}
                                            maxPitch={60}
                                            antialias={false}
                                            className="!min-h-0 !rounded-none h-full"
                                        >
                                            <NavigationControl position="top-right" showCompass={false} />
                                            <MapDetailsPanel
                                                isOpen={showDetailsPanel}
                                                onClose={() => setShowDetailsPanel(false)}
                                                mapType={mapType}
                                                onMapTypeChange={setMapType}
                                                details={mapDetails}
                                                onDetailToggle={handleDetailToggle}
                                                showLabels={showLabels}
                                                onLabelsToggle={() => setShowLabels((prev) => !prev)}
                                                isFullscreen={isFullscreen}
                                            />
                                            <GeolocateControl position="top-right" positionOptions={{ enableHighAccuracy: true }} />

                                            <MapSourceLayers 
                                                routeGeojson={routeGeojson}
                                                gemsGeojson={gemsGeojson}
                                                activeRouteGeometry={activeRouteGeometry}
                                                showDirections={showDirections}
                                            />

                                            {showDirections && origin && (
                                                <Marker
                                                    latitude={origin.lat}
                                                    longitude={origin.lng}
                                                    anchor="bottom"
                                                    draggable
                                                    onDragEnd={(e) => handleSelectOrigin({ ...origin, lat: e.lngLat.lat, lng: e.lngLat.lng, name: 'Dropped Pin' })}
                                                >
                                                    <div className="flex flex-col items-center drop-shadow-xl">
                                                        <svg width="28" height="34" viewBox="0 0 24 30" fill="none"><path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#10b981" stroke="white" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="white" /></svg>
                                                    </div>
                                                </Marker>
                                            )}

                                            <Marker latitude={coordinates.lat} longitude={coordinates.lng} anchor="center">
                                                <div className={`flex flex-col items-center transition-all ${activePoiId === 'hotel' ? 'scale-125 z-20' : ''}`} onClick={() => setActivePoiId('hotel')}>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-xl ${activePoiId === 'hotel' ? 'bg-blue-600 border-white text-white' : 'bg-white border-blue-200 text-blue-600'}`}>
                                                        <Home size={16} />
                                                    </div>
                                                </div>
                                            </Marker>

                                            <MapOverlay 
                                                isFullscreen={isFullscreen}
                                                showDirections={showDirections} 
                                                setShowDirections={setShowDirections}
                                                setActivePoiId={setActivePoiId}
                                                setSelectedNativePoi={setSelectedNativePoi}
                                                setModalPoiId={setModalPoiId}
                                                originQuery={originQuery}
                                                handleOriginSearch={handleOriginSearch}
                                                showOriginResults={showOriginResults}
                                                setShowOriginResults={setShowOriginResults}
                                                originResults={originResults}
                                                handleSelectOrigin={handleSelectOrigin}
                                                isSearching={isSearching}
                                                isLocating={isLocating}
                                                handleLocateMe={handleLocateMe}
                                                clearSearch={clearSearch}
                                                clearDirections={clearDirections}
                                                transportProfile={transportProfile}
                                                setTransportProfile={setTransportProfile}
                                                originTravelTime={originTravelTime}
                                                originWalkingTime={originWalkingTime}
                                                originCyclingTime={originCyclingTime}
                                                isFetchingOriginRoute={isFetchingOriginRoute}
                                                poiTravelTime={poiTravelTime}
                                                poiWalkingTime={poiWalkingTime}
                                                poiCyclingTime={poiCyclingTime}
                                                weather={weather}
                                                isWeatherLoading={isWeatherLoading}
                                                refetchWeather={refetchWeather}
                                                showDetailsPanel={showDetailsPanel}
                                                setShowDetailsPanel={setShowDetailsPanel}
                                                displayInfo={displayInfo}
                                                selectedNativePoi={selectedNativePoi}
                                                propertyName={name}
                                                hotelName={name}
                                                coordinates={coordinates}
                                                setIsFullscreen={setIsFullscreen}
                                                handleRecenter={handleRecenter}
                                            />
                                        </UIMap>
                                    ) : (
                                        <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400">Map not available</div>
                                    )}
                                </div>
                            </div>
                        </div>,
                        document.body
                    ) : (
                        <div className="absolute inset-0 overflow-hidden rounded-xl shadow-sm border border-slate-200/60 dark:border-white/10">
                            {hasCoordinates ? (
                                <UIMap
                                    ref={mapRef}
                                    mapStyle={mapStyleUrl}
                                    standardConfig={standardConfig}
                                    enable3DTerrain={terrainEnabled}
                                    terrainExaggeration={1.5}
                                    initialViewState={{ longitude: coordinates.lng, latitude: coordinates.lat, zoom: 16, pitch: 45, bearing: 0 }}
                                    onStyleReady={handleStyleReady}
                                    onClick={onMapClick}
                                    onMouseMove={onMouseMove}
                                    maxPitch={60}
                                    antialias={false}
                                    className="!min-h-0 !rounded-none h-full"
                                >
                                    <NavigationControl position="top-right" showCompass={false} />
                                    <MapDetailsPanel
                                        isOpen={showDetailsPanel}
                                        onClose={() => setShowDetailsPanel(false)}
                                        mapType={mapType}
                                        onMapTypeChange={setMapType}
                                        details={mapDetails}
                                        onDetailToggle={handleDetailToggle}
                                        showLabels={showLabels}
                                        onLabelsToggle={() => setShowLabels((prev) => !prev)}
                                        isFullscreen={isFullscreen}
                                    />
                                    <GeolocateControl position="top-right" positionOptions={{ enableHighAccuracy: true }} />

                                    <MapSourceLayers 
                                        routeGeojson={routeGeojson}
                                        gemsGeojson={gemsGeojson}
                                        activeRouteGeometry={activeRouteGeometry}
                                        showDirections={showDirections}
                                    />

                                    <Marker latitude={coordinates.lat} longitude={coordinates.lng} anchor="center">
                                        <div className={`flex flex-col items-center transition-all ${activePoiId === 'hotel' ? 'scale-125 z-20' : ''}`} onClick={() => setActivePoiId('hotel')}>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-xl ${activePoiId === 'hotel' ? 'bg-blue-600 border-white text-white' : 'bg-white border-blue-200 text-blue-600'}`}>
                                                <Home size={16} />
                                            </div>
                                        </div>
                                    </Marker>

                                    <MapOverlay 
                                        isFullscreen={isFullscreen}
                                        showDirections={showDirections} 
                                        setShowDirections={setShowDirections}
                                        setActivePoiId={setActivePoiId}
                                        setSelectedNativePoi={setSelectedNativePoi}
                                        setModalPoiId={setModalPoiId}
                                        originQuery={originQuery}
                                        handleOriginSearch={handleOriginSearch}
                                        showOriginResults={showOriginResults}
                                        setShowOriginResults={setShowOriginResults}
                                        originResults={originResults}
                                        handleSelectOrigin={handleSelectOrigin}
                                        isSearching={isSearching}
                                        isLocating={isLocating}
                                        handleLocateMe={handleLocateMe}
                                        clearSearch={clearSearch}
                                        clearDirections={clearDirections}
                                        transportProfile={transportProfile}
                                        setTransportProfile={setTransportProfile}
                                        originTravelTime={originTravelTime}
                                        originWalkingTime={originWalkingTime}
                                        originCyclingTime={originCyclingTime}
                                        isFetchingOriginRoute={isFetchingOriginRoute}
                                        poiTravelTime={poiTravelTime}
                                        poiWalkingTime={poiWalkingTime}
                                        poiCyclingTime={poiCyclingTime}
                                        weather={weather}
                                        isWeatherLoading={isWeatherLoading}
                                        refetchWeather={refetchWeather}
                                        showDetailsPanel={showDetailsPanel}
                                        setShowDetailsPanel={setShowDetailsPanel}
                                        displayInfo={displayInfo}
                                        selectedNativePoi={selectedNativePoi}
                                        propertyName={name}
                                        hotelName={name}
                                        coordinates={coordinates}
                                        setIsFullscreen={setIsFullscreen}
                                        handleRecenter={handleRecenter}
                                    />
                                </UIMap>
                            ) : (
                                <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400">Map not available</div>
                            )}
                        </div>
                    )}
                </div>

                {isFullscreen && mounted ? createPortal(
                    <PoiDiscovery 
                        isFullscreen={isFullscreen}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        isCategoryDropdownOpen={isCategoryDropdownOpen}
                        setIsCategoryDropdownOpen={setIsCategoryDropdownOpen}
                        handleRecenter={handleRecenter}
                        setIsFullscreen={setIsFullscreen}
                        nearbyGems={nearbyGems}
                        isFetchingGems={isFetchingGems}
                        activePoiId={activePoiId}
                        setActivePoiId={setActivePoiId}
                        setSelectedNativePoi={setSelectedNativePoi}
                        setModalPoiId={setModalPoiId}
                        mapRef={mapRef}
                        gemsScrollRef={gemsScrollRef}
                        scrollGems={scrollGems}
                        itineraryGems={itineraryGems}
                        toggleItineraryGem={toggleItineraryGem}
                        handleOptimizeRoute={handleOptimizeRoute}
                        isOptimizing={isOptimizing}
                        hasOptimizedRoute={!!optimizedRouteGeometry}
                    />,
                    document.body
                ) : (
                    <PoiDiscovery 
                        isFullscreen={isFullscreen}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        isCategoryDropdownOpen={isCategoryDropdownOpen}
                        setIsCategoryDropdownOpen={setIsCategoryDropdownOpen}
                        handleRecenter={handleRecenter}
                        setIsFullscreen={setIsFullscreen}
                        nearbyGems={nearbyGems}
                        isFetchingGems={isFetchingGems}
                        activePoiId={activePoiId}
                        setActivePoiId={setActivePoiId}
                        setSelectedNativePoi={setSelectedNativePoi}
                        setModalPoiId={setModalPoiId}
                        mapRef={mapRef}
                        gemsScrollRef={gemsScrollRef}
                        scrollGems={scrollGems}
                        itineraryGems={itineraryGems}
                        toggleItineraryGem={toggleItineraryGem}
                        handleOptimizeRoute={handleOptimizeRoute}
                        isOptimizing={isOptimizing}
                        hasOptimizedRoute={!!optimizedRouteGeometry}
                    />
                )}
                <PoiDetailsModal isOpen={!!modalPoi} onClose={() => setModalPoiId(null)} poi={modalPoi} />
            </div>
        );
    });

PropertyMapSidebarContent.displayName = 'PropertyMapSidebarContent';

export default PropertyMapSidebarContent;
