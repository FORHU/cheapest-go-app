import { useMemo } from 'react';
import { buildGeoJson, MappableProperty } from '../utils/buildGeoJson';

/**
 * Prepares marker data for the map.
 *
 * @param properties     Raw property list (may include invalid coords).
 * @param displayPrices  Optional map of property ID to a pre-formatted price
 *                       string (e.g. currency-converted) for the GL symbol layer.
 */
export const useMapMarkers = (
    properties: MappableProperty[],
    displayPrices?: Record<string, string>,
    convertedPrices?: Record<string, number>,
) => {
    // Filter out invalid or zero coordinates
    const mappableProperties = useMemo(() => {
        return properties.filter(
            (p) =>
                p.coordinates &&
                p.coordinates.lat !== 0 &&
                p.coordinates.lng !== 0
        );
    }, [properties]);

    const geoJsonData = useMemo(() => {
        return buildGeoJson(mappableProperties, displayPrices, convertedPrices);
    }, [mappableProperties, displayPrices, convertedPrices]);

    const shouldCluster = useMemo(() => mappableProperties.length > 20, [mappableProperties]);

    return {
        mappableProperties,
        geoJsonData,
        shouldCluster,
    };
};
