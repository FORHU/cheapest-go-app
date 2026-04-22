'use client';

import { useState, useCallback, useMemo } from 'react';
import { type MapTypeId, type MapDetailToggle } from '../components/MapDetailsPanel';

export function useMapDetails() {
    const [mapType, setMapType] = useState<MapTypeId>('default-3d');
    const [showDetailsPanel, setShowDetailsPanel] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [mapDetails, setMapDetails] = useState<MapDetailToggle[]>([
        { id: 'discovery', label: 'Discovery', enabled: true },
        { id: 'transit', label: 'Transit', enabled: false },
        { id: 'traffic', label: 'Traffic', enabled: false },
        { id: 'biking', label: 'Biking', enabled: false },
        { id: 'terrain', label: 'Terrain', enabled: false },
    ]);

    const discoveryEnabled = mapDetails.find((d) => d.id === 'discovery')?.enabled ?? false;
    const terrainEnabled = mapDetails.find((d) => d.id === 'terrain')?.enabled ?? false;
    const trafficEnabled = mapDetails.find((d) => d.id === 'traffic')?.enabled ?? false;
    const transitEnabled = mapDetails.find((d) => d.id === 'transit')?.enabled ?? false;
    const bikingEnabled = mapDetails.find((d) => d.id === 'biking')?.enabled ?? false;

    const mapStyleUrl = useMemo(() => {
        if (mapType === 'satellite') return 'mapbox://styles/mapbox/satellite-v9';
        if (mapType === 'default') return 'mapbox://styles/mapbox/streets-v12';
        return 'standard';
    }, [mapType]);

    const standardConfig = useMemo(() => ({
        lightPreset: 'day' as const,
        show3dObjects: true,
        show3dBuildings: true,
        show3dFacades: false,
        show3dTrees: true,
        show3dLandmarks: false,
        showPointOfInterestLabels: showLabels,
        showRoadLabels: showLabels,
        showTransitLabels: showLabels,
        showPlaceLabels: showLabels,
        showTraffic: trafficEnabled,
        showTransit: transitEnabled,
        language: 'en',
    }), [showLabels, trafficEnabled, transitEnabled]);

    const handleMapTypeChange = useCallback((type: MapTypeId) => {
        setMapType(type);
        if (type !== 'default-3d') {
            setMapDetails((prev) =>
                prev.map((d) => (d.id === 'terrain' ? { ...d, enabled: false } : d))
            );
        }
    }, []);

    const handleDetailToggle = useCallback((id: string) => {
        if (id === 'terrain' && mapType !== 'default-3d') return;
        setMapDetails((prev) =>
            prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
        );
    }, [mapType]);

    return {
        mapType,
        setMapType: handleMapTypeChange,
        showDetailsPanel,
        setShowDetailsPanel,
        showLabels,
        setShowLabels,
        mapDetails,
        handleDetailToggle,
        terrainEnabled,
        discoveryEnabled,
        mapStyleUrl,
        standardConfig,
    };
}
