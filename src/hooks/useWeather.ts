'use client';

import { useState, useEffect, useCallback } from 'react';

export interface WeatherCurrent {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    windCardinal: string;
    description: string;
    type: string;
    iconUrl: string | null;
    isDay: boolean;
    uvIndex: number | null;
    cloudCover: number | null;
    visibility: number | null;
}

export interface WeatherHourly {
    time: string;
    hour: number;
    temp: number;
    iconUrl: string | null;
    description: string;
    precipChance: number;
}

export interface WeatherDaily {
    date: string;
    tempMax: number;
    tempMin: number;
    iconUrl: string | null;
    description: string;
    sunrise: string;
    sunset: string;
    uvIndex: number | null;
    precipChance: number;
}

export interface WeatherData {
    current: WeatherCurrent;
    hourly: WeatherHourly[];
    daily: WeatherDaily[];
    units: { temp: string; windSpeed: string };
    timezone: string;
}

interface UseWeatherOptions {
    lat?: number;
    lng?: number;
    enabled?: boolean;
}

export function useWeather({ lat, lng, enabled = true }: UseWeatherOptions) {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchWeather = useCallback(async () => {
        if (!lat || !lng || !enabled) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
            if (!res.ok) throw new Error('Failed to fetch weather');
            const data = await res.json();
            setWeather(data);
        } catch (err: any) {
            console.error('Weather fetch error:', err);
            setError(err.message || 'Failed to load weather');
        } finally {
            setIsLoading(false);
        }
    }, [lat, lng, enabled]);

    useEffect(() => {
        fetchWeather();
    }, [fetchWeather]);

    // Auto-refresh every 15 minutes
    useEffect(() => {
        if (!enabled || !lat || !lng) return;
        const interval = setInterval(fetchWeather, 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, [enabled, lat, lng, fetchWeather]);

    return { weather, isLoading, error, refetch: fetchWeather };
}
