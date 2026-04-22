import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

/**
 * Foursquare Places Discovery API — finds recommended POIs.
 */

const FOURSQUARE_CATEGORY_MAP: Record<string, string> = {
    all: '10000,13000,16000,19000', // Arts, Dining, Landmarks, Travel
    restaurant: '13000', // Dining and Drinking
    attraction: '10000,16000', // Arts/Entertainment and Landmarks
    grocery: '17000', // Retail/Shopping (includes grocery)
    medical: '15000', // Health and Medicine
    transit: '19000', // Travel and Transport
};

export async function GET(req: NextRequest) {
    const key = env.FOURSQUARE_API_KEY;
    if (!key) {
        return NextResponse.json({ features: [], error: 'No Foursquare API key' }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const category = searchParams.get('category') || 'all';
    const radius = searchParams.get('radius') || '3000';

    if (!lat || !lng) {
        return NextResponse.json({ features: [], error: 'Missing lat/lng' }, { status: 400 });
    }

    try {
        const categories = FOURSQUARE_CATEGORY_MAP[category] || FOURSQUARE_CATEGORY_MAP['all'];
        
        const url = `https://api.foursquare.com/v3/places/search?ll=${lat},${lng}&radius=${radius}&categories=${categories}&limit=20&fields=fsq_id,name,geocodes,categories,rating,stats,location,photos,description,tel,website,hours,tips`;
        
        const res = await fetch(url, {
            headers: {
                'Authorization': key,
                'Accept': 'application/json'
            },
            next: { revalidate: 3600 }
        });

        const data = await res.json();
        
        if (!res.ok) {
            console.error(`[foursquare/discover] Foursquare error:`, data);
            return NextResponse.json({ features: [], error: 'Foursquare API error' }, { status: 200 });
        }

        const features = (data.results || []).map((place: any) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [place.geocodes.main.longitude, place.geocodes.main.latitude],
            },
            properties: {
                fsq_id: place.fsq_id,
                name: place.name,
                category: place.categories?.[0]?.name || 'Place',
                rating: place.rating ? place.rating / 2 : undefined, // Foursquare is 0-10, we use 0-5
                userRatingsTotal: place.stats?.total_ratings || 0,
                vicinity: place.location?.formatted_address || place.location?.address || '',
                photoUrl: place.photos?.[0] ? `${place.photos[0].prefix}original${place.photos[0].suffix}` : null,
                description: place.description || '',
                phone: place.tel || null,
                website: place.website || null,
                reviews: (place.tips || []).map((tip: any) => ({
                    author_name: 'Foursquare User',
                    text: tip.text,
                    relative_time_description: new Date(tip.created_at).toLocaleDateString(),
                    rating: 5, // Tips don't usually have individual ratings in this endpoint
                })),
                source: 'foursquare',
            },
        }));

        return NextResponse.json({ features });
    } catch (err) {
        console.error('[foursquare/discover] Error:', err);
        return NextResponse.json({ features: [], error: 'Discovery failed' }, { status: 200 });
    }
}
