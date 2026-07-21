import { useState, useEffect, useRef } from 'react';

export interface GpsPosition {
    latitude: number;
    longitude: number;
    accuracy: number; // metres
    heading: number | null;
}

const GPS_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 0,
};

/**
 * Tracks the user's real-time GPS position using the browser Geolocation API.
 * Returns the latest position, an error string (if any), and whether tracking
 * is still initialising.
 */
export const useGpsTracking = () => {
    const [position, setPosition] = useState<GpsPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(true);
    const watchIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser.');
            setIsLocating(false);
            return;
        }

        const onSuccess = (pos: GeolocationPosition) => {
            setPosition({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                heading: pos.coords.heading,
            });
            setIsLocating(false);
            setError(null);
        };

        const onError = (err: GeolocationPositionError) => {
            console.warn('[GPS] Error:', err.message);
            setError(err.message);
            setIsLocating(false);
        };

        // Get a first fix quickly, then watch for continuous updates
        navigator.geolocation.getCurrentPosition(onSuccess, onError, GPS_OPTIONS);
        watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, GPS_OPTIONS);

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    return { position, error, isLocating };
};
