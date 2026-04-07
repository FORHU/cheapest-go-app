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
                // Fetch the main profile geometry and duration
                const mainRes = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${orgLng},${orgLat};${destLng},${destLat}?geometries=geojson&overview=full&steps=true&access_token=${env.MAPBOX_TOKEN}`
                );
                
                // Also fetch reference times for other profiles (walking/driving)
                const [drivingRes, walkingRes, cyclingRes] = await Promise.all([
                    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${orgLng},${orgLat};${destLng},${destLat}?access_token=${env.MAPBOX_TOKEN}`),
                    fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${orgLng},${orgLat};${destLng},${destLat}?access_token=${env.MAPBOX_TOKEN}`),
                    fetch(`https://api.mapbox.com/directions/v5/mapbox/cycling/${orgLng},${orgLat};${destLng},${destLat}?access_token=${env.MAPBOX_TOKEN}`),
                ]);

                if (!mainRes.ok) throw new Error('Failed to fetch directions');

                const [mainJson, drivingJson, walkingJson, cyclingJson] = await Promise.all([
                    mainRes.json(),
                    drivingRes.json(),
                    walkingRes.json(),
                    cyclingRes.json()
                ]);

                if (mainJson.code === 'Ok' && mainJson.routes?.[0]) {
                    setRouteGeometry(mainJson.routes[0].geometry);
                }

                if (drivingJson.code === 'Ok' && drivingJson.routes?.[0]) {
                    setTravelTime(Math.round(drivingJson.routes[0].duration / 60));
                }

                if (walkingJson.code === 'Ok' && walkingJson.routes?.[0]) {
                    setWalkingTime(Math.round(walkingJson.routes[0].duration / 60));
                }

                if (cyclingJson.code === 'Ok' && cyclingJson.routes?.[0]) {
                    setCyclingTime(Math.round(cyclingJson.routes[0].duration / 60));
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
