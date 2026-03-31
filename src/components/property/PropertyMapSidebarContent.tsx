'use client';

import React, { useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, Car, X, GraduationCap, Trees, Utensils, Building2, Landmark, Coffee, Library, Pill, ShoppingBasket, Banknote, Church, Bus, Footprints, Search, Maximize, Minimize } from 'lucide-react';
import { Map } from '@/components/ui/map';
import { Marker, NavigationControl, Source, Layer } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { useMapboxDirections } from '../mapbox/hooks/useMapboxDirections';
import { useMapboxSearch } from '../mapbox/hooks/useMapboxSearch';

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

const PropertyMapSidebarContent: React.FC<PropertyMapSidebarProps> = ({
    hotelDetails,
    coordinates,
    propertyName,
}) => {
    const mapRef = useRef<MapRef>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    
    const [isFullscreen, setIsFullscreen] = useState(false);

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
    } = useMapboxSearch({ proximity: hasCoordinates ? coordinates : undefined });

    const clearDirections = useCallback(() => {
        setShowDirections(false);
        clearSearch();
    }, [clearSearch]);

    // ROUTE 1: Hotel to selected nearby POI (no traffic)
    const {
        routeGeometry: poiRouteGeometry,
        travelTime: poiTravelTime,
        walkingTime: poiWalkingTime
    } = useMapboxDirections({
        origin: hasCoordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
        destination: selectedNativePoi ? { lat: selectedNativePoi.coordinates.lat, lng: selectedNativePoi.coordinates.lng } : null,
        enabled: !!selectedNativePoi && hasCoordinates && !showDirections,
        drivingProfile: 'driving'
    });

    // ROUTE 2: User Origin to Hotel (with traffic)
    const {
        routeGeometry: originRouteGeometry,
        travelTime: originTravelTime,
        walkingTime: originWalkingTime,
        isFetchingRoute: isFetchingOriginRoute
    } = useMapboxDirections({
        origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
        destination: hasCoordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
        enabled: showDirections && !!origin && hasCoordinates
    });

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
        // Hide streets-v12 POI icon layers (the large coloured circles)
        const map = mapRef.current?.getMap();
        if (map) {
            ['poi-label', 'transit-label'].forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', 'none');
                }
            });
        }
    }, []);

    // Scale POI icons for better visibility
    React.useEffect(() => {
        if (!isLoaded || !mapRef.current) return;
        const map = mapRef.current.getMap();
        try {
            const layers = map.getStyle()?.layers;
            if (layers) {
                layers.forEach(layer => {
                    if (layer.type === 'symbol' && (
                        layer.id.includes('poi') ||
                        layer.id.includes('landmark') ||
                        layer.id.includes('point-of-interest') ||
                        layer.id.includes('transit')
                    )) {
                        map.setLayoutProperty(layer.id, 'icon-size', 3.0);
                        map.setLayoutProperty(layer.id, 'text-size', 18);
                    }
                });
            }
        } catch (err) {
            console.warn('Could not scale POI icons:', err);
        }
    }, [isLoaded]);

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
                            mapStyle="mapbox://styles/mapbox/streets-v12"
                            initialViewState={{ longitude: coordinates.lng, latitude: coordinates.lat, zoom: 16, pitch: 45, bearing: 0 }}
                            onLoad={handleLoad}
                            onClick={onMapClick}
                            onMouseMove={onMouseMove}
                            maxPitch={60}
                            className="!min-h-0 !rounded-none h-full"
                        >
                            <NavigationControl position="top-right" showCompass={false} />

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
                                            <div className="flex flex-col items-center cursor-move group">
                                                <div className="w-8 h-8 bg-emerald-500 border-[3px] border-white rounded-full shadow-lg flex items-center justify-center transform transition-transform group-hover:scale-110">
                                                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                                                </div>
                                                <div className="w-3 h-1 bg-black/20 rounded-full blur-[1px] mt-0.5" />
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
                                                <div className="bg-pink-600 text-white p-2.5 rounded-2xl shadow-xl border-2 border-white transform transition-transform hover:scale-110">
                                                    <div className="bg-white/20 p-1.5 rounded-lg">
                                                        <div className="w-4 h-4 bg-white rounded-sm flex items-center justify-center">
                                                            <div className="w-2 h-2 bg-pink-600 rounded-full" />
                                                        </div>
                                                    </div>
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

                        {/* Directions panel Overlay */}
                        <div className="absolute top-1.5 left-1.5 right-11 z-20 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[340px]">
                            {!showDirections ? (
                                <button
                                    onClick={() => {
                                        setShowDirections(true);
                                        setActivePoiId(null);
                                        setSelectedNativePoi(null);
                                    }}
                                    className="w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-md shadow px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                                >
                                    <Navigation size={10} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                    Get directions...
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
                                                    {originTravelTime !== null && (
                                                        <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                                            <Car size={9} className="text-blue-600 dark:text-blue-400" />
                                                            <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300">{formatDuration(originTravelTime)} </span>
                                                        </div>
                                                    )}
                                                    {originWalkingTime !== null && (
                                                        <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                                            <Footprints size={9} className="text-emerald-600 dark:text-emerald-400" />
                                                            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">{formatDuration(originWalkingTime)}</span>
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

                        <div className="absolute right-3 bottom-5 flex flex-col gap-2 items-end">
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
        <>
            <div className="h-full w-full rounded-xl overflow-hidden relative shadow-sm border border-slate-200/60 dark:border-white/10">
                {!isFullscreen && mapContent}
            </div>
            {isFullscreen && mounted && createPortal(
                <div className="fixed inset-0 z-9999 bg-white dark:bg-slate-900">
                    {mapContent}
                </div>,
                document.body
            )}
        </>
    );
};

export default PropertyMapSidebarContent;
