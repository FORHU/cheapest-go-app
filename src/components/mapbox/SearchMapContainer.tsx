'use client';

import React from 'react';
import { MappableProperty } from './utils/buildGeoJson';
import { useMapboxInstance } from './hooks/useMapboxInstance';
import { useMapMarkers } from './hooks/useMapMarkers';
import { useMapInteractions, PoiData } from './hooks/useMapInteractions';
import { useMapViewport } from './hooks/useMapViewport';
import { MapContainer } from './components/MapContainer';
import { ClusterLayer } from './components/ClusterLayer';
import { SelectedPropertyPopup } from './components/SelectedPropertyPopup';
import { Source, Layer, Marker } from 'react-map-gl/mapbox';

import { PoiPopup } from './components/PoiPopup';
import { MapMarker } from '../map/MapMarker';
import { MapSearchOverlay } from './components/MapSearchOverlay';
import { Layers } from 'lucide-react';
import { useMapDetails } from './hooks/useMapDetails';
import { MapDetailsPanel } from './components/MapDetailsPanel';
import { env } from '@/utils/env';

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
    const { mapRef, isMapLoaded, handleMapLoad } = useMapboxInstance();

    // 2. Data Preparation
    const { mappableProperties, geoJsonData, shouldCluster } = useMapMarkers(properties);

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
    const selectedProperty = mappableProperties.find((p: MappableProperty) => p.id === selectedId) || null;
    const hoveredProperty = mappableProperties.find((p: MappableProperty) => p.id === hoveredId) || null;
    
    // Preview logic: prefer hover state for quick feedback, fallback to selected
    const previewProperty = hoveredProperty || selectedProperty;
    const activePoi = hoveredPoi || selectedPoi;



    // Distance calculation helper
    const calculateDistance = (l1: { lat: number; lng: number }, l2: { lat: number; lng: number }) => {
        const R = 6371; // km
        const dLat = (l2.lat - l1.lat) * (Math.PI / 180);
        const dLng = (l2.lng - l1.lng) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(l1.lat * (Math.PI / 180)) * Math.cos(l2.lat * (Math.PI / 180)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(2);
    };

    const poiDistance = previewProperty && activePoi 
        ? calculateDistance(previewProperty.coordinates, activePoi.coordinates)
        : null;

    // POI Route Logic
    // 6. Fetch Real Road GPS Route — only when a POI is *clicked* (selectedPoi)
    React.useEffect(() => {
        if (!previewProperty || !selectedPoi) {
            setRouteGeometry(null);
            setCarDuration(null);
            setWalkDuration(null);
            return;
        }

        const fetchRoute = async () => {
            try {
                // Driving Route — fetch alternatives, pick shortest by distance
                const drivingQuery = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/driving/${previewProperty.coordinates.lng},${previewProperty.coordinates.lat};${selectedPoi.coordinates.lng},${selectedPoi.coordinates.lat}?geometries=geojson&overview=full&steps=true&alternatives=true&access_token=${env.MAPBOX_TOKEN}`
                );
                const drivingJson = await drivingQuery.json();

                if (drivingJson.code === 'Ok' && drivingJson.routes?.length) {
                    // Sort all alternatives by distance (metres), pick the shortest
                    const shortestDriving = drivingJson.routes.reduce((best: any, r: any) =>
                        r.distance < best.distance ? r : best
                    );
                    setRouteGeometry(shortestDriving.geometry);
                    setCarDuration(`${Math.max(1, Math.round(shortestDriving.duration / 60))} min`);
                }

                // Walking Route — fetch alternatives, pick shortest for time estimate
                const walkingQuery = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/walking/${previewProperty.coordinates.lng},${previewProperty.coordinates.lat};${selectedPoi.coordinates.lng},${selectedPoi.coordinates.lat}?overview=full&steps=true&alternatives=true&access_token=${env.MAPBOX_TOKEN}`
                );
                const walkingJson = await walkingQuery.json();

                if (walkingJson.code === 'Ok' && walkingJson.routes?.length) {
                    const shortestWalking = walkingJson.routes.reduce((best: any, r: any) =>
                        r.distance < best.distance ? r : best
                    );
                    setWalkDuration(`${Math.max(1, Math.round(shortestWalking.duration / 60))} min`);
                }
            } catch (err) {
                console.error('Directions error:', err);
            }
        };

        fetchRoute();
    }, [previewProperty, selectedPoi]);

    // POI Route Logic (Real Geometry)
    const poiRouteData: any = routeGeometry ? {
        type: 'Feature',
        properties: {},
        geometry: routeGeometry
    } : null;

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
                onClick={handleMapClick}
                onMouseMove={onMouseMove}
                hideLayersButton={true}
            >
                {isMapLoaded && (
                    <>
                        <ClusterLayer
                            geoJsonData={geoJsonData}
                            shouldCluster={shouldCluster}
                            selectedId={selectedId}
                            hoveredId={hoveredId}
                        />

                        {mappableProperties.map(property => (
                            <MapMarker
                                key={property.id}
                                property={property}
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
                onSelect={(r) => mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 15, pitch: 45, bearing: -10, duration: 1200 })}
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


