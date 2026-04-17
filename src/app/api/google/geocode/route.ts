import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const placeId = searchParams.get('place_id');

    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) {
        return NextResponse.json({ error: 'Google Places API key is not configured' }, { status: 500 });
    }

    try {
        let url = '';
        if (lat && lng) {
            // Reverse Geocoding
            url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
        } else if (placeId) {
            // Get coordinates from Place ID
            url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name&key=${key}`;
        } else {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const res = await fetch(url);
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('[google-geocode] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch geocode data' }, { status: 500 });
    }
}
