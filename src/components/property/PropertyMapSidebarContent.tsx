'use client';

import React, { useRef, useCallback, useState } from 'react';
import { MapPin, Navigation, Car, X, ChevronRight, GraduationCap, Trees, Utensils, Building2, Landmark, Coffee, Library, Pill, ShoppingBasket, Banknote, Church, Bus, Footprints } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { Marker, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { env } from '@/utils/env';

const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1';

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

const PropertyMapSidebar: React.FC<PropertyMapSidebarProps> = ({
    hotelDetails,
    coordinates,
    propertyName,
}) => {
    const mapRef = useRef<MapRef>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [activePoiId, setActivePoiId] = useState<string | null>(null);
    const [selectedNativePoi, setSelectedNativePoi] = useState<any>(null);
    const [routeGeometry, setRouteGeometry] = useState<any>(null);
    const [travelTime, setTravelTime] = useState<number | null>(null);
    const [walkingTime, setWalkingTime] = useState<number | null>(null);

    // Initial hydration fix
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const name = propertyName || hotelDetails?.name || 'Premium Stay';
    const addressLine = hotelDetails?.address || 'Address not available';
    const hotelImage = hotelDetails?.image || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80';
    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Radius of the earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // Category and Icon mapping for native Mapbox POIs
    const getPoiDetails = useCallback((feature: any) => {
        const { properties } = feature;
        const category = properties?.class || properties?.type || properties?.category || 'attraction';
        const name = properties?.name || properties?.name_en || 'Point of Interest';

        // Icon mapping
        const iconMap: Record<string, any> = {
            restaurant: Utensils, cafe: Coffee, food: Utensils, bar: Utensils,
            park: Trees, garden: Trees, park_like: Trees,
            school: GraduationCap, university: Building2, college: GraduationCap,
            pharmacy: Pill, medical: Pill, hospital: Pill,
            bank: Banknote, atm: Banknote,
            shop: ShoppingBasket, mall: ShoppingBasket, supermarket: ShoppingBasket,
            church: Church, religion: Church, place_of_worship: Church,
            museum: Library, landmark: Landmark, monument: Landmark, attraction: Landmark,
            bus: Bus, rail: Bus, station: Bus
        };

        const matchedClass = Object.keys(iconMap).find(key => category.toLowerCase().includes(key)) || 'attraction';

        return {
            name,
            icon: iconMap[matchedClass] || Landmark,
            category: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' '),
            coordinates: {
                lng: feature.geometry.coordinates[0],
                lat: feature.geometry.coordinates[1]
            }
        };
    }, []);

    // Unified display logic for the preview card
    const displayInfo = activePoiId === 'hotel' ? {
        name: name,
        address: addressLine,
        distance: 0,
        coordinates: coordinates
    } : selectedNativePoi ? {
        name: selectedNativePoi.name,
        address: selectedNativePoi.category, // Using category as fallback if address not found
        distance: coordinates ? getDistance(coordinates.lat, coordinates.lng, selectedNativePoi.coordinates.lat, selectedNativePoi.coordinates.lng) : 0,
        coordinates: selectedNativePoi.coordinates
    } : null;

    // Fetch real-road GPS route whenever a POI is selected
    React.useEffect(() => {
        if (!selectedNativePoi || !coordinates) {
            setRouteGeometry(null);
            setTravelTime(null);
            setWalkingTime(null);
            return;
        }

        const fetchRoute = async () => {
            // Reset states before fetching new route
            setRouteGeometry(null);
            setTravelTime(null);
            setWalkingTime(null);

            try {
                // Fetch Driving Route with full geometry overview
                const drivingQuery = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates.lng},${coordinates.lat};${selectedNativePoi.coordinates.lng},${selectedNativePoi.coordinates.lat}?geometries=geojson&overview=full&steps=true&access_token=${env.MAPBOX_TOKEN}`
                );
                const drivingJson = await drivingQuery.json();

                if (drivingJson.code !== 'Ok' || !drivingJson.routes?.[0]) {
                    console.warn('Mapbox Driving Directions not found or error:', drivingJson.code);
                    return;
                }

                const drivingData = drivingJson.routes[0];
                setRouteGeometry(drivingData.geometry);
                setTravelTime(Math.round(drivingData.duration / 60));

                // Fetch Walking Route (for time estimation only)
                const walkingQuery = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates.lng},${coordinates.lat};${selectedNativePoi.coordinates.lng},${selectedNativePoi.coordinates.lat}?overview=full&steps=true&access_token=${env.MAPBOX_TOKEN}`
                );
                const walkingJson = await walkingQuery.json();

                if (walkingJson.code === 'Ok' && walkingJson.routes?.[0]) {
                    const walkingData = walkingJson.routes[0];
                    setWalkingTime(Math.round(walkingData.duration / 60));
                }
            } catch (err) {
                console.error('Mapbox Directions error:', err);
            }
        };

        fetchRoute();
    }, [selectedNativePoi, coordinates]);

    const onMapClick = useCallback((event: any) => {
        if (!mapRef.current) return;
        const map = mapRef.current.getMap();

        // Query all rendered features at the click point
        const features = map.queryRenderedFeatures(event.point);

        // Find any named feature that looks like a POI
        // Skip roads, buildings, land, water - they are not POIs
        const skipPatterns = ['road', 'building', 'land', 'water', 'boundary', 'admin', 'tunnel', 'bridge', 'path', 'street'];

        const poiFeature = features.find((f: any) => {
            const layerId = (f.layer?.id || '').toLowerCase();
            const sourceName = (f.source || '').toLowerCase();
            const hasName = f.properties?.name || f.properties?.name_en;

            // Skip non-POI layers
            if (skipPatterns.some(p => layerId.includes(p) || sourceName.includes(p))) return false;

            return !!hasName;
        });

        if (poiFeature) {
            // Extract coordinates - try geometry first, fall back to click location
            const geom = poiFeature.geometry as any;
            const coords = geom?.coordinates
                ? { lng: geom.coordinates[0], lat: geom.coordinates[1] }
                : { lng: event.lngLat.lng, lat: event.lngLat.lat };

            const details = getPoiDetails({
                ...poiFeature,
                geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] }
            });
            setSelectedNativePoi(details);
            setActivePoiId(details.name);
        } else {
            // Clear selection if clicking empty space (not the hotel marker)
            if (activePoiId !== 'hotel') {
                setActivePoiId(null);
                setSelectedNativePoi(null);
            }
        }
    }, [activePoiId, getPoiDetails]);

    const handleRecenter = useCallback(() => {
        if (!hasCoordinates) return;
        mapRef.current?.flyTo({
            center: [coordinates.lng, coordinates.lat],
            zoom: 16,
            pitch: 45,
            duration: 800,
        });
    }, [hasCoordinates, coordinates]);

    const handleLoad = useCallback(() => {
        setIsLoaded(true);
    }, []);

    // Scale POI Icons for better visibility
    React.useEffect(() => {
        if (!isLoaded || !mapRef.current) return;
        const map = mapRef.current.getMap();

        try {
            const layers = map.getStyle()?.layers;
            if (layers) {
                layers.forEach(layer => {
                    // Target POIs, landmarks, and transit labels
                    if (layer.type === 'symbol' &&
                        (layer.id.includes('poi') ||
                            layer.id.includes('landmark') ||
                            layer.id.includes('point-of-interest') ||
                            layer.id.includes('transit'))) {
                        map.setLayoutProperty(layer.id, 'icon-size', 3.0);
                        // Also make the text labels very large for accessibility
                        map.setLayoutProperty(layer.id, 'text-size', 18);
                    }
                });
            }
        } catch (err) {
            console.warn('Could not scale POI icons:', err);
        }
    }, [isLoaded]);

    // midpoint for travel time label
    const midpoint = selectedNativePoi && routeGeometry ? {
        lat: routeGeometry.coordinates[Math.floor(routeGeometry.coordinates.length / 2)][1],
        lng: routeGeometry.coordinates[Math.floor(routeGeometry.coordinates.length / 2)][0]
    } : null;

    const onMouseMove = useCallback((event: any) => {
        if (!mapRef.current) return;
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
    }, []);

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
        <div className="h-full w-full flex flex-col rounded-xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-white/10 relative">
            <div className="flex-1 relative w-full h-full">
                {hasCoordinates ? (
                    <>
                        <Map
                            ref={mapRef}
                            mapStyle="standard"
                            standardConfig={{
                                lightPreset: 'day',
                                show3dObjects: true,
                                show3dBuildings: true,
                            }}
                            initialViewState={{
                                longitude: coordinates.lng,
                                latitude: coordinates.lat,
                                zoom: 16,
                                pitch: 45,
                                bearing: 0,
                            }}
                            onLoad={handleLoad}
                            onClick={onMapClick}
                            onMouseMove={onMouseMove}
                            maxPitch={60}
                            className="!min-h-0 !rounded-none h-full"
                        >
                            <NavigationControl position="top-right" showCompass={false} />
                            <GeolocateControl position="top-right" trackUserLocation showUserHeading />

                            {isLoaded && (
                                <>
                                    {routeGeometry && (
                                        <Source id="route-source" type="geojson" data={{
                                            type: 'Feature',
                                            properties: {},
                                            geometry: routeGeometry
                                        }}>
                                            <Layer
                                                id="route-layer"
                                                type="line"
                                                layout={{
                                                    'line-cap': 'round',
                                                    'line-join': 'round'
                                                }}
                                                paint={{
                                                    'line-color': '#3b82f6', // GPS Blue
                                                    'line-width': 6,
                                                    'line-opacity': 0.8
                                                }}
                                            />
                                        </Source>
                                    )}

                                    {midpoint && (travelTime !== null || walkingTime !== null) && (
                                        <Marker
                                            latitude={midpoint.lat}
                                            longitude={midpoint.lng}
                                            anchor="center"
                                        >
                                            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden min-w-[70px]">
                                                {travelTime !== null && (
                                                    <div className="px-2.5 py-1.5 flex items-center justify-center gap-2">
                                                        <Car size={14} className="text-blue-600 dark:text-blue-400" />
                                                        <span className="text-[11px] font-bold text-slate-900 dark:text-white">{travelTime} min</span>
                                                    </div>
                                                )}
                                                {walkingTime !== null && (
                                                    <div className="px-2.5 py-1.5 flex items-center justify-center gap-2 bg-slate-50/50 dark:bg-slate-800/50">
                                                        <Footprints size={14} className="text-emerald-600 dark:text-emerald-400" />
                                                        <span className="text-[11px] font-bold text-slate-900 dark:text-white">{walkingTime} min</span>
                                                    </div>
                                                )}
                                            </div>
                                        </Marker>
                                    )}

                                    {/* Hotel Pin - Precision SVG Teardrop */}
                                    <Marker
                                        latitude={coordinates.lat}
                                        longitude={coordinates.lng}
                                        anchor="bottom"
                                        onClick={(e) => {
                                            e.originalEvent.stopPropagation();
                                            setActivePoiId(activePoiId === 'hotel' ? null : 'hotel');
                                        }}
                                    >
                                        <div className="flex flex-col items-center cursor-pointer group">
                                            {/* SVG Teardrop Pin */}
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

                                            {/* Minimal Label */}
                                            <div className="px-2 py-0.5 bg-white/95 dark:bg-slate-800 rounded shadow-md border border-slate-200 dark:border-slate-700">
                                                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                    {name}
                                                </span>
                                            </div>
                                        </div>
                                    </Marker>
                                </>
                            )}
                        </Map>

                        {/* Redesigned Compact Info Card Overlay */}
                        {displayInfo && (
                            <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 w-[170px] sm:w-[260px] bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-left-4 duration-300">
                                <div className="p-1.5 sm:p-4 relative">
                                    <button
                                        onClick={() => { setActivePoiId(null); setSelectedNativePoi(null); }}
                                        className="absolute top-0.5 right-0.5 sm:top-3 sm:right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    >
                                        <X size={16} className="w-3 h-3 sm:w-4 sm:h-4" />
                                    </button>

                                    <div className="pr-4 sm:pr-6 space-y-0.5 sm:space-y-1.5">
                                        <h3 className="font-bold text-slate-900 dark:text-white text-[11px] sm:text-sm leading-tight">
                                            {displayInfo.name}
                                        </h3>

                                        <div className="space-y-0.5 sm:space-y-1">
                                            <p className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                                                {displayInfo.address}
                                            </p>
                                        </div>

                                        {displayInfo.distance > 0 && (
                                            <div className="flex items-center gap-1 sm:gap-1.5 pt-0.5 sm:pt-1">
                                                <div className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                                    <Navigation size={10} className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-slate-600 dark:text-slate-400 fill-current" />
                                                </div>
                                                <span className="text-[8px] sm:text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                                    {displayInfo.distance.toFixed(2)} km from property
                                                </span>
                                            </div>
                                        )}

                                        <div className="pt-1 sm:pt-2">
                                            <a
                                                href={`${GOOGLE_MAPS_SEARCH_URL}&query=${encodeURIComponent(displayInfo.name)}&query_place_id=${displayInfo.coordinates.lat},${displayInfo.coordinates.lng}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[8px] sm:text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                                            >
                                                View on Google Maps
                                            </a>
                                        </div>
                                    </div>
                                </div>
                                {/* Tooltip Triangle Pointer (Hidden on mobile) */}
                                <div className="absolute -left-2 top-8 w-4 h-4 bg-white dark:bg-slate-900 border-l border-t border-slate-200 dark:border-slate-700 transform rotate-[-45deg] -z-10 hidden sm:block" />
                            </div>
                        )}

                        <button
                            onClick={handleRecenter}
                            className="absolute bottom-5 right-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-700 dark:text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2 group"
                            suppressHydrationWarning
                        >
                            <Navigation size={14} className="group-hover:rotate-12 transition-transform" />
                            Re-center
                        </button>
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
        </div>
    );
};

export default PropertyMapSidebar;
