import { useMemo } from 'react';
import { buildGeoJson, MappableProperty } from '../utils/buildGeoJson';

export const useMapMarkers = (properties: MappableProperty[]) => {
    // Filter out invalid coordinates (defensive coding)
    const mappableProperties = useMemo(() => {
        return properties.filter(
            (p) =>
                p.coordinates &&
                p.coordinates.lat !== 0 &&
                p.coordinates.lng !== 0
        );
    }, [properties]);

    const geoJsonData = useMemo(() => {
        return buildGeoJson(mappableProperties);
    }, [mappableProperties]);

    const shouldCluster = mappableProperties.length > 100;

    return {
        mappableProperties,
        geoJsonData,
        shouldCluster,
    };
};
