import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { rateLimit } from '@/lib/server/rate-limit';

/**
 * Google Places Discovery API — finds nearby POIs by type.
 * Used as a discovery source when Mapbox returns sparse results.
 *
 * Query params:
 *   lat, lng — center coordinates (required)
 *   type     — Google Place type (e.g. restaurant, tourist_attraction, park)
 *   radius   — search radius in meters (default: 3000)
 *   keyword  — optional keyword filter
 */

const GOOGLE_TYPE_MAP: Record<string, string[]> = {
    all: ['tourist_attraction', 'restaurant', 'park', 'museum'],
    restaurant: ['restaurant', 'cafe', 'bakery', 'bar'],
    attraction: ['tourist_attraction', 'museum', 'art_gallery', 'amusement_park', 'zoo', 'aquarium'],
    grocery: ['supermarket', 'grocery_or_supermarket', 'convenience_store'],
    medical: ['hospital', 'pharmacy', 'doctor', 'dentist'],
    transit: ['bus_station', 'train_station', 'subway_station', 'transit_station'],
};

export async function GET(req: NextRequest) {
    const rl = rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'places-discover' });
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) {
        return NextResponse.json({ features: [], error: 'No API key' }, { status: 200 });
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
        const types = GOOGLE_TYPE_MAP[category] || GOOGLE_TYPE_MAP['all'];
        
        // Fetch all types in parallel
        const promises = types.map(async (type) => {
            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}&language=en`;
            const res = await fetch(url, { next: { revalidate: 3600 } });
            const data = await res.json();
            
            if (data.status !== 'OK') {
                console.warn(`[places/discover] Google status=${data.status} for type=${type}`);
                return [];
            }
            return (data.results || []).map((place: any) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [place.geometry.location.lng, place.geometry.location.lat],
                },
                properties: {
                    name: place.name,
                    place_id: place.place_id,
                    category: place.types?.[0] || type,
                    rating: place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    vicinity: place.vicinity,
                    photoReference: place.photos?.[0]?.photo_reference || null,
                    source: 'google',
                },
            }));
        });

        const results = await Promise.all(promises);
        const allFeatures = results.flat();

        // Deduplicate by place_id
        const unique = new Map<string, any>();
        allFeatures.forEach((f) => {
            const id = f.properties.place_id;
            if (!unique.has(id)) unique.set(id, f);
        });

        // Sort by rating (best first), then by number of reviews
        const features = Array.from(unique.values())
            .filter((f) => (f.properties.rating || 0) >= 3.5)
            .sort((a, b) => {
                const ratingDiff = (b.properties.rating || 0) - (a.properties.rating || 0);
                if (ratingDiff !== 0) return ratingDiff;
                return (b.properties.userRatingsTotal || 0) - (a.properties.userRatingsTotal || 0);
            })
            .slice(0, 25);

        return NextResponse.json({ features });
    } catch (err) {
        console.error('[places/discover] Error:', err);
        return NextResponse.json({ features: [], error: 'Discovery failed' }, { status: 200 });
    }
}
