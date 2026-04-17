import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const input = searchParams.get('input') || '';
    const proximity = searchParams.get('proximity'); // lat,lng

    if (!input) {
        return NextResponse.json({ predictions: [] });
    }

    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) {
        return NextResponse.json({ error: 'Google Places API key is not configured' }, { status: 500 });
    }

    try {
        let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&language=en&types=geocode|establishment`;

        if (proximity) {
            url += `&location=${proximity}&radius=50000`; // 50km radius around proximity
        }

        const res = await fetch(url);
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('[google-search] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });
    }
}
