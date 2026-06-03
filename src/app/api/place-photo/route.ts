import { NextResponse } from 'next/server';
import { env } from '@/utils/env';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const photoReference = searchParams.get('photo_reference');
        const maxWidth = searchParams.get('maxwidth') || '400';

        if (!photoReference) {
            return NextResponse.json({ error: 'Missing photo_reference' }, { status: 400 });
        }

        if (!env.GOOGLE_PLACES_API_KEY) {
            return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
        }

        // Proxy from Google Places API directly (storage caching removed after Supabase migration)
        const googlePhotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${env.GOOGLE_PLACES_API_KEY}`;

        const googleRes = await fetch(googlePhotoUrl);

        if (!googleRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch photo from Google' }, { status: googleRes.status });
        }

        const arrayBuffer = await googleRes.arrayBuffer();
        const contentType = googleRes.headers.get('content-type') || 'image/jpeg';

        return new Response(arrayBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // Cache at CDN/browser level for 1 day
            },
        });

    } catch (err: any) {
        console.error('Place Photo API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
