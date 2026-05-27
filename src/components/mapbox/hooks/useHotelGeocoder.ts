import { useState, useEffect } from 'react';
import { env } from '@/utils/env';

interface HotelCoords {
    lat: number;
    lng: number;
}

interface UseHotelGeocoderResult {
    coords: HotelCoords | null;
    isLoading: boolean;
    error: string | null;
}

/**
 * Geocodes a hotel by name using the Mapbox Geocoding API.
 * Returns coordinates of the best matching result (poi or place type).
 */
export function useHotelGeocoder(propertyName: string | null): UseHotelGeocoderResult {
    const [coords, setCoords]       = useState<HotelCoords | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]         = useState<string | null>(null);

    useEffect(() => {
        if (!propertyName?.trim()) return;

        let cancelled = false;
        setIsLoading(true);
        setError(null);
        setCoords(null);

        const query = encodeURIComponent(propertyName.trim());
        const url =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json` +
            `?types=poi,place,address` +
            `&limit=1` +
            `&access_token=${env.MAPBOX_TOKEN}`;

        fetch(url)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                const feature = data?.features?.[0];
                if (feature?.center) {
                    const [lng, lat] = feature.center as [number, number];
                    setCoords({ lat, lng });
                } else {
                    setError('Could not find hotel location.');
                }
            })
            .catch(() => {
                if (!cancelled) setError('Geocoding request failed.');
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [propertyName]);

    return { coords, isLoading, error };
}
