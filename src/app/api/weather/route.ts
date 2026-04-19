import { NextRequest, NextResponse } from 'next/server';

/**
 * Weather API route using Google Maps Platform Weather API.
 * Returns current weather conditions + daily forecast for given coordinates.
 *
 * Query params:
 *   lat - Latitude
 *   lng - Longitude
 */

const GOOGLE_WEATHER_BASE = 'https://weather.googleapis.com/v1';

// Comprehensive mock data for fallback
const MOCK_WEATHER = {
    current: {
        temp: 22,
        feelsLike: 24,
        humidity: 65,
        windSpeed: 12,
        windDirection: 180,
        windCardinal: 'S',
        description: 'Partly Cloudy (Mock)',
        type: 'PARTLY_CLOUDY',
        iconUrl: 'https://www.gstatic.com/images/icons/material/apps/weather/2x/partly_cloudy_day_dark_48dp.png',
        isDay: true,
        uvIndex: 4,
        cloudCover: 40,
        visibility: 10,
    },
    hourly: Array.from({ length: 12 }, (_, i) => ({
        time: new Date(Date.now() + i * 3600000).toISOString(),
        hour: (new Date().getHours() + i) % 24,
        temp: 20 + Math.sin(i / 2) * 5,
        iconUrl: 'https://www.gstatic.com/images/icons/material/apps/weather/2x/partly_cloudy_day_dark_48dp.png',
        description: 'Partly Cloudy',
        precipChance: 10,
    })),
    daily: Array.from({ length: 3 }, (_, i) => ({
        date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
        tempMax: 25 + i,
        tempMin: 18 - i,
        iconUrl: 'https://www.gstatic.com/images/icons/material/apps/weather/2x/partly_cloudy_day_dark_48dp.png',
        description: 'Mostly Sunny',
        sunrise: '06:00',
        sunset: '19:00',
        uvIndex: 6,
        precipChance: 5,
    })),
    units: { temp: '°C', windSpeed: 'km/h' },
    timezone: 'UTC',
};

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
        return NextResponse.json({ error: 'Missing lat/lng parameters' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    // Return mock data if API key is missing
    if (!apiKey) {
        console.warn('Weather API: GOOGLE_PLACES_API_KEY missing. Returning mock data.');
        return NextResponse.json(MOCK_WEATHER);
    }

    try {
        // Fetch current conditions and daily forecast in parallel
        const [currentRes, dailyRes, hourlyRes] = await Promise.all([
            fetch(
                `${GOOGLE_WEATHER_BASE}/currentConditions:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}`,
                { next: { revalidate: 900 } } // Cache 15 min
            ),
            fetch(
                `${GOOGLE_WEATHER_BASE}/forecast/days:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&days=3`,
                { next: { revalidate: 900 } }
            ),
            fetch(
                `${GOOGLE_WEATHER_BASE}/forecast/hours:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&hours=12`,
                { next: { revalidate: 900 } }
            ),
        ]);

        if (!currentRes.ok) {
            const errBody = await currentRes.text();
            console.error('Google Weather current conditions error:', currentRes.status, errBody);
            
            // If location is not supported (404), fallback to mock data instead of erroring
            if (currentRes.status === 404) {
                console.warn(`Weather API: Location (${lat}, ${lng}) not supported. Returning mock data.`);
                return NextResponse.json(MOCK_WEATHER);
            }
            
            throw new Error(`Google Weather API error: ${currentRes.status}`);
        }

        const current = await currentRes.json();
        const dailyData = dailyRes.ok ? await dailyRes.json() : null;
        const hourlyData = hourlyRes.ok ? await hourlyRes.json() : null;

        // Map Google Weather icon URI to a usable image URL (they provide .svg versions)
        const iconUri = current.weatherCondition?.iconBaseUri;
        const iconUrl = iconUri ? `${iconUri}.svg` : null;

        // Build hourly forecast
        const hourlyForecast = [];
        if (hourlyData?.forecastHours) {
            for (const h of hourlyData.forecastHours.slice(0, 12)) {
                const startTime = h.interval?.startTime || h.displayDateTime;
                const hourTime = new Date(startTime);
                const hour = isNaN(hourTime.getHours()) ? 0 : hourTime.getHours();
                
                hourlyForecast.push({
                    time: startTime,
                    hour,
                    temp: Math.round(h.temperature?.degrees ?? 0),
                    iconUrl: h.weatherCondition?.iconBaseUri ? `${h.weatherCondition.iconBaseUri}.svg` : null,
                    description: h.weatherCondition?.description?.text || '',
                    precipChance: h.precipitation?.probability?.percent ?? 0,
                });
            }
        }

        // Build daily forecast
        const dailyForecast = [];
        if (dailyData?.forecastDays) {
            for (const [i, d] of dailyData.forecastDays.slice(0, 3).entries()) {
                const daytime = d.daytimeForecast || {};
                const nighttime = d.nighttimeForecast || {};
                const dateStr = d.interval?.startTime?.split('T')[0] || d.displayDate;
                
                dailyForecast.push({
                    date: dateStr,
                    tempMax: Math.round(d.maxTemperature?.degrees ?? daytime.temperature?.degrees ?? 0),
                    tempMin: Math.round(d.minTemperature?.degrees ?? nighttime.temperature?.degrees ?? 0),
                    iconUrl: daytime.weatherCondition?.iconBaseUri
                        ? `${daytime.weatherCondition.iconBaseUri}.svg`
                        : (d.weatherCondition?.iconBaseUri ? `${d.weatherCondition.iconBaseUri}.svg` : null),
                    description: daytime.weatherCondition?.description?.text || d.weatherCondition?.description?.text || '',
                    sunrise: d.sunrise,
                    sunset: d.sunset,
                    uvIndex: d.maxUvIndex ?? daytime.uvIndex ?? null,
                    precipChance: d.precipitation?.probability?.percent ?? daytime.precipitation?.probability?.percent ?? 0,
                });
            }
        }

        const response = {
            current: {
                temp: Math.round(current.temperature?.degrees ?? 0),
                feelsLike: Math.round(current.feelsLikeTemperature?.degrees ?? 0),
                humidity: current.relativeHumidity ?? 0,
                windSpeed: Math.round(current.wind?.speed?.value ?? 0),
                windDirection: current.wind?.direction?.degrees ?? 0,
                windCardinal: current.wind?.direction?.cardinal || '',
                description: current.weatherCondition?.description?.text || 'Unknown',
                type: current.weatherCondition?.type || '',
                iconUrl,
                isDay: current.isDaytime ?? true,
                uvIndex: current.uvIndex ?? null,
                cloudCover: current.cloudCover ?? null,
                visibility: current.visibility?.distance ?? null,
            },
            hourly: hourlyForecast,
            daily: dailyForecast,
            units: {
                temp: current.temperature?.unit === 'FAHRENHEIT' ? '°F' : '°C',
                windSpeed: current.wind?.speed?.unit === 'MILES_PER_HOUR' ? 'mph' : 'km/h',
            },
            timezone: current.timeZone?.id || '',
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Weather API error:', error);
        // Final fallback to mock data on ANY error in dev to prevent UI breaks
        return NextResponse.json(MOCK_WEATHER);
    }
}
