'use client';

import React, { useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, Car, Bike, X, GraduationCap, Trees, Utensils, Building2, Landmark, Coffee, Library, Pill, ShoppingBasket, Banknote, Church, Bus, Footprints, Search, Maximize, Minimize, ChevronLeft, ChevronRight, Layers, Star, Home, Bed } from 'lucide-react';
import { Map } from '@/components/ui/map';
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

const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1';

const POI_FILTERS = [
    { id: 'all', label: 'All Discovery', icon: Search },
    { id: 'restaurant', label: 'Dining', icon: Utensils },
    { id: 'attraction', label: 'Attractions & Parks', icon: Landmark },
    { id: 'grocery', label: 'Groceries', icon: ShoppingBasket },
    { id: 'medical', label: 'Hospitals & Health', icon: Pill },
    { id: 'transit', label: 'Transit', icon: Bus },
];

/**
 * Creates a Mapbox-native 'Real' visual URL for a location.
 * Uses Mapbox Static Images API to provide a geographical pinpoint of the spot.
 */
const getMapboxPoiImage = (name: string, lat: number, lng: number) => {
    return `/api/poi-photo?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}`;
};

const BAGUIO_DEFAULT_GEMS: any[] = [
    { 
        type: 'Feature', 
        geometry: { type: 'Point', coordinates: [120.5946, 16.4124] },
        properties: { name: 'Burnham Park', category: 'Park', icon: Trees, rating: 4.5 }
    },
    { 
        type: 'Feature', 
        geometry: { type: 'Point', coordinates: [120.6274, 16.4231] },
        properties: { name: 'Mines View Park', category: 'Sightseeing', icon: Landmark, rating: 4.4 }
    },
    { 
        type: 'Feature', 
        geometry: { type: 'Point', coordinates: [120.5971, 16.4138] },
        properties: { name: 'Session Road', category: 'Shopping', icon: ShoppingBasket, rating: 4.6 }
    },
    { 
        type: 'Feature', 
        geometry: { type: 'Point', coordinates: [120.5937, 16.4162] },
        properties: { name: 'Good Taste Cafe', category: 'Dining', icon: Utensils, rating: 4.7 }
    },
    { 
        type: 'Feature', 
        geometry: { type: 'Point', coordinates: [120.5847, 16.3986] },
        properties: { name: 'Chaya Baguio', category: 'Dining', icon: Utensils, rating: 4.8 }
    },
    { 
        type: 'Feature', 
        geometry: { type: 'Point', coordinates: [120.5975, 16.4135] },
        properties: { name: 'Vizco\'s Restaurant', category: 'Dining', icon: Utensils, rating: 4.5 }
    },
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

const PropertyMapSidebarContent = React.memo<PropertyMapSidebarProps>(
    ({ hotelDetails, coordinates, propertyName }) => {
        const mapRef = useRef<MapRef>(null);
        const gemsScrollRef = useRef<HTMLDivElement>(null);
        const [isLoaded, setIsLoaded] = useState(false);
        const [mounted, setMounted] = useState(false);
        const [isFullscreen, setIsFullscreen] = useState(false);
        const [activeMapFilters, setActiveMapFilters] = useState<string[]>(['dining', 'lodging', 'nature', 'explore']);

        // Filter Logic for interactive Map POIs
        const MAP_FILTER_CONFIG = [
            { id: 'dining', label: 'Eat', icon: Utensils, keywords: ['restaurant', 'cafe', 'food', 'bar', 'dining'] },
            { id: 'lodging', label: 'Stay', icon: Bed, keywords: ['hotel', 'motel', 'lodging', 'accommodation', 'resort'] },
            { id: 'nature', label: 'Explore', icon: Trees, keywords: ['park', 'garden', 'nature', 'viewpoint', 'forest', 'trail'] },
            { id: 'explore', label: 'Attractions', icon: Landmark, keywords: ['attraction', 'museum', 'monument', 'landmark', 'sightseeing', 'tourism', 'zoo', 'aquarium', 'gallery'] },
            { id: 'grocery', label: 'Grocery', icon: ShoppingBasket, keywords: ['grocery', 'supermarket', 'convenience', 'shop', 'market', 'mall'] },
            { id: 'medical', label: 'Health', icon: Pill, keywords: ['hospital', 'clinic', 'medical', 'pharmacy', 'doctor', 'dentist'] },
            { id: 'transit', label: 'Transit', icon: Bus, keywords: ['bus', 'train', 'station', 'transit', 'subway', 'metro', 'airport'] },
        ];

        const getMapPoiCategory = useCallback((mapboxFeature: any) => {
            const { properties } = mapboxFeature;
            const category = (properties?.class || properties?.type || properties?.category || '').toLowerCase();
            const matched = MAP_FILTER_CONFIG.find(filter =>
                filter.keywords.some(keyword => category.includes(keyword))
            );
            return matched?.id || null;
        }, []);

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

        // POI State
        const [activePoiId, setActivePoiId] = useState<string | null>(null);
        const [selectedNativePoi, setSelectedNativePoi] = useState<any>(null);
        const [modalPoi, setModalPoi] = useState<any>(null);

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
        const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
        const [isLocating, setIsLocating] = useState(false);

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

        // Weather data
        const { weather, isLoading: isWeatherLoading, refetch: refetchWeather } = useWeather({
            lat: coordinates?.lat,
            lng: coordinates?.lng,
            enabled: !!hasCoordinates,
        });

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
            reverseGeocode,
            clearSearch
        } = useGoogleSearch({ proximity: userLocation || (hasCoordinates ? coordinates : undefined) });

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
            destination: selectedNativePoi ? { 
                lat: selectedNativePoi.geometry?.coordinates[1] ?? selectedNativePoi.coordinates?.lat, 
                lng: selectedNativePoi.geometry?.coordinates[0] ?? selectedNativePoi.coordinates?.lng 
            } : null,
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

            const controller = new AbortController();
            const { signal } = controller;

            // Concurrency limiter: run at most `limit` async tasks in parallel
            const pLimit = (limit: number) => {
                let active = 0;
                const queue: (() => void)[] = [];
                const next = () => { if (queue.length > 0 && active < limit) { active++; queue.shift()!(); } };
                return <T,>(fn: () => Promise<T>): Promise<T> =>
                    new Promise<T>((resolve, reject) => {
                        const run = () => fn().then(resolve, reject).finally(() => { active--; next(); });
                        queue.push(run);
                        next();
                    });
            };

            const fetchTopGems = async () => {
                setIsFetchingGems(true);
                setNearbyGems([]); // Clear immediately so UI shows loading state
                try {
                    const getSearchCategories = (id: string) => {
                        switch (id) {
                            case 'all': return ['tourism', 'park', 'restaurant', 'museum'];
                            case 'restaurant': return ['restaurant', 'cafe', 'bar', 'food'];
                            case 'attraction': return ['park', 'tourism', 'museum', 'monument', 'viewpoint', 'attraction'];
                            case 'grocery': return ['grocery_store', 'supermarket', 'convenience_store', 'market'];
                            case 'medical': return ['hospital', 'pharmacy', 'medical_clinic', 'doctor'];
                            case 'transit': return ['bus_station', 'train_station', 'subway_station', 'airport'];
                            default: return [id];
                        }
                    };

                    const categories = getSearchCategories(selectedCategory);

                    // Clear directions when switching categories for a clean view
                    if (showDirections) clearDirections();

                    const fetchPromises = categories.map(cat =>
                        fetch(`https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(cat)}?access_token=${env.MAPBOX_TOKEN}&language=en&limit=25&proximity=${coordinates.lng},${coordinates.lat}`, { signal })
                            .then(res => res.json())
                            .catch(() => ({ features: [] }))
                    );

                    const categoryResponses = await Promise.all(fetchPromises);
                    if (signal.aborted) return;

                    const uniqueFeatures: Record<string, any> = {};

                    categoryResponses.forEach(data => {
                        if (data.features) {
                            data.features.forEach((f: any) => {
                                const name = f.properties.name || f.properties.place_name || f.properties.name_en;
                                // Deduplicate by name to keep the list clean and diverse
                                if (name && !uniqueFeatures[name]) {
                                    uniqueFeatures[name] = f;
                                }
                            });
                        }
                    });

                    // Cap features to avoid overwhelming the browser/server with requests
                    const MAX_FEATURES = 20;
                    const featuresToProcess = Object.values(uniqueFeatures).slice(0, MAX_FEATURES);


                    // --- STAGE 1: IMMEDIATE STUB DISPLAY ---
                    const initialGems = featuresToProcess.map((f: any) => {
                        const name = f.properties.name || f.properties.place_name || f.properties.name_en;
                        const lng = f.geometry.coordinates[0];
                        const lat = f.geometry.coordinates[1];
                        
                        // Augment the existing Mapbox feature with our custom discovery properties
                        return {
                            ...f,
                            properties: {
                                ...f.properties,
                                name,
                                category: f.properties.category_en?.[0] || f.properties.category || 'Attraction',
                                icon: (f.properties.maki?.includes('restaurant') || f.properties.maki?.includes('cafe') || f.properties.maki?.includes('bar')) ? Utensils : (f.properties.maki?.includes('park') || f.properties.maki?.includes('garden')) ? Trees : Landmark,
                                imageUrl: getMapboxPoiImage(name, lat, lng),
                                isStub: true
                            }
                        };
                    });

                    setNearbyGems(initialGems);

                    // --- STAGE 2: PRIORITIZED STREAM ENRICHMENT ---
                    const limiter = pLimit(8); 
                    let resolvedCount = 0;

                    const retrievePromises = initialGems.map((featureStub, idx) =>
                        limiter(async () => {
                            if (signal.aborted) return null;

                            const name = featureStub.properties.name;
                            const lng = featureStub.geometry.coordinates[0];
                            const lat = featureStub.geometry.coordinates[1];

                            if (idx >= 6) {
                                await new Promise(r => setTimeout(r, 800 + (idx * 150)));
                            }

                            try {
                                const lowerCat = featureStub.properties.category.toLowerCase();
                                const enrichmentIcon = 
                                    (lowerCat.includes('hospital') || lowerCat.includes('pharmacy') || lowerCat.includes('medical')) ? Pill :
                                    (lowerCat.includes('supermarket') || lowerCat.includes('grocery') || lowerCat.includes('shop')) ? ShoppingBasket :
                                    (lowerCat.includes('bus') || lowerCat.includes('station') || lowerCat.includes('transit')) ? Bus :
                                    (lowerCat.includes('restaurant') || lowerCat.includes('cafe') || lowerCat.includes('food')) ? Utensils :
                                    (lowerCat.includes('park') || lowerCat.includes('garden')) ? Trees : 
                                    Landmark;

                                const proxyUrl = `/api/poi-photo?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}&full=true`;
                                const proxyRes = await fetch(proxyUrl, { signal });
                                const proxyData = await proxyRes.json();

                                const enrichedFeature = {
                                    ...featureStub,
                                    properties: {
                                        ...featureStub.properties,
                                        icon: enrichmentIcon,
                                        category: proxyData.vicinity || featureStub.properties.category,
                                        rating: proxyData.rating,
                                        userRatingsTotal: proxyData.userRatingsTotal,
                                        reviews: proxyData.reviews || [],
                                        phone: proxyData.phone || null,
                                        website: proxyData.website || null,
                                        isStub: false
                                    }
                                };

                                // Update the specific feature in state
                                if (!signal.aborted) {
                                    if (enrichedFeature.properties.rating && enrichedFeature.properties.rating >= 3) {
                                        setNearbyGems(prev => prev.map(g => g.properties.name === name ? enrichedFeature : g));
                                    } else {
                                        setNearbyGems(prev => prev.filter(g => g.properties.name !== name));
                                    }
                                }
                                return enrichedFeature;
                            } catch (e: any) {
                                if (e?.name === 'AbortError') return null;
                                console.error(`Gem enrichment failed for ${name}:`, e);
                                return null;
                            } finally {
                                resolvedCount++;
                                if (resolvedCount === initialGems.length && !signal.aborted) {
                                    // ── Final Baguio Fallback logic ──
                                    setNearbyGems(prev => {
                                        const enrichedCount = prev.filter(p => !p.properties.isStub).length;
                                        const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;

                                        if (enrichedCount < 5 && isBaguio) {
                                            const newGems = [...prev];
                                            BAGUIO_DEFAULT_GEMS.forEach(gemFeature => {
                                                const gemName = gemFeature.properties.name;
                                                const gemLng = gemFeature.geometry.coordinates[0];
                                                const gemLat = gemFeature.geometry.coordinates[1];
                                                
                                                const gCat = gemFeature.properties.category.toLowerCase();
                                                const sCat = selectedCategory === 'restaurant' ? 'dining' : selectedCategory;
                                                const matchesCat = selectedCategory === 'all' ||
                                                    gCat.includes(sCat) ||
                                                    (selectedCategory === 'attraction' && (gCat.includes('sightseeing') || gCat.includes('landmark') || gCat.includes('park')));

                                                if (matchesCat && !newGems.find(r => r.properties.name === gemName)) {
                                                    newGems.push({ 
                                                        ...gemFeature, 
                                                        properties: {
                                                            ...gemFeature.properties,
                                                            imageUrl: getMapboxPoiImage(gemName, gemLat, gemLng)
                                                        }
                                                    });
                                                }
                                            });
                                            return newGems;
                                        }
                                        return prev;
                                    });
                                }
                            }
                        })
                    );

                    await Promise.all(retrievePromises);

                } catch (err: any) {
                    if (err?.name === 'AbortError') return;
                    console.error('Fetching gems failed:', err);
                    const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;
                    if (isBaguio && selectedCategory === 'all') setNearbyGems(BAGUIO_DEFAULT_GEMS);
                } finally {
                    if (!signal.aborted) setIsFetchingGems(false);
                }
            };

            fetchTopGems();
            return () => controller.abort();
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
            name: selectedNativePoi.properties?.name ?? selectedNativePoi.name,
            address: selectedNativePoi.properties?.category ?? selectedNativePoi.category,
            distance: coordinates ? getDistance(
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
            const features = map.queryRenderedFeatures(event.point);
            const skipPatterns = ['road', 'building', 'land', 'water', 'boundary', 'admin', 'tunnel', 'bridge', 'path', 'street'];

            const poiFeature = features.find((f: any) => {
                const layerId = (f.layer?.id || '').toLowerCase();
                const sourceName = (f.source || '').toLowerCase();
                const hasName = f.properties?.name || f.properties?.name_en;
                if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;

                // Interaction Filtering: Only allow allowed categories
                return !!hasName && isPoiAllowed(f);
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
        }, [activePoiId, getPoiDetails, showDirections, isPoiAllowed]);

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
            const poiFeature = features.find((f: any) => {
                const layerId = (f.layer?.id || '').toLowerCase();
                const sourceName = (f.source || '').toLowerCase();
                const hasName = f.properties?.name || f.properties?.name_en;
                if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;
                return !!hasName && isPoiAllowed(f);
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

        const mapContent = (
            <div className="absolute inset-0">
                {hasCoordinates ? (
                    <>
                        <Map
                            ref={mapRef}
                            mapStyle={mapStyleUrl}
                            standardConfig={standardConfig}
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
                                isFullscreen={isFullscreen}
                            />
                            <GeolocateControl position="top-right" positionOptions={{ enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }} />
                            
                            {/* ── Map Controls (Mobile-Minimized Overlay) ── */}
                            {!isFullscreen && (
                                <div className="absolute right-2 bottom-2 flex flex-row gap-1.5 items-center z-40 lg:hidden">
                                    <button
                                        onClick={() => setIsFullscreen(true)}
                                        className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 p-1.5 w-8 h-8 transition-all active:scale-95 flex items-center justify-center"
                                    >
                                        <Maximize size={14} />
                                    </button>
                                    <button
                                        onClick={handleRecenter}
                                        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-blue-600 rounded-full shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 w-8 h-8 transition-all active:scale-95 flex items-center justify-center"
                                    >
                                        <Navigation size={14} fill="currentColor" />
                                    </button>
                                </div>
                            )}

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

                                    {/* Hotel Marker (Circular Style) */}
                                    <Marker
                                        latitude={coordinates.lat}
                                        longitude={coordinates.lng}
                                        anchor="center"
                                        onClick={(e) => {
                                            if (showDirections) return;
                                            e.originalEvent.stopPropagation();
                                            setActivePoiId(activePoiId === 'hotel' ? null : 'hotel');
                                            setSelectedNativePoi(null);
                                        }}
                                    >
                                        <div className={`flex flex-col items-center cursor-pointer group transition-all duration-300 ${activePoiId === 'hotel' ? 'scale-125 z-20' : 'hover:scale-110'}`}>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xl border border-pink-500 transition-all duration-300
                                            ${activePoiId === 'hotel'
                                                    ? 'bg-pink-600 border-white scale-110'
                                                    : 'bg-white dark:bg-slate-900 border-pink-100 dark:border-pink-900/30'
                                                }`}
                                            >
                                                <Home size={16} className={`${activePoiId === 'hotel' ? 'text-white' : 'text-pink-600'}`} />
                                            </div>
                                            {!showDirections && (
                                                <div className="mt-1 px-2 py-0.5 bg-white/95 dark:bg-slate-800 rounded shadow-md border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                    <span className="text-[10px] font-bold text-slate-800 dark:text-slate-100">{name}</span>
                                                </div>
                                            )}
                                            {activePoiId === 'hotel' && (
                                                <div className="w-3 h-[3px] bg-black/20 rounded-full mt-1 blur-[1px]" />
                                            )}
                                        </div>
                                    </Marker>

                                    {/* Selected Native POI Marker Overlay */}
                                    {!showDirections && selectedNativePoi && !nearbyGems.find(g => (g.properties?.name || g.name) === (selectedNativePoi.properties?.name || selectedNativePoi.name)) && (
                                        <Marker
                                            latitude={selectedNativePoi.geometry?.coordinates[1] || selectedNativePoi.coordinates.lat}
                                            longitude={selectedNativePoi.geometry?.coordinates[0] || selectedNativePoi.coordinates.lng}
                                            anchor="center"
                                            onClick={(e) => {
                                                e.originalEvent.stopPropagation();
                                                setModalPoi(selectedNativePoi);
                                                setActivePoiId(selectedNativePoi.properties?.name || selectedNativePoi.name);
                                            }}
                                        >
                                            <div className="flex flex-col items-center scale-125 z-20">
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-500 border border-white shadow-xl">
                                                    {React.createElement((selectedNativePoi.properties?.icon || selectedNativePoi.icon) || Landmark, { size: 12, className: 'text-white' })}
                                                </div>
                                                <div className="w-2 h-[3px] bg-black/20 rounded-full mt-1 blur-[1px]" />
                                            </div>
                                        </Marker>
                                    )}

                                    {/* Nearby Gems POI Markers */}
                                    {!showDirections && nearbyGems
                                        .filter(gem => {
                                            const cat = (gem.properties?.category || gem.category || '').toLowerCase();
                                            const matched = MAP_FILTER_CONFIG.find(filter =>
                                                activeMapFilters.includes(filter.id) &&
                                                filter.keywords.some(kw => cat.includes(kw))
                                            );
                                            return !!matched;
                                        })
                                        .map((gem, idx) => {
                                            const name = gem.properties?.name || gem.name;
                                            const isActive = activePoiId === name;
                                            const GemIcon = (gem.properties?.icon || gem.icon) || Landmark;
                                            const lng = gem.geometry?.coordinates[0] || gem.coordinates.lng;
                                            const lat = gem.geometry?.coordinates[1] || gem.coordinates.lat;

                                            return (
                                                <Marker
                                                    key={`gem-${name}-${idx}`}
                                                    latitude={lat}
                                                    longitude={lng}
                                                    anchor="center"
                                                    onClick={(e) => {
                                                        e.originalEvent.stopPropagation();
                                                        setSelectedNativePoi(gem);
                                                        setActivePoiId(name);
                                                        setModalPoi(gem);
                                                        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, pitch: 45, duration: 800 });
                                                    }}
                                                >
                                                    <div className={`flex flex-col items-center cursor-pointer group transition-all duration-200 ${isActive ? 'scale-125 z-10' : 'hover:scale-110'}`}>
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shadow-lg border transition-colors duration-200
                                                    ${isActive
                                                                ? 'bg-blue-500 border-white'
                                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-blue-400'
                                                            }`}
                                                        >
                                                            <GemIcon size={12} className={`${isActive ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} />
                                                        </div>
                                                        {isActive && (
                                                            <div className="w-2 h-[3px] bg-black/20 rounded-full mt-1 blur-[1px]" />
                                                        )}
                                                    </div>
                                                </Marker>
                                            );
                                        })}
                                </>
                            )}
                        </Map>

                        {/* Map Legend (Bottom-left) */}
                        {showDirections && origin && (
                            <div className="absolute bottom-10 left-3 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2 space-y-2">
                                    <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 px-0.5">Map Legend</h4>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-sm shrink-0" />
                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Starting Point</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-pink-600 border border-white shadow-sm shrink-0" />
                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Destination</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={`absolute top-3 left-4 z-40 flex flex-col items-start gap-2 md:top-4 transition-all duration-300
                            ${isFullscreen ? 'w-[calc(100%-80px)] sm:w-auto max-w-[340px]' : 'w-[calc(100%-100px)] sm:w-[320px] scale-[0.9] sm:scale-100 origin-top-left'}
                        `}>
                            {/* Search and Weather Row */}
                            <div className="flex w-full items-start gap-1.5 sm:gap-2">
                                <div className="flex-1 min-w-0 sm:min-w-[280px]">
                                {!showDirections ? (
                                <button
                                    onClick={() => {
                                        setShowDirections(true);
                                        setActivePoiId(null);
                                        setSelectedNativePoi(null);
                                    }}
                                    className={`w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer
                                        ${isFullscreen ? 'px-3 py-2 text-xs font-bold' : 'px-2.5 py-1.5 text-[10px] sm:text-xs font-semibold sm:font-bold'}
                                    `}
                                >
                                    <Navigation size={isFullscreen ? 14 : 12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                    <span className="truncate">Get directions...</span>
                                </button>
                            ) : (
                                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden transition-all duration-300">
                                    {/* Origin row */}
                                    <div className="flex items-center gap-2 px-2.5 py-1 border-b border-slate-100 dark:border-slate-800">
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={originQuery}
                                                onChange={(e) => handleOriginSearch(e.target.value)}
                                                onBlur={() => setTimeout(() => setShowOriginResults(false), 150)}
                                                onFocus={() => originResults.length > 0 && setShowOriginResults(true)}
                                                placeholder="Where from?"
                                                autoFocus
                                                className="w-full text-[10px] sm:text-xs text-slate-800 dark:text-slate-200 bg-transparent placeholder-slate-400 focus:outline-none py-0.5"
                                            />
                                            {isSearching && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {originQuery ? (
                                                <button onClick={() => { clearSearch(); }} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                                                    <X size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleLocateMe}
                                                    disabled={isLocating}
                                                    title="Use my current location"
                                                    className="p-1 text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                                                >
                                                    {isLocating ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Navigation size={14} fill="currentColor" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Destination row */}
                                    <div className="flex items-center gap-2 px-2.5 py-1">
                                        <div className="w-2 h-2 bg-pink-500 rounded-full shrink-0" />
                                        <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 flex-1 truncate">{name}</span>
                                        <button onClick={clearDirections} className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5">
                                            <X size={12} />
                                        </button>
                                    </div>

                                    {/* Transport Profile Selector */}
                                    <div className="flex border-t border-slate-100 dark:border-slate-800">
                                        <button
                                            onClick={() => setTransportProfile('driving-traffic')}
                                            className={`flex-1 py-1 flex justify-center transition-colors ${transportProfile === 'driving-traffic' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <Car size={14} />
                                        </button>
                                        <button
                                            onClick={() => setTransportProfile('walking')}
                                            className={`flex-1 py-1 flex justify-center transition-colors ${transportProfile === 'walking' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <Footprints size={14} />
                                        </button>
                                        <button
                                            onClick={() => setTransportProfile('cycling')}
                                            className={`flex-1 py-1 flex justify-center transition-colors ${transportProfile === 'cycling' ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <Bike size={14} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                const url = `https://www.google.com/maps/dir/?api=1&origin=${origin ? `${origin.lat},${origin.lng}` : ''}&destination=${coordinates.lat},${coordinates.lng}&travelmode=transit`;
                                                window.open(url, '_blank');
                                            }}
                                            className="flex-1 py-1 flex justify-center text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            <Bus size={14} />
                                        </button>
                                    </div>

                                    {/* Autocomplete results */}
                                    {showOriginResults && originResults.length > 0 && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 max-h-40 overflow-y-auto">
                                            {originResults.map((r) => (
                                                <button
                                                    key={r.id}
                                                    onMouseDown={() => handleSelectOrigin(r)}
                                                    className="w-full text-left px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                                                >
                                                    <Search size={12} className="text-slate-400 shrink-0" />
                                                    <span className="line-clamp-1">{r.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Travel times */}
                                    {origin && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 px-2 py-1 flex items-center gap-2">
                                            {isFetchingOriginRoute ? (
                                                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                                    <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                    Calculating...
                                                </div>
                                            ) : (
                                                <>
                                                    {originTravelTime !== null && transportProfile === 'driving-traffic' && (
                                                        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                                            <Car size={12} className="text-blue-600 dark:text-blue-400" />
                                                            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">{formatDuration(originTravelTime)} </span>
                                                        </div>
                                                    )}
                                                    {originWalkingTime !== null && transportProfile === 'walking' && (
                                                        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                                            <Footprints size={12} className="text-emerald-600 dark:text-emerald-400" />
                                                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{formatDuration(originWalkingTime)}</span>
                                                        </div>
                                                    )}
                                                    {originCyclingTime !== null && transportProfile === 'cycling' && (
                                                        <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                                            <Bike size={12} className="text-purple-600 dark:text-purple-400" />
                                                            <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300">{formatDuration(originCyclingTime)}</span>
                                                        </div>
                                                    )}
                                                    {originTravelTime === null && originWalkingTime === null && origin && !isFetchingOriginRoute && (
                                                        <span className="text-[10px] text-slate-400">No route found</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                                </div>
                                <div className="shrink-0">
                                    <WeatherWidget 
                                        weather={weather} 
                                        isLoading={isWeatherLoading} 
                                        onRefresh={refetchWeather} 
                                        isFullscreen={isFullscreen}
                                    />
                                </div>
                            </div>

                            {/* ── Layers button ── */}
                            {!showDetailsPanel && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowDetailsPanel(true);
                                    }}
                                    className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 transition-all active:scale-95 cursor-pointer flex items-center gap-2 group self-start
                                        ${isFullscreen ? 'px-3 py-2' : 'px-2.5 py-1.5'}
                                    `}
                                >
                                    <Layers className={`${isFullscreen ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors`} />
                                    <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
                                    <span className={`${isFullscreen ? 'text-xs font-bold' : 'text-[10px] font-semibold'} text-slate-700 dark:text-slate-300`}>Layers</span>
                                    <svg className={`${isFullscreen ? 'w-3 h-3' : 'w-2.5 h-2.5'} text-slate-400 group-hover:text-slate-600 transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* POI info card */}
                        {displayInfo && !showDirections && (
                            <div className="absolute top-20 left-4 sm:top-24 sm:left-6 z-10 w-[140px] sm:w-[180px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-left-4 duration-300">
                                <div className="p-2 sm:p-3 relative">
                                    <button
                                        onClick={() => { setActivePoiId(null); setSelectedNativePoi(null); }}
                                        className="absolute top-1 right-1 sm:top-2 sm:right-2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    >
                                        <X size={14} className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="pr-4 mt-1 space-y-1">
                                        <h3 className="font-bold text-slate-900 dark:text-white text-[10px] sm:text-xs leading-tight">{displayInfo.name}</h3>
                                        <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{displayInfo.address}</p>

                                        {displayInfo.distance > 0 && (
                                            <div className="flex items-center gap-1 pt-1">
                                                <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                                    <Navigation size={10} className="w-2.5 h-2.5 text-slate-600 dark:text-slate-400" />
                                                </div>
                                                <span className="text-[9px] sm:text-[10px] font-medium text-slate-600 dark:text-slate-400">
                                                    {displayInfo.distance.toFixed(2)} km away
                                                </span>
                                            </div>
                                        )}

                                        {/* Travel times from hotel to POI */}
                                        {(poiTravelTime !== null || poiWalkingTime !== null) && (
                                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                {poiTravelTime !== null && (
                                                    <div className="flex items-center gap-1">
                                                        <Car size={10} className="text-blue-600 dark:text-blue-400" />
                                                        <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700 dark:text-slate-300">{formatDuration(poiTravelTime)}</span>
                                                    </div>
                                                )}
                                                {poiWalkingTime !== null && (
                                                    <div className="flex items-center gap-1">
                                                        <Footprints size={10} className="text-emerald-600 dark:text-emerald-400" />
                                                        <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700 dark:text-slate-300">{formatDuration(poiWalkingTime)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="pt-2">
                                            <a
                                                href={`${GOOGLE_MAPS_SEARCH_URL}&query=${encodeURIComponent(displayInfo.name)}&query_place_id=${displayInfo.coordinates?.lat},${displayInfo.coordinates?.lng}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[9px] sm:text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                                            >
                                                View on Google Maps <ChevronRight size={8} />
                                            </a>

                                            {displayInfo.name !== name && (
                                                <button
                                                    onClick={() => {
                                                        const poiToOpen = selectedNativePoi || {
                                                            name: displayInfo.name,
                                                            coordinates: displayInfo.coordinates,
                                                            category: displayInfo.address
                                                        };
                                                        setModalPoi(poiToOpen);
                                                    }}
                                                    className="mt-1 w-full py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[9px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1"
                                                >
                                                    Show Details <Star size={8} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute -left-1.5 top-6 w-3 h-3 bg-white dark:bg-slate-900 border-l border-t border-slate-200 dark:border-slate-700 transform -rotate-45 -z-10 hidden sm:block" />
                            </div>
                        )}
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

        const poiDiscoveryContent = (
            <div className={`transition-all duration-500 ease-in-out group/nearby flex flex-col gap-1 sm:gap-1.5
                ${isFullscreen
                    ? 'absolute bottom-4 left-1/2 -translate-x-1/2 w-[98%] sm:w-[94%] z-30 px-2'
                    : 'relative lg:absolute lg:bottom-2 lg:left-1/2 lg:-translate-x-1/2 lg:w-[96%] lg:z-30 w-full mt-3 lg:mt-0'
                }
            `}>
                {/* Category Filter Dropdown & Controls */}
                <div className="flex items-center justify-between gap-2 w-full px-1 sm:px-2 pb-1 lg:px-0">
                    <div className="relative">
                        <button
                            onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-slate-700 text-slate-700 dark:text-white shadow-lg hover:border-blue-400 transition-all active:scale-95 group"
                        >
                            {React.createElement(POI_FILTERS.find(f => f.id === selectedCategory)?.icon || Search, { size: 14, className: 'text-blue-500' })}
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                                {POI_FILTERS.find(f => f.id === selectedCategory)?.label || 'Discovery'}
                            </span>
                            <ChevronRight size={14} className={`text-slate-400 transition-transform duration-300 ${isCategoryDropdownOpen ? '-rotate-90' : 'rotate-90'}`} />
                        </button>

                        {/* Dropdown Card (Opens Upwards) */}
                        {isCategoryDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsCategoryDropdownOpen(false)} />
                                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div className="p-1.5 space-y-0.5">
                                        <div className="px-3 py-1.5 mb-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Select Mode</div>
                                        {POI_FILTERS.map(filter => {
                                            const isSelected = selectedCategory === filter.id;
                                            const Icon = filter.icon;
                                            return (
                                                <button
                                                    key={filter.id}
                                                    onClick={() => {
                                                        setSelectedCategory(filter.id);
                                                        setIsCategoryDropdownOpen(false);
                                                    }}
                                                    className={`flex items-center justify-between w-full px-3 py-2 rounded-xl transition-all duration-200 group/item
                                                        ${isSelected 
                                                            ? 'bg-blue-600 text-white shadow-md' 
                                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                        }
                                                    `}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <Icon size={14} className={isSelected ? 'text-white' : 'text-slate-400 group-hover/item:text-blue-500'} />
                                                        <span className="text-[11px] font-bold uppercase tracking-normal">{filter.label}</span>
                                                    </div>
                                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Integrated Map Controls */}
                    <div className={`items-center gap-1.5 shrink-0 ${isFullscreen ? 'flex' : 'hidden lg:flex'}`}>
                        <button
                            onClick={() => setIsFullscreen(f => !f)}
                            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 p-1.5 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center"
                            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        >
                            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                        </button>
                        <button
                            onClick={handleRecenter}
                            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-blue-600 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 p-1.5 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center"
                            title="Recenter Map"
                        >
                            <Navigation size={14} fill="currentColor" />
                        </button>
                    </div>
                </div>

                <div className="relative flex flex-row w-full group/imagebar">
                    {/* Previous Button (PC only) */}
                    {nearbyGems.length > 0 && (
                        <button
                            onClick={() => scrollGems('left')}
                            className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-40 w-8 h-8 items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    )}

                    <div
                        ref={gemsScrollRef}
                        className="flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth px-0.5 py-0.5 w-full flex-row"
                    >
                        {(isFetchingGems ? Array(12).fill(0) : nearbyGems.filter(poi => poi.properties?.isStub || (poi.properties?.rating && poi.properties?.rating >= 3))).map((poi, idx) => {
                            if (isFetchingGems) {
                                return <div key={idx} className="flex-shrink-0 w-32 h-20 sm:w-40 sm:h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />;
                            }
                            const name = poi.properties?.name || poi.name;
                            const isActive = activePoiId === name;
                            const lng = poi.geometry?.coordinates[0] || poi.coordinates.lng;
                            const lat = poi.geometry?.coordinates[1] || poi.coordinates.lat;
                            const imageUrl = poi.properties?.imageUrl || (poi.imageUrl || getMapboxPoiImage(name, lat, lng));

                            return (
                                <button
                                    key={`${name}-${idx}`}
                                    onClick={() => {
                                        if (isActive) {
                                            setActivePoiId(null);
                                            setSelectedNativePoi(null);
                                        } else {
                                            setSelectedNativePoi(poi);
                                            setActivePoiId(name);
                                            setModalPoi(poi);
                                            mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, pitch: 45, duration: 800 });
                                        }
                                    }}
                                    className={`group relative flex-shrink-0 transition-all duration-300 transform hover:scale-[1.03] active:scale-95
                                    w-32 h-20 sm:w-40 sm:h-24
                                    ${isActive ? 'ring-2 ring-blue-500 shadow-xl' : 'shadow-md'}
                                    rounded-xl overflow-hidden
                                `}
                                >
                                    <Image
                                        src={imageUrl}
                                        alt={name}
                                        fill
                                        sizes="(max-width: 640px) 128px, 160px"
                                        className={`object-cover transition-transform duration-500 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
                                    {poi.properties?.rating && (
                                        <div className="absolute top-2 left-2 bg-black/40 backdrop-blur-md rounded-full px-2 py-0.5 flex items-center gap-1 border border-white/20 shadow-sm">
                                            <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                            <span className="text-[10px] font-bold text-white tracking-tight">{poi.properties.rating}</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 p-3 flex flex-col justify-end items-start text-white text-left">
                                        <div className="flex items-center gap-1 mb-1 opacity-95 drop-shadow-sm">
                                            {React.createElement(poi.properties?.icon || poi.icon, { size: 10, className: 'shrink-0' })}
                                            <span className="text-[9px] font-semibold uppercase tracking-wider truncate">{poi.properties?.category || poi.category}</span>
                                        </div>
                                        <h4 className="text-[10px] sm:text-xs font-bold leading-tight line-clamp-2 drop-shadow-md">{name}</h4>
                                    </div>
                                    {isActive && (
                                        <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full border border-white">
                                            <div className="w-2 h-2 bg-white rounded-full" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {nearbyGems.length > 0 && (
                        <button
                            onClick={() => scrollGems('right')}
                            className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-40 w-8 h-8 items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100"
                        >
                            <ChevronRight size={16} />
                        </button>
                    )}
                </div>
            </div>
        );

        return (
            <div className="flex flex-col relative bg-white dark:bg-slate-900 lg:h-full">
                <div className={`relative overflow-hidden transition-all duration-500 ease-in-out rounded-xl shadow-sm border border-slate-200/60 dark:border-white/10
                    ${isFullscreen ? 'fixed inset-0 z-9999' : 'w-full h-[320px] sm:h-[450px] lg:h-full mb-2 lg:mb-0'}
                `}>
                    {!isFullscreen && (
                        <div className="absolute inset-0">
                            {mapContent}
                        </div>
                    )}
                    {isFullscreen && mounted && createPortal(
                        <div className="fixed inset-0 z-9999 bg-white dark:bg-slate-900">
                            {mapContent}
                            {poiDiscoveryContent}
                        </div>,
                        document.body
                    )}
                </div>
                {!isFullscreen && poiDiscoveryContent}
                <PoiDetailsModal isOpen={!!modalPoi} onClose={() => setModalPoi(null)} poi={modalPoi} />
            </div>
        );
    });

PropertyMapSidebarContent.displayName = 'PropertyMapSidebarContent';

export default PropertyMapSidebarContent;
