'use client';

import React, { useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, Car, Bike, X, GraduationCap, Trees, Utensils, Building2, Landmark, Coffee, Library, Pill, ShoppingBasket, Banknote, Church, Bus, Footprints, Search, Maximize, Minimize, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { Marker, NavigationControl, Source, Layer, GeolocateControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { useMapboxDirections } from '../mapbox/hooks/useMapboxDirections';
import { useMapboxSearch } from '../mapbox/hooks/useMapboxSearch';
import { useMapDetails } from '@/components/mapbox/hooks/useMapDetails';
import { MapDetailsPanel } from '@/components/mapbox/components/MapDetailsPanel';
import { env } from '@/utils/env';

const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1';

const POI_FILTERS = [
    { id: 'all', label: 'All Discovery', icon: Search },
    { id: 'restaurant', label: 'Dining', icon: Utensils },
    { id: 'attraction', label: 'Attractions & Parks', icon: Landmark },
];

/**
 * Creates a Mapbox-native 'Real' visual URL for a location.
 * Uses Mapbox Static Images API to provide a geographical pinpoint of the spot.
 */
const getMapboxPoiImage = (name: string, lat: number, lng: number) => {
    return `/api/poi-photo?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}`;
};

const BAGUIO_DEFAULT_GEMS = [
    { name: 'Burnham Park', category: 'Park', icon: Trees, coordinates: { lat: 16.4124, lng: 120.5946 } },
    { name: 'Mines View Park', category: 'Sightseeing', icon: Landmark, coordinates: { lat: 16.4231, lng: 120.6274 } },
    { name: 'Session Road', category: 'Shopping', icon: ShoppingBasket, coordinates: { lat: 16.4138, lng: 120.5971 } },
    { name: 'Good Taste Cafe', category: 'Dining', icon: Utensils, coordinates: { lat: 16.4162, lng: 120.5937 } },
    { name: 'Chaya Baguio', category: 'Dining', icon: Utensils, coordinates: { lat: 16.3986, lng: 120.5847 } },
    { name: 'Vizco\'s Restaurant', category: 'Dining', icon: Utensils, coordinates: { lat: 16.4135, lng: 120.5975 } },
];


const NEARBY_CATEGORIES = [
    { id: 'restaurant', label: 'Food', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'park', label: 'Parks', icon: Trees, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'shopping', label: 'Shopping', icon: ShoppingBasket, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'attractions', label: 'Sightseeing', icon: Landmark, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'transit', label: 'Transit', icon: Bus, color: 'text-slate-500', bg: 'bg-slate-50' },
];

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

const PropertyMapSidebarContent: React.FC<PropertyMapSidebarProps> = ({
    hotelDetails,
    coordinates,
    propertyName,
}) => {
    const mapRef = useRef<MapRef>(null);
    const gemsScrollRef = useRef<HTMLDivElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
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
    } = useMapDetails();

    // Trigger map resize after fullscreen transition so it fills the new container
    React.useEffect(() => {
        const id = setTimeout(() => mapRef.current?.resize(), 310);
        return () => clearTimeout(id);
    }, [isFullscreen]);

    // POI State
    const [activePoiId, setActivePoiId] = useState<string | null>(null);
    const [selectedNativePoi, setSelectedNativePoi] = useState<any>(null);

    // Directions State
    const [showDirections, setShowDirections] = useState(false);

    // Nearby Categories State
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [categoryResults, setCategoryResults] = useState<any[]>([]);
    const [isSearchingCategory, setIsSearchingCategory] = useState(false);

    // Nearby Image Gems State
    const [nearbyGems, setNearbyGems] = useState<any[]>([]);
    const [isFetchingGems, setIsFetchingGems] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [transportProfile, setTransportProfile] = useState<'driving-traffic' | 'driving' | 'walking' | 'cycling'>('driving-traffic');

    // Initial hydration fix
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const formatDuration = (mins: number) => {
        if (mins < 60) return `${mins} min`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
    };

    const name = propertyName || hotelDetails?.name || 'Premium Stay';
    const addressLine = hotelDetails?.address || 'Address not available';
    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const getPoiDetails = useCallback((feature: any) => {
        const { properties } = feature;
        const category = properties?.class || properties?.type || properties?.category || 'attraction';
        const poiName = properties?.name || properties?.name_en || 'Point of Interest';

        const iconMap: Record<string, any> = {
            restaurant: Utensils, cafe: Coffee, food: Utensils, bar: Utensils,
            park: Trees, garden: Trees, park_like: Trees,
            school: GraduationCap, university: Building2, college: GraduationCap,
            pharmacy: Pill, medical: Pill, hospital: Pill,
            bank: Banknote, atm: Banknote,
            shop: ShoppingBasket, mall: ShoppingBasket, supermarket: ShoppingBasket,
            church: Church, religion: Church, place_of_worship: Church,
            museum: Library, landmark: Landmark, monument: Landmark, attraction: Landmark,
            bus: Bus, rail: Bus, station: Bus,
        };

        const matchedClass = Object.keys(iconMap).find(key => category.toLowerCase().includes(key)) || 'attraction';

        return {
            name: poiName,
            icon: iconMap[matchedClass] || Landmark,
            category: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' '),
            coordinates: {
                lng: feature.geometry.coordinates[0],
                lat: feature.geometry.coordinates[1],
            },
        };
    }, []);

    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();

    React.useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => console.warn('Sidebar geolocation failed:', err),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
    }, []);

    // Search query hook for origin typing
    const {
        originQuery,
        originResults,
        showOriginResults,
        setShowOriginResults,
        isSearching,
        origin,
        handleOriginSearch,
        handleSelectOrigin,
        clearSearch
    } = useMapboxSearch({ proximity: userLocation || (hasCoordinates ? coordinates : undefined) });

    const clearDirections = useCallback(() => {
        setShowDirections(false);
        clearSearch();
    }, [clearSearch]);

    // ROUTE 1: Hotel to selected nearby POI (no traffic)
    const {
        routeGeometry: poiRouteGeometry,
        travelTime: poiTravelTime,
        walkingTime: poiWalkingTime,
        cyclingTime: poiCyclingTime
    } = useMapboxDirections({
        origin: hasCoordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
        destination: selectedNativePoi ? { lat: selectedNativePoi.coordinates.lat, lng: selectedNativePoi.coordinates.lng } : null,
        enabled: !!selectedNativePoi && hasCoordinates && !showDirections,
        profile: transportProfile
    });

    // ROUTE 2: User Origin to Hotel (with traffic)
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

    // Category Search Logic
    React.useEffect(() => {
        if (!activeCategory || !hasCoordinates || !env.MAPBOX_TOKEN) {
            setCategoryResults([]);
            return;
        }

        const fetchResults = async () => {
            setIsSearchingCategory(true);
            try {
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(activeCategory)}.json?proximity=${coordinates.lng},${coordinates.lat}&access_token=${env.MAPBOX_TOKEN}&limit=8&types=poi&language=en`;
                const res = await fetch(url);
                const data = await res.json();
                const results = (data.features || []).map((f: any) => getPoiDetails(f));
                setCategoryResults(results);
            } catch (err) {
                console.error('Nearby search failed:', err);
                setCategoryResults([]);
            } finally {
                setIsSearchingCategory(false);
            }
        };

        fetchResults();
    }, [activeCategory, coordinates, hasCoordinates, getPoiDetails]);

    // Fetch Nearby Gems (Filtered by Category)
    React.useEffect(() => {
        if (!isLoaded || !hasCoordinates || !env.MAPBOX_TOKEN) return;

        const fetchTopGems = async () => {
            setIsFetchingGems(true);
            try {
                const results: any[] = [];
                const categories = selectedCategory === 'all'
                    ? ['tourism', 'park', 'restaurant', 'museum']
                    : (selectedCategory === 'attraction' ? ['park', 'tourism', 'museum', 'monument', 'viewpoint', 'attraction'] : [selectedCategory]);

                const fetchPromises = categories.map(cat =>
                    fetch(`https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(cat)}?access_token=${env.MAPBOX_TOKEN}&language=en&limit=15&proximity=${coordinates.lng},${coordinates.lat}`)
                        .then(res => res.json())
                        .catch(() => ({ features: [] }))
                );

                const categoryResponses = await Promise.all(fetchPromises);
                const uniqueFeatures: Record<string, any> = {};

                categoryResponses.forEach(data => {
                    if (data.features) {
                        data.features.forEach((f: any) => {
                            if (!uniqueFeatures[f.properties.mapbox_id]) {
                                uniqueFeatures[f.properties.mapbox_id] = f;
                            }
                        });
                    }
                });

                // --- STAGE 2: DEEP RETRIEVAL FOR REAL IMAGES from Mapbox ---
                const retrievePromises = Object.values(uniqueFeatures).slice(0, 20).map(async (f: any) => {
                    const id = f.properties.mapbox_id;
                    try {
                        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${id}?access_token=${env.MAPBOX_TOKEN}&session_token=${mapboxSessionToken}`);
                        const data = await res.json();
                        const retrievedFeature = data.features?.[0];

                        const name = retrievedFeature?.properties?.name || f.properties.name;
                        const lat = retrievedFeature?.geometry?.coordinates[1] || f.geometry.coordinates[1];
                        const lng = retrievedFeature?.geometry?.coordinates[0] || f.geometry.coordinates[0];

                        // Priority 1: Mapbox/Foursquare native photo URL (metadata.image_url)
                        // Priority 2: Mapbox Extended images array (metadata.images)
                        // Priority 3: Mapbox Vivid Satellite 'Drone' Snippet (High-res 45° real-world shot)
                        const metadata = retrievedFeature?.properties?.metadata;
                        const imageUrl = metadata?.image_url || metadata?.images?.[0] || getMapboxPoiImage(name, lat, lng);

                        return {
                            name,
                            category: retrievedFeature?.properties?.category_en?.[0] || f.properties.category || 'Attraction',
                            icon: f.properties.maki === 'restaurant' ? Utensils : (f.properties.maki === 'park' ? Trees : Landmark),
                            coordinates: { lat, lng },
                            imageUrl
                        };
                    } catch (e) {
                        return {
                            name: f.properties.name,
                            category: f.properties.category_en?.[0] || 'Attraction',
                            icon: f.properties.maki === 'restaurant' ? Utensils : (f.properties.maki === 'park' ? Trees : Landmark),
                            coordinates: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
                            imageUrl: getMapboxPoiImage(f.properties.name || 'POI', f.geometry.coordinates[1], f.geometry.coordinates[0])
                        };
                    }
                });

                results.push(...(await Promise.all(retrievePromises)));

                // ── Fallback for Baguio City (Only if sparse) ──
                const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;
                if (results.length < 5 && isBaguio) {
                    BAGUIO_DEFAULT_GEMS.forEach(gem => {
                        const gCat = gem.category.toLowerCase();
                        const sCat = selectedCategory === 'restaurant' ? 'dining' : selectedCategory;
                        const matchesCat = selectedCategory === 'all' ||
                            gCat.includes(sCat) ||
                            (selectedCategory === 'attraction' && (gCat.includes('sightseeing') || gCat.includes('landmark') || gCat.includes('park') || gCat.includes('nature')));

                        if (matchesCat && !results.find(r => r.name === gem.name)) {
                            const imageUrl = getMapboxPoiImage(gem.name, gem.coordinates.lat, gem.coordinates.lng);
                            results.push({
                                ...gem,
                                imageUrl
                            });
                        }
                    });
                }

                setNearbyGems(results.slice(0, 20));
                // Clear directions when switching categories for a clean view
                if (showDirections) clearDirections();
            } catch (err) {
                console.error('Fetching gems failed:', err);
                const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;
                if (isBaguio && selectedCategory === 'all') setNearbyGems(BAGUIO_DEFAULT_GEMS);
            } finally {
                setIsFetchingGems(false);
            }
        };

        fetchTopGems();
    }, [isLoaded, hasCoordinates, coordinates, getPoiDetails, selectedCategory]);

    // Determine which markers/route should be active

    // Determine which route is currently active
    const activeRouteGeometry = showDirections && origin ? originRouteGeometry : poiRouteGeometry;

    const routeGeojson = React.useMemo(() => {
        if (!activeRouteGeometry) return { type: 'FeatureCollection', features: [] };
        return { type: 'Feature', properties: {}, geometry: activeRouteGeometry };
    }, [activeRouteGeometry]);

    const displayInfo = activePoiId === 'hotel' ? {
        name,
        address: addressLine,
        distance: 0,
        coordinates,
    } : selectedNativePoi ? {
        name: selectedNativePoi.name,
        address: selectedNativePoi.category,
        distance: coordinates ? getDistance(coordinates.lat, coordinates.lng, selectedNativePoi.coordinates.lat, selectedNativePoi.coordinates.lng) : 0,
        coordinates: selectedNativePoi.coordinates,
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
        const features = map.queryRenderedFeatures(event.point);
        const skipPatterns = ['road', 'building', 'land', 'water', 'boundary', 'admin', 'tunnel', 'bridge', 'path', 'street'];

        const poiFeature = features.find((f: any) => {
            const layerId = (f.layer?.id || '').toLowerCase();
            const sourceName = (f.source || '').toLowerCase();
            const hasName = f.properties?.name || f.properties?.name_en;
            if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;
            return !!hasName;
        });

        if (poiFeature) {
            const geom = poiFeature.geometry as any;
            const coords = geom?.coordinates
                ? { lng: geom.coordinates[0], lat: geom.coordinates[1] }
                : { lng: event.lngLat.lng, lat: event.lngLat.lat };

            const details = getPoiDetails({
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
    }, [activePoiId, getPoiDetails, showDirections]);

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

    const handleLoad = useCallback(() => {
        setIsLoaded(true);
    }, []);

    // POI Icons are shown automatically by streets-v12. (No need to scale manually)

    const onMouseMove = useCallback((event: any) => {
        if (!mapRef.current || showDirections) return;
        const map = mapRef.current.getMap();
        if (!map || !map.loaded()) return;
        const features = map.queryRenderedFeatures(event.point);
        const skipPatterns = ['road', 'building', 'land', 'water', 'boundary', 'admin', 'tunnel', 'bridge', 'path', 'street'];
        const hasPoi = features.some((f: any) => {
            const layerId = (f.layer?.id || '').toLowerCase();
            const sourceName = (f.source || '').toLowerCase();
            const hasName = f.properties?.name || f.properties?.name_en;
            if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;
            return !!hasName;
        });
        map.getCanvas().style.cursor = hasPoi ? 'pointer' : '';
    }, [showDirections]);

    if (!mounted) {
        return (
            <div className="h-full w-full flex flex-col rounded-xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-white/10 relative bg-slate-50 dark:bg-slate-900 animate-pulse">
                <div className="flex-1 flex items-center justify-center">
                    <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                </div>
            </div>
        );
    }

    const mapContent = (
        <div className="absolute inset-0">
            {hasCoordinates ? (
                <>
                    <Map
                        ref={mapRef}
                        mapStyle={mapStyleUrl}
                        enable3DTerrain={terrainEnabled}
                        terrainExaggeration={1.5}
                        initialViewState={{ longitude: coordinates.lng, latitude: coordinates.lat, zoom: 16, pitch: 45, bearing: 0 }}
                        onLoad={handleLoad}
                        onClick={onMapClick}
                        onMouseMove={onMouseMove}
                        maxPitch={60}
                        enable3DBuildings={false}
                        className="!min-h-0 !rounded-none h-full"
                    >
                        <NavigationControl position="top-right" showCompass={false} />
                        
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
                        <GeolocateControl position="top-right" positionOptions={{ enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }} />

                        {isLoaded && (
                            <>
                                <Source id="route-source" type="geojson" data={routeGeojson as any}>
                                    <Layer
                                        id="route-layer-casing"
                                        type="line"
                                        layout={{ 'line-cap': 'round', 'line-join': 'round', 'visibility': activeRouteGeometry ? 'visible' : 'none' }}
                                        paint={{ 'line-color': showDirections ? '#ffffff' : 'transparent', 'line-width': 8, 'line-opacity': 0.6 }}
                                    />
                                    <Layer
                                        id="route-layer"
                                        type="line"
                                        layout={{ 'line-cap': 'round', 'line-join': 'round', 'visibility': activeRouteGeometry ? 'visible' : 'none' }}
                                        paint={{ 'line-color': '#3b82f6', 'line-width': showDirections ? 5 : 6, 'line-opacity': showDirections ? 0.9 : 0.8 }}
                                    />
                                </Source>

                                {/* Origin Pin (Draggable for manual placement) */}
                                {showDirections && origin && (
                                    <Marker
                                        latitude={origin.lat}
                                        longitude={origin.lng}
                                        anchor="bottom"
                                        draggable={true}
                                        onDragEnd={(e) => {
                                            handleSelectOrigin({
                                                ...origin,
                                                lat: e.lngLat.lat,
                                                lng: e.lngLat.lng,
                                                name: 'Dropped Pin'
                                            });
                                        }}
                                    >
                                        <div className="flex flex-col items-center cursor-move group drop-shadow-xl">
                                            <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform transition-transform group-hover:scale-110">
                                                <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#10b981" stroke="white" strokeWidth="2" />
                                                <circle cx="12" cy="12" r="4" fill="white" />
                                            </svg>
                                        </div>
                                    </Marker>
                                )}

                                {/* Hotel Pin */}
                                <Marker
                                    latitude={coordinates.lat}
                                    longitude={coordinates.lng}
                                    anchor="bottom"
                                    onClick={(e) => {
                                        if (showDirections) return;
                                        e.originalEvent.stopPropagation();
                                        setActivePoiId(activePoiId === 'hotel' ? null : 'hotel');
                                    }}
                                >
                                    <div className="flex flex-col items-center cursor-pointer group">
                                        {showDirections ? (
                                            <div className="drop-shadow-xl transform transition-transform hover:scale-110">
                                                <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#db2777" stroke="white" strokeWidth="2" />
                                                    <circle cx="12" cy="12" r="4" fill="white" />
                                                </svg>
                                            </div>
                                        ) : (
                                            <div className="relative mb-1 transform transition-all duration-300 group-hover:scale-110 group-active:scale-95 drop-shadow-xl">
                                                <svg width="36" height="42" viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path
                                                        d="M18 42C18 42 36 28.1143 36 18C36 7.88571 27.9411 0 18 0C8.05888 0 0 7.88571 0 18C0 28.1143 18 42 18 42Z"
                                                        fill={activePoiId === 'hotel' || !activePoiId ? '#db2777' : '#64748b'}
                                                        stroke="white"
                                                        strokeWidth="2"
                                                    />
                                                    <circle cx="18" cy="18" r="6" fill="white" />
                                                </svg>
                                            </div>
                                        )}
                                        {showDirections ? (
                                            <div className="w-4 h-1.5 bg-black/20 rounded-full mt-1 blur-[2px]" />
                                        ) : (
                                            <div className="px-2 py-0.5 bg-white/95 dark:bg-slate-800 rounded shadow-md border border-slate-200 dark:border-slate-700">
                                                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{name}</span>
                                            </div>
                                        )}
                                    </div>
                                </Marker>
                            </>
                        )}
                    </Map>

                    {/* Map Legend (Bottom-left) */}
                    {showDirections && origin && (
                        <div className="absolute bottom-6 left-3 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-2.5 py-2 space-y-2">
                                <h4 className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 px-0.5">Map Legend</h4>
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-sm shrink-0" />
                                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Starting Point</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-pink-600 border border-white shadow-sm shrink-0" />
                                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Destination</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Directions panel Overlay */}
                    <div className="absolute top-1.5 left-1.5 right-11 z-20 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[340px] sm:right-auto md:top-3">
                        {!showDirections ? (
                            <button
                                onClick={() => {
                                    setShowDirections(true);
                                    setActivePoiId(null);
                                    setSelectedNativePoi(null);
                                }}
                                className="w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer"
                            >
                                <Navigation size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                <span className="truncate">Get directions...</span>
                            </button>
                        ) : (
                            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-md shadow overflow-hidden">
                                {/* Origin row */}
                                <div className="flex items-center gap-1.5 px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={originQuery}
                                            onChange={(e) => handleOriginSearch(e.target.value)}
                                            onBlur={() => setTimeout(() => setShowOriginResults(false), 150)}
                                            onFocus={() => originResults.length > 0 && setShowOriginResults(true)}
                                            placeholder="Where from?"
                                            autoFocus
                                            className="w-full text-[10px] text-slate-800 dark:text-slate-200 bg-transparent placeholder-slate-400 focus:outline-none"
                                        />
                                        {isSearching && (
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        )}
                                    </div>
                                    {originQuery && (
                                        <button onClick={() => { clearSearch(); }} className="shrink-0 text-slate-400 hover:text-slate-600">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                                {/* Destination row */}
                                <div className="flex items-center gap-1.5 px-2 py-1">
                                    <div className="w-1.5 h-1.5 bg-pink-500 rounded-full shrink-0" />
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 flex-1 truncate">{name}</span>
                                    <button onClick={clearDirections} className="shrink-0 text-slate-400 hover:text-slate-600">
                                        <X size={10} />
                                    </button>
                                </div>

                                {/* Transport Profile Selector */}
                                <div className="flex border-t border-slate-100 dark:border-slate-800">
                                    <button 
                                        onClick={() => setTransportProfile('driving-traffic')}
                                        className={`flex-1 py-1.5 flex justify-center transition-colors ${transportProfile === 'driving-traffic' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        <Car size={14} />
                                    </button>
                                    <button 
                                        onClick={() => setTransportProfile('walking')}
                                        className={`flex-1 py-1.5 flex justify-center transition-colors ${transportProfile === 'walking' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        <Footprints size={14} />
                                    </button>
                                    <button 
                                        onClick={() => setTransportProfile('cycling')}
                                        className={`flex-1 py-1.5 flex justify-center transition-colors ${transportProfile === 'cycling' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        <Bike size={14} />
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const url = `https://www.google.com/maps/dir/?api=1&origin=${origin ? `${origin.lat},${origin.lng}` : ''}&destination=${coordinates.lat},${coordinates.lng}&travelmode=transit`;
                                            window.open(url, '_blank');
                                        }}
                                        className="flex-1 py-1.5 flex justify-center text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        <Bus size={14} />
                                    </button>
                                </div>

                                {/* Autocomplete results */}
                                {showOriginResults && originResults.length > 0 && (
                                    <div className="border-t border-slate-100 dark:border-slate-800">
                                        {originResults.map((r) => (
                                            <button
                                                key={r.id}
                                                onMouseDown={() => handleSelectOrigin(r)}
                                                className="w-full text-left px-2 py-1 text-[10px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
                                            >
                                                <Search size={9} className="text-slate-400 shrink-0" />
                                                <span className="line-clamp-1">{r.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Travel times */}
                                {origin && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 px-2 py-1 flex items-center gap-1.5">
                                        {isFetchingOriginRoute ? (
                                            <div className="flex items-center gap-1 text-[9px] text-slate-400">
                                                <div className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                Calculating...
                                            </div>
                                        ) : (
                                            <>
                                                {originTravelTime !== null && transportProfile === 'driving-traffic' && (
                                                    <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                                        <Car size={9} className="text-blue-600 dark:text-blue-400" />
                                                        <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300">{formatDuration(originTravelTime)} </span>
                                                    </div>
                                                )}
                                                {originWalkingTime !== null && transportProfile === 'walking' && (
                                                    <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                                        <Footprints size={9} className="text-emerald-600 dark:text-emerald-400" />
                                                        <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">{formatDuration(originWalkingTime)}</span>
                                                    </div>
                                                )}
                                                {originCyclingTime !== null && transportProfile === 'cycling' && (
                                                    <div className="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                                        <Bike size={9} className="text-purple-600 dark:text-purple-400" />
                                                        <span className="text-[9px] font-bold text-purple-700 dark:text-purple-300">{formatDuration(originCyclingTime)}</span>
                                                    </div>
                                                )}
                                                {originTravelTime === null && originWalkingTime === null && origin && !isFetchingOriginRoute && (
                                                    <span className="text-[9px] text-slate-400">No route found</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* POI info card */}
                    {displayInfo && !showDirections && (
                        <div className="absolute top-16 left-3 sm:top-16 sm:left-4 z-10 w-[200px] sm:w-[260px] bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="p-2 sm:p-4 relative">
                                <button
                                    onClick={() => { setActivePoiId(null); setSelectedNativePoi(null); }}
                                    className="absolute top-1 right-1 sm:top-3 sm:right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                >
                                    <X size={16} className="w-3 h-3 sm:w-4 sm:h-4" />
                                </button>
                                <div className="pr-4 sm:pr-6 space-y-0.5 sm:space-y-1.5">
                                    <h3 className="font-bold text-slate-900 dark:text-white text-[11px] sm:text-sm leading-tight">{displayInfo.name}</h3>
                                    <p className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{displayInfo.address}</p>

                                    {displayInfo.distance > 0 && (
                                        <div className="flex items-center gap-1 sm:gap-1.5 pt-0.5 sm:pt-1">
                                            <div className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                                <Navigation size={10} className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-slate-600 dark:text-slate-400" />
                                            </div>
                                            <span className="text-[8px] sm:text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                                {displayInfo.distance.toFixed(2)} km from property
                                            </span>
                                        </div>
                                    )}

                                    {/* Travel times from hotel to POI */}
                                    {(poiTravelTime !== null || poiWalkingTime !== null) && (
                                        <div className="flex items-center gap-2 pt-1">
                                            {poiTravelTime !== null && (
                                                <div className="flex items-center gap-1">
                                                    <Car size={10} className="text-blue-600 dark:text-blue-400" />
                                                    <span className="text-[9px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300">{formatDuration(poiTravelTime)}</span>
                                                </div>
                                            )}
                                            {poiWalkingTime !== null && (
                                                <div className="flex items-center gap-1">
                                                    <Footprints size={10} className="text-emerald-600 dark:text-emerald-400" />
                                                    <span className="text-[9px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300">{formatDuration(poiWalkingTime)}</span>
                                                </div>
                                            )}
                                            {poiCyclingTime !== null && (
                                                <div className="flex items-center gap-1">
                                                    <Bike size={10} className="text-purple-600 dark:text-purple-400" />
                                                    <span className="text-[9px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300">{formatDuration(poiCyclingTime)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="pt-1 sm:pt-2">
                                        <a
                                            href={`${GOOGLE_MAPS_SEARCH_URL}&query=${encodeURIComponent(displayInfo.name)}&query_place_id=${displayInfo.coordinates?.lat},${displayInfo.coordinates?.lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[8px] sm:text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                        >
                                            View on Google Maps
                                        </a>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -left-2 top-8 w-4 h-4 bg-white dark:bg-slate-900 border-l border-t border-slate-200 dark:border-slate-700 transform -rotate-45 -z-10 hidden sm:block" />
                        </div>
                    )}

                    {/* Map Controls */}
                    <div className="absolute right-3 bottom-5 flex flex-col gap-2 items-end z-40">
                        <button
                            onClick={() => setIsFullscreen(f => !f)}
                            className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 p-2.5 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
                            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        >
                            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                        </button>
                        <button
                            onClick={handleRecenter}
                            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-700 dark:text-slate-300 text-[10px] font-bold px-2.5 py-1.5 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-1.5 group"
                            suppressHydrationWarning
                        >
                            <Navigation size={11} className="group-hover:rotate-12 transition-transform" />
                            Re-center
                        </button>
                    </div>

                    {/* Visual "Places to Visit" Image Bar */}
                    <div className={`absolute z-30 transition-all duration-500 ease-in-out group/nearby ${isFullscreen
                            ? 'left-5 top-[120px] bottom-[120px] w-48 flex flex-col gap-2 overflow-y-auto no-scrollbar py-4 px-2 bg-black/10 backdrop-blur rounded-2xl'
                            : 'bottom-[74px] sm:bottom-20 left-1/2 -translate-x-1/2 w-[96%] sm:w-[94%] flex flex-col gap-2'
                        }`}>
                        {/* Category Filter Pills */}
                        <div className={`flex gap-1.5 overflow-x-auto no-scrollbar px-0.5 ${isFullscreen ? 'flex-col mb-2' : 'flex-row'}`}>
                            {POI_FILTERS.map(filter => {
                                const isSelected = selectedCategory === filter.id;
                                const Icon = filter.icon;
                                return (
                                    <button
                                        key={filter.id}
                                        onClick={() => setSelectedCategory(filter.id)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all duration-300 shadow-sm shrink-0
                                                ${isSelected
                                                ? 'bg-blue-600 border-blue-600 text-white scale-105'
                                                : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                                            }
                                            `}
                                    >
                                        <Icon size={10} />
                                        <span className="text-[9px] font-bold whitespace-nowrap uppercase tracking-tighter">{filter.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="relative flex flex-row w-full group/imagebar">
                            {/* Previous Button (PC only, horizontal mode) */}
                            {!isFullscreen && nearbyGems.length > 0 && (
                                <button
                                    onClick={() => scrollGems('left')}
                                    className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-40 w-8 h-8 items-center justify-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100 hover:bg-white"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                            )}

                            <div
                                ref={gemsScrollRef}
                                className={`flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth px-1 py-1 w-full ${isFullscreen ? 'flex-col overflow-y-auto no-scrollbar' : 'flex-row'
                                    }`}
                            >
                                {(isFetchingGems ? Array(6).fill(0) : nearbyGems).map((poi, idx) => {
                                    if (isFetchingGems) {
                                        return <div key={idx} className="flex-shrink-0 w-32 h-20 sm:w-40 sm:h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />;
                                    }
                                    const isActive = activePoiId === poi.name;
                                    // 100% Mapbox Native Image
                                    const imageUrl = poi.imageUrl || getMapboxPoiImage(poi.name, poi.coordinates.lat, poi.coordinates.lng);

                                    return (
                                        <button
                                            key={`${poi.name}-${idx}`}
                                            onClick={() => {
                                                if (isActive) {
                                                    setActivePoiId(null);
                                                    setSelectedNativePoi(null);
                                                } else {
                                                    setSelectedNativePoi(poi);
                                                    setActivePoiId(poi.name);
                                                    mapRef.current?.flyTo({ center: [poi.coordinates.lng, poi.coordinates.lat], zoom: 17, pitch: 45, duration: 800 });
                                                }
                                            }}
                                            className={`group relative flex-shrink-0 transition-all duration-300 transform hover:scale-[1.03] active:scale-95
                                            ${isFullscreen ? 'w-full aspect-[4/3]' : 'w-28 h-18 sm:w-32 sm:h-20 md:w-40 md:h-24'}
                                            ${isActive ? 'ring-2 ring-blue-500 shadow-xl' : 'shadow-md'}
                                            rounded-xl overflow-hidden
                                        `}
                                        >
                                            {/* Background Image */}
                                            <img
                                                src={imageUrl}
                                                alt={poi.name}
                                                className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}
                                            />

                                            {/* Overlay Gradient */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                            {/* Content */}
                                            <div className="absolute inset-0 p-2 flex flex-col justify-end items-start text-white text-left">
                                                <div className="flex items-center gap-1 mb-0.5 opacity-80">
                                                    {React.createElement(poi.icon, { size: 10, className: 'shrink-0' })}
                                                    <span className="text-[8px] sm:text-[9px] font-medium uppercase tracking-wider truncate">{poi.category}</span>
                                                </div>
                                                <h4 className="text-[10px] sm:text-[11px] font-bold leading-tight line-clamp-2">{poi.name}</h4>
                                            </div>

                                            {/* Selection Indicators */}
                                            {isActive && (
                                                <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full border border-white">
                                                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Next Button (PC only, horizontal mode) */}
                            {!isFullscreen && nearbyGems.length > 0 && (
                                <button
                                    onClick={() => scrollGems('right')}
                                    className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-40 w-8 h-8 items-center justify-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100 hover:bg-white"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-800">
                    <div className="text-center">
                        <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <span className="text-sm text-slate-400">Map not available</span>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
            <div className="h-full w-full rounded-xl overflow-hidden relative shadow-sm border border-slate-200/60 dark:border-white/10">
                {!isFullscreen && mapContent}
            </div>
            {isFullscreen && mounted && createPortal(
                <div className="fixed inset-0 z-9999 bg-white dark:bg-slate-900">
                    {mapContent}
                </div>,
                document.body
            )}
        </div>
    );
};

export default PropertyMapSidebarContent;
