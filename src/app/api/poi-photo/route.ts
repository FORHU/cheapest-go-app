import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

/**
 * POI Photo Proxy — fetches REAL venue photos (interior/exterior).
 *
 * Priority chain:
 *   1. Google Places Photos API  (needs GOOGLE_PLACES_API_KEY)
 *   2. Foursquare Places Photos  (needs FOURSQUARE_API_KEY)
 *   3. Mapbox satellite snapshot  (uses existing MAPBOX_TOKEN)
 *   4. Placeholder with venue name
 *
 * Results are cached in-memory (LRU, 500 entries, 1h TTL) to avoid
 * redundant API calls on repeat page views.
 */

// ── In-memory cache ──────────────────────────────────────────────
interface CacheEntry {
    url: string;
    timestamp: number;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 500;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key: string): string | null {
    const entry = CACHE.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        CACHE.delete(key);
        return null;
    }
    return entry.url;
}

function setCache(key: string, url: string) {
    if (CACHE.size >= CACHE_MAX) {
        // Evict oldest entry
        const oldest = CACHE.keys().next().value;
        if (oldest) CACHE.delete(oldest);
    }
    CACHE.set(key, { url, timestamp: Date.now() });
}

// ── Helpers ──────────────────────────────────────────────────────

/** Google Places: Find Place → Photo */
async function tryGooglePlaces(name: string, lat: string, lng: string): Promise<string | null> {
    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) return null;

    try {
        // Step 1: Find the place
        const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=photos,place_id&locationbias=circle:2000@${lat},${lng}&key=${key}`;
        const findRes = await fetch(findUrl, { next: { revalidate: 3600 } });
        const findData = await findRes.json();
        const photoRef = findData.candidates?.[0]?.photos?.[0]?.photo_reference;

        if (photoRef) {
            // Return the Google photo URL directly — the redirect will serve the image
            return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${photoRef}&key=${key}`;
        }
    } catch (err) {
        console.error('[poi-photo] Google Places error:', err);
    }
    return null;
}

/** Foursquare: Search → Photo */
async function tryFoursquare(name: string, lat: string, lng: string): Promise<string | null> {
    const key = (env as any).FOURSQUARE_API_KEY;
    if (!key) return null;

    try {
        // Step 1: Search for the place
        const searchUrl = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(name)}&ll=${lat},${lng}&radius=2000&limit=1&fields=fsq_id,name,photos`;
        const searchRes = await fetch(searchUrl, {
            headers: { Authorization: key, Accept: 'application/json' },
            next: { revalidate: 3600 },
        });
        const searchData = await searchRes.json();
        const place = searchData.results?.[0];

        // Check inline photos first
        if (place?.photos?.[0]) {
            const photo = place.photos[0];
            return `${photo.prefix}600x400${photo.suffix}`;
        }

        // Step 2: Fetch photos separately if not inline
        if (place?.fsq_id) {
            const photosUrl = `https://api.foursquare.com/v3/places/${place.fsq_id}/photos?limit=1`;
            const photosRes = await fetch(photosUrl, {
                headers: { Authorization: key, Accept: 'application/json' },
                next: { revalidate: 3600 },
            });
            const photos = await photosRes.json();
            if (photos?.[0]) {
                return `${photos[0].prefix}600x400${photos[0].suffix}`;
            }
        }
    } catch (err) {
        console.error('[poi-photo] Foursquare error:', err);
    }
    return null;
}

/** Mapbox satellite snapshot */
function getMapboxSatellite(lat: string, lng: string): string | null {
    if (!env.MAPBOX_TOKEN) return null;
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/pin-s+3b82f6(${lng},${lat})/${lng},${lat},17,60/600x400@2x?access_token=${env.MAPBOX_TOKEN}`;
}

// ── Main handler ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name') || '';
    const lat = searchParams.get('lat') || '0';
    const lng = searchParams.get('lng') || '0';

    if (!name) {
        return new Response('Missing name parameter', { status: 400 });
    }

    const cacheKey = `${name}|${lat}|${lng}`;

    // Return cached result if available
    const cached = getCached(cacheKey);
    if (cached) {
        return NextResponse.redirect(cached);
    }

    try {
        // Priority 1: Google Places (real venue photos)
        let photoUrl = await tryGooglePlaces(name, lat, lng);

        // Priority 2: Foursquare (real venue photos)
        if (!photoUrl) {
            photoUrl = await tryFoursquare(name, lat, lng);
        }

        // Priority 3: Mapbox satellite close-up
        if (!photoUrl) {
            photoUrl = getMapboxSatellite(lat, lng);
        }

        // Priority 4: Placeholder
        if (!photoUrl) {
            photoUrl = `https://placehold.co/600x400/1e293b/94a3b8?text=${encodeURIComponent(name)}`;
        }

        setCache(cacheKey, photoUrl);
        return NextResponse.redirect(photoUrl);
    } catch (err) {
        console.error('[poi-photo] Error:', err);
        const fallback = getMapboxSatellite(lat, lng)
            || `https://placehold.co/600x400/1e293b/94a3b8?text=${encodeURIComponent(name)}`;
        return NextResponse.redirect(fallback);
    }
}
