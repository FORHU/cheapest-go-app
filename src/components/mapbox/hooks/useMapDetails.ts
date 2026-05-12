'use client';

import { useState, useCallback, useMemo } from 'react';
import { type MapTypeId, type MapDetailToggle } from '../components/MapDetailsPanel';

export function useMapDetails() {
    const [mapType, setMapType] = useState<MapTypeId>('default-3d');
    const [showDetailsPanel, setShowDetailsPanel] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [mapDetails, setMapDetails] = useState<MapDetailToggle[]>([
        { id: 'explore',  label: 'Explore',   enabled: true },
        { id: 'transit',  label: 'Transit',   enabled: false },
        { id: 'traffic',  label: 'Traffic',   enabled: false },
        { id: 'biking',   label: 'Biking',    enabled: false },
        { id: 'terrain',  label: 'Terrain',   enabled: false },
    ]);

    // Derive feature flags from the toggle list once; avoids repeated .find() calls per render
    const { exploreEnabled, terrainEnabled, trafficEnabled, transitEnabled, bikingEnabled } = useMemo(() => {
        const flag = (id: string) => mapDetails.find((d) => d.id === id)?.enabled ?? false;
        return {
            exploreEnabled: flag('explore'),
            terrainEnabled:  flag('terrain'),
            trafficEnabled:  flag('traffic'),
            transitEnabled:  flag('transit'),
            bikingEnabled:   flag('biking'),
        };
    }, [mapDetails]);

    const mapStyleUrl = useMemo(() => {
        const suffix = '?optimize=true';
        if (mapType === 'satellite') return `mapbox://styles/mapbox/satellite-v9${suffix}`;
        if (mapType === 'default')   return `mapbox://styles/mapbox/streets-v12${suffix}`;
        return 'standard';
    }, [mapType]);

    const standardConfig = useMemo(() => ({
        lightPreset: 'day' as const,
        show3dObjects: true,
        show3dBuildings: true,
        show3dFacades: false,
        show3dTrees: true,
        show3dLandmarks: true,
        showPointOfInterestLabels: showLabels,
        showRoadLabels: showLabels,
        showTransitLabels: showLabels,
        showPlaceLabels: showLabels,
        showTraffic: trafficEnabled,
        showTransit: transitEnabled,
        showCycling: bikingEnabled,
        language: 'en',
    }), [showLabels, trafficEnabled, transitEnabled, bikingEnabled]);

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
        exploreEnabled,
        mapStyleUrl,
        standardConfig,
    };
}
