'use client';

import React, { useRef, useCallback, useState } from 'react';
import { Map, NavigationControl, MapRef } from 'react-map-gl/mapbox';
import { X, Navigation, Plane, MapPin, Loader2, LocateFixed, TrafficCone } from 'lucide-react';
import type { BookingRecord } from '@/services/booking.service';
import { useGpsTracking } from '@/components/mapbox/hooks/useGpsTracking';
import { useHotelGeocoder } from '@/components/mapbox/hooks/useHotelGeocoder';
import { useMapboxDirections } from '@/components/mapbox/hooks/useMapboxDirections';
import { resolveTravelMode } from '@/components/mapbox/hooks/useTravelModeResolver';
import { GpsMarker } from '@/components/mapbox/components/GpsMarker';
import { TripRouteLayer } from '@/components/mapbox/components/TripRouteLayer';
import { TripDestinationPin } from '@/components/mapbox/components/TripDestinationPin';
import { env } from '@/utils/env';
import { Source, Layer } from 'react-map-gl/mapbox';

interface TripMapViewProps {
    booking: BookingRecord;
    onClose: () => void;
}

function formatKm(km: number): string {
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
}

function formatMins(mins: number | null): string {
    if (mins === null) return '—';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const MODE_LABELS = {
    ground:    { icon: Navigation, color: 'text-emerald-600 dark:text-emerald-400', label: 'Navigate' },
    regional:  { icon: MapPin,     color: 'text-amber-600 dark:text-amber-400',     label: 'Too far to drive directly' },
    air:       { icon: Plane,      color: 'text-blue-600 dark:text-blue-400',        label: 'Flying in' },
    resolving: { icon: Loader2,    color: 'text-slate-500 dark:text-slate-400',      label: 'Locating…' },
};

const TRAFFIC_COLORS = [
    ['low',    '#4ade80'],
    ['moderate', '#facc15'],
    ['heavy',  '#f97316'],
    ['severe', '#ef4444'],
] as const;

export default function TripMapView({ booking, onClose }: TripMapViewProps) {
    const mapRef                  = useRef<MapRef | null>(null);
    const [trafficOn, setTrafficOn] = useState(false);

    // 1. GPS
    const { position, isLocating } = useGpsTracking();
    const userCoords = position
        ? { lat: position.latitude, lng: position.longitude }
        : null;

    // 2. Use stored coordinates when available; fall back to geocoding for older bookings
    const storedCoords = (booking.property_lat && booking.property_lng)
        ? { lat: booking.property_lat, lng: booking.property_lng }
        : null;
    const { coords: geocodedCoords, isLoading: isGeocoding } = useHotelGeocoder(
        storedCoords ? null : booking.property_name
    );
    const hotelCoords = storedCoords ?? geocodedCoords;

    // 3. Travel mode
    const { mode, distanceKm } = resolveTravelMode(userCoords, hotelCoords);

    // 4. Route (only in ground mode)
    const { routeGeometry, travelTime, walkingTime, isFetchingRoute } = useMapboxDirections({
        origin:      userCoords,
        destination: hotelCoords,
        enabled:     mode === 'ground',
        profile:     'driving-traffic',
    });

    // 5. Initial view state — center on hotel if available, else user
    const initialViewState = hotelCoords
        ? { longitude: hotelCoords.lng, latitude: hotelCoords.lat, zoom: mode === 'ground' ? 13 : 11, pitch: 50, bearing: -10 }
        : { longitude: 121.0, latitude: 14.6, zoom: 10, pitch: 0, bearing: 0 };

    // Re-center on hotel
    const flyToHotel = useCallback(() => {
        if (!hotelCoords || !mapRef.current) return;
        mapRef.current.flyTo({
            center: [hotelCoords.lng, hotelCoords.lat],
            zoom: mode === 'ground' ? 14 : 11,
            pitch: 50,
            bearing: -10,
            duration: 1400,
        });
    }, [hotelCoords, mode]);

    // Open Google Maps navigation
    const openGoogleMaps = useCallback(() => {
        if (!hotelCoords) return;
        const url = `https://www.google.com/maps/dir/?api=1&destination=${hotelCoords.lat},${hotelCoords.lng}&travelmode=driving`;
        window.open(url, '_blank');
    }, [hotelCoords]);

    const isLoading = isLocating || isGeocoding;
    const ModeIcon  = MODE_LABELS[mode].icon;

    return (
        <div className="w-full rounded-2xl overflow-hidden shadow-xl flex flex-col bg-white dark:bg-slate-900 mt-3" style={{ height: '520px' }}>

            {/* ── Header ── */}
            <div className="relative z-10 flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </button>

                <div className="flex-1 min-w-0">
                    <p className="text-slate-900 dark:text-white font-semibold text-sm leading-tight truncate">
                        {booking.property_name}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                        {booking.check_in
                            ? new Date(booking.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : ''
                        }
                        {booking.check_out ? ` → ${new Date(booking.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                </div>

                {/* Mode badge */}
                <div className={`flex items-center gap-1.5 text-xs font-medium ${MODE_LABELS[mode].color}`}>
                    <ModeIcon className={`w-3.5 h-3.5 ${mode === 'resolving' ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{MODE_LABELS[mode].label}</span>
                </div>
            </div>

            {/* ── Map ── */}
            <div className="flex-1 relative">
                {isLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-sm">{isGeocoding ? 'Finding hotel…' : 'Getting your location…'}</span>
                        </div>
                    </div>
                )}

                <div className="w-full h-full">
                <Map
                    ref={mapRef}
                    mapboxAccessToken={env.MAPBOX_TOKEN}
                    mapStyle="mapbox://styles/mapbox/outdoors-v12"
                    initialViewState={initialViewState}
                    maxPitch={85}
                    terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
                    attributionControl={false}
                >
                    <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
                    <Layer id="sky" type="sky" paint={{ 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 90.0], 'sky-atmosphere-sun-intensity': 15 }} />
                    <NavigationControl position="bottom-right" showCompass visualizePitch />

                    {/* Traffic layer */}
                    {trafficOn && (
                        <Source
                            id="traffic"
                            type="vector"
                            url="mapbox://mapbox.mapbox-traffic-v1"
                        >
                            {TRAFFIC_COLORS.map(([level, color]) => (
                                <Layer
                                    key={level}
                                    id={`traffic-${level}`}
                                    type="line"
                                    source-layer="traffic"
                                    filter={['==', 'congestion', level]}
                                    paint={{ 'line-color': color, 'line-width': 3, 'line-opacity': 0.85 }}
                                    layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                                />
                            ))}
                        </Source>
                    )}

                    {/* Route — ground mode only */}
                    {mode === 'ground' && <TripRouteLayer routeGeometry={routeGeometry} />}

                    {/* Hotel pin */}
                    {hotelCoords && (
                        <TripDestinationPin
                            lat={hotelCoords.lat}
                            lng={hotelCoords.lng}
                            label={booking.property_name}
                        />
                    )}

                    {/* User GPS */}
                    {position && <GpsMarker position={position} />}
                </Map>
                </div>

                {/* ── Map controls (top-right) ── */}
                <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
                    <button
                        onClick={flyToHotel}
                        disabled={!hotelCoords}
                        className="p-2 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-all shadow-lg"
                        title="Center on hotel"
                    >
                        <LocateFixed className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setTrafficOn((v) => !v)}
                        className={`p-2 rounded-xl backdrop-blur-md border transition-all shadow-lg ${
                            trafficOn
                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400'
                                : 'bg-white/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                        title="Toggle traffic"
                    >
                        <TrafficCone className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Bottom HUD ── */}
            <div className="relative z-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-4">

                {/* Ground mode — show travel times + navigate button */}
                {mode === 'ground' && (
                    <div className="flex items-center gap-4">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mb-0.5">Driving</p>
                                <p className="text-slate-900 dark:text-white font-bold text-lg leading-tight">
                                    {isFetchingRoute ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : formatMins(travelTime)}
                                </p>
                                {distanceKm !== null && (
                                    <p className="text-slate-500 dark:text-slate-400 text-xs">{formatKm(distanceKm)}</p>
                                )}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mb-0.5">Walking</p>
                                <p className="text-slate-900 dark:text-white font-bold text-lg leading-tight">
                                    {isFetchingRoute ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : formatMins(walkingTime)}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={openGoogleMaps}
                            disabled={!hotelCoords}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm px-5 py-3 rounded-xl transition-colors shadow-md"
                        >
                            <Navigation className="w-4 h-4" />
                            Navigate
                        </button>
                    </div>
                )}

                {/* Regional mode */}
                {mode === 'regional' && (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                            <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-slate-900 dark:text-white font-semibold text-sm">
                                {distanceKm !== null ? `${formatKm(distanceKm)} away` : 'Calculating distance…'}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 text-xs">Navigation starts when you're within 50 km</p>
                        </div>
                        <button
                            onClick={openGoogleMaps}
                            disabled={!hotelCoords}
                            className="text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
                        >
                            Open in Maps
                        </button>
                    </div>
                )}

                {/* Air mode */}
                {mode === 'air' && (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                            <Plane className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-slate-900 dark:text-white font-semibold text-sm">Flying in</p>
                            <p className="text-slate-500 dark:text-slate-400 text-xs">
                                {distanceKm !== null ? `${formatKm(distanceKm)} away · ` : ''}
                                Navigation ready when you land nearby
                            </p>
                        </div>
                        <button
                            onClick={openGoogleMaps}
                            disabled={!hotelCoords}
                            className="text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
                        >
                            Save in Maps
                        </button>
                    </div>
                )}

                {/* Resolving */}
                {mode === 'resolving' && (
                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Determining your location…</span>
                    </div>
                )}
            </div>
        </div>
    );
}
