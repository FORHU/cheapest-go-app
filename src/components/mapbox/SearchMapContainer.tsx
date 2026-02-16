import React from 'react';
import { MappableProperty } from './utils/buildGeoJson';
import { useMapboxInstance } from './hooks/useMapboxInstance';
import { useMapMarkers } from './hooks/useMapMarkers';
import { useMapInteractions } from './hooks/useMapInteractions';
import { useMapViewport } from './hooks/useMapViewport';
import { MapContainer } from './components/MapContainer';
import { ClusterLayer } from './components/ClusterLayer';
import { SelectedPropertyPopup } from './components/SelectedPropertyPopup';

interface SearchMapContainerProps {
    properties: MappableProperty[];
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    hoveredId: string | null;
    onHoverId: (id: string | null) => void;
    onViewDetails: (id: string) => void;
}

export const SearchMapContainer = React.memo(({
    properties,
    selectedId,
    onSelectId,
    hoveredId,
    onHoverId,
    onViewDetails,
}: SearchMapContainerProps) => {
    // 1. Map Instance
    const { mapRef, isMapLoaded, handleMapLoad } = useMapboxInstance();

    // 2. Data Preparation
    const { mappableProperties, geoJsonData, shouldCluster } = useMapMarkers(properties);

    // 3. Interactions
    const { handleMapClick, onMouseEnter, onMouseLeave } = useMapInteractions({
        mapRef,
        onSelectId,
    });

    // 4. Viewport Management
    useMapViewport({
        mapRef,
        isMapLoaded,
        properties: mappableProperties,
        selectedId,
    });

    // 5. Derived State
    const selectedProperty = mappableProperties.find(p => p.id === selectedId) || null;

    return (
        <MapContainer
            mapRef={mapRef}
            initialViewState={{
                longitude: 120.596, // Default fallback
                latitude: 14.599,
                zoom: 14
            }}
            onLoad={handleMapLoad}
            onClick={handleMapClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            interactiveLayerIds={isMapLoaded ? ['clusters', 'unclustered-point', 'unclustered-point-text'] : undefined}
        >
            {isMapLoaded && (
                <ClusterLayer
                    geoJsonData={geoJsonData}
                    shouldCluster={shouldCluster}
                    selectedId={selectedId}
                />
            )}

            <SelectedPropertyPopup
                selectedProperty={selectedProperty}
                onClose={() => onSelectId(null)}
                onViewDetails={onViewDetails}
                onSelect={(id) => onSelectId(id)}
            />
        </MapContainer>
    );
});
