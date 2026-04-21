import { useState, useEffect } from 'react';
import { env } from '@/utils/env';

interface Coordinates {
    lat: number;
    lng: number;
}

interface UseMapboxDirectionsParams {
    origin: Coordinates | null;
    destination: Coordinates | null;
    enabled?: boolean;
    profile?: 'driving-traffic' | 'driving' | 'walking' | 'cycling';
}

export function useMapboxDirections({
    origin,
    destination,
    enabled = true,
    profile = 'driving-traffic'
}: UseMapboxDirectionsParams) {
    const [routeGeometry, setRouteGeometry] = useState<any>(null);
    const [travelTime, setTravelTime] = useState<number | null>(null);
    const [walkingTime, setWalkingTime] = useState<number | null>(null);
    const [cyclingTime, setCyclingTime] = useState<number | null>(null);
    const [isFetchingRoute, setIsFetchingRoute] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled || !origin || !destination) {
            setRouteGeometry(null);
            setTravelTime(null);
            setWalkingTime(null);
            setCyclingTime(null);
            setError(null);
            return;
        }

        const orgLat = origin.lat;
        const orgLng = origin.lng;
        const destLat = destination.lat;
        const destLng = destination.lng;

        const fetchRoute = async () => {
            setIsFetchingRoute(true);
            setRouteGeometry(null);
            setError(null);

            try {
                // Fetch ONLY the requested profile geometry and duration
                const res = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${orgLng},${orgLat};${destLng},${destLat}?geometries=geojson&overview=full&steps=true&access_token=${env.MAPBOX_TOKEN}`
                );

                if (!res.ok) throw new Error('Failed to fetch directions');

                const data = await res.json();

                if (data.code === 'Ok' && data.routes?.[0]) {
                    const route = data.routes[0];
                    setRouteGeometry(route.geometry);
                    
                    // Map the duration to the appropriate state field
                    const mins = Math.round(route.duration / 60);
                    if (profile.includes('driving')) setTravelTime(mins);
                    else if (profile === 'walking') setWalkingTime(mins);
                    else if (profile === 'cycling') setCyclingTime(mins);
                }
            } catch (err) {
                console.error('Mapbox Directions error:', err);
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                setIsFetchingRoute(false);
            }
        };

        fetchRoute();
    }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, enabled, profile]);

    const clearRoute = () => {
        setRouteGeometry(null);
        setTravelTime(null);
        setWalkingTime(null);
        setCyclingTime(null);
        setError(null);
    };

    return {
        routeGeometry,
        travelTime,
        walkingTime,
        cyclingTime,
        isFetchingRoute,
        error,
        clearRoute,
    };
}
