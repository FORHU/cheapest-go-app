'use client';

import { useState, useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { type MapTypeId, type MapDetailToggle } from '../components/MapDetailsPanel';

export function useMapDetails(defaultMapType: MapTypeId = 'default') {
    const locale = useLocale();
    const [mapType, setMapType] = useState<MapTypeId>(defaultMapType);
    const [showDetailsPanel, setShowDetailsPanel] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [mapDetails, setMapDetails] = useState<MapDetailToggle[]>([
        { id: 'explore',  enabled: true },
        { id: 'transit',  enabled: false },
        { id: 'traffic',  enabled: false },
        { id: 'biking',   enabled: false },
        { id: 'terrain',  enabled: false },
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
        // Basemap labels follow the Storefront Locale. Hardcoded 'en' put Seoul on a
        // Korean storefront as "Goyang", "Han River", "World Cup buk-ro" — place names
        // the reader has to translate back. Mapbox Standard takes a BCP-47 subtag and
        // falls back to the local name where it has no translation, so an unsupported
        // locale degrades to the map's own labels rather than to English.
        language: locale,
    }), [showLabels, trafficEnabled, transitEnabled, bikingEnabled, locale]);

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
