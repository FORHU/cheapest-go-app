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
                const drivingProfile = profile === 'driving-traffic' ? 'driving-traffic' : 'driving';
                const profilesToFetch = Array.from(new Set([profile, drivingProfile, 'walking', 'cycling']));

                const fetchProfile = async (p: string) => {
                    const withGeom = p === profile;
                    const url = `https://api.mapbox.com/directions/v5/mapbox/${p}/${orgLng},${orgLat};${destLng},${destLat}?` +
                        (withGeom ? `geometries=geojson&overview=full&steps=true` : `overview=false&steps=false`) +
                        `&access_token=${env.MAPBOX_TOKEN}`;
                    const res = await fetch(url);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.code === 'Ok' && data.routes?.[0]) {
                        return { profile: p, route: data.routes[0], withGeom };
                    }
                    return null;
                };

                const results = await Promise.all(profilesToFetch.map(fetchProfile));

                results.forEach(res => {
                    if (!res) return;
                    const mins = Math.round(res.route.duration / 60);
                    if (res.profile.includes('driving')) setTravelTime(mins);
                    else if (res.profile === 'walking') setWalkingTime(mins);
                    else if (res.profile === 'cycling') setCyclingTime(mins);

                    if (res.withGeom) {
                        setRouteGeometry(res.route.geometry);
                    }
                });
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
