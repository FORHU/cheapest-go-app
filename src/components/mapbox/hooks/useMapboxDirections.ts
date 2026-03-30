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
    drivingProfile?: 'driving-traffic' | 'driving';
}

export function useMapboxDirections({ origin, destination, enabled = true, drivingProfile = 'driving-traffic' }: UseMapboxDirectionsParams) {
    const [routeGeometry, setRouteGeometry] = useState<any>(null);
    const [travelTime, setTravelTime] = useState<number | null>(null);
    const [walkingTime, setWalkingTime] = useState<number | null>(null);
    const [isFetchingRoute, setIsFetchingRoute] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled || !origin || !destination) {
            setRouteGeometry(null);
            setTravelTime(null);
            setWalkingTime(null);
            setError(null);
            return;
        }

        // Capture primitive values to avoid closure staleness inside the effect
        const orgLat = origin.lat;
        const orgLng = origin.lng;
        const destLat = destination.lat;
        const destLng = destination.lng;

        const fetchRoute = async () => {
            setIsFetchingRoute(true);
            setRouteGeometry(null);
            setTravelTime(null);
            setWalkingTime(null);
            setError(null);

            try {
                const [drivingRes, walkingRes] = await Promise.all([
                    fetch(`https://api.mapbox.com/directions/v5/mapbox/${drivingProfile}/${orgLng},${orgLat};${destLng},${destLat}?geometries=geojson&overview=full&steps=true&access_token=${env.MAPBOX_TOKEN}`),
                    fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${orgLng},${orgLat};${destLng},${destLat}?overview=full&steps=true&access_token=${env.MAPBOX_TOKEN}`),
                ]);

                if (!drivingRes.ok || !walkingRes.ok) {
                    throw new Error('Failed to fetch directions from Mapbox API');
                }

                const [drivingJson, walkingJson] = await Promise.all([drivingRes.json(), walkingRes.json()]);

                if (drivingJson.code === 'Ok' && drivingJson.routes?.[0]) {
                    setRouteGeometry(drivingJson.routes[0].geometry);
                    setTravelTime(Math.round(drivingJson.routes[0].duration / 60));
                }

                if (walkingJson.code === 'Ok' && walkingJson.routes?.[0]) {
                    setWalkingTime(Math.round(walkingJson.routes[0].duration / 60));
                }
            } catch (err) {
                console.error('Mapbox Directions error:', err);
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                setIsFetchingRoute(false);
            }
        };

        fetchRoute();
    }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, enabled, drivingProfile]);

    const clearRoute = () => {
        setRouteGeometry(null);
        setTravelTime(null);
        setWalkingTime(null);
        setError(null);
    };

    return {
        routeGeometry,
        travelTime,
        walkingTime,
        isFetchingRoute,
        error,
        clearRoute,
    };
}
