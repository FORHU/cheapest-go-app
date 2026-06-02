import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city') || '';
    const googleKey = env.GOOGLE_PLACES_API_KEY;

    if (!googleKey) {
        return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
    }

    try {
        // Geocode city to coordinates
        const geoRes = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${googleKey}`
        );
        const geoData = await geoRes.json();
        const location = geoData?.results?.[0]?.geometry?.location;
        if (!location) {
            return NextResponse.json({ error: `Could not find location for: ${city}` }, { status: 404 });
        }

        const { lat, lng } = location;

        const types = ['restaurant', 'tourist_attraction', 'park', 'cafe'];
        const results = await Promise.all(
            types.map(type =>
                fetch(
                    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1500&type=${type}&key=${googleKey}`
                ).then(r => r.json()).then(d =>
                    (d.results || []).slice(0, 3).map((p: any) => ({
                        name: p.name,
                        category: type,
                        rating: p.rating || null,
                        vicinity: p.vicinity || '',
                    }))
                )
            )
        );

        return NextResponse.json({ lat, lng, places: results.flat() });
    } catch (error) {
        console.error('[places] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch nearby places' }, { status: 500 });
    }
}
