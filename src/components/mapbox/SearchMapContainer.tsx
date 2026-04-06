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
import { env } from '@/utils/env';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

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
    const targetCurrency = useUserCurrency();
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

    return (
        <div className="relative h-full w-full">
            <MapContainer
                mapRef={mapRef}
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
                                displayPrice={convertCurrency(property.price, property.currency || 'USD', targetCurrency)}
                                displayCurrency={targetCurrency}
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

            <MapSearchOverlay
                className={searchOverlayClassName ?? 'absolute top-16 left-4 z-20 w-[72%]'}
                onSelect={(r) => mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 15, pitch: 45, bearing: -10, duration: 1200 })}
            />
        </div>
    );
});


