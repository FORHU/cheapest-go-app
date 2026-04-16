import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

/**
 * POI Photo Proxy — fetches REAL venue photos (interior/exterior).
 *
 * Priority chain:
 *   1. Google Places Photos API  (needs GOOGLE_PLACES_API_KEY)
 *   2. Foursquare Places Photos  (needs FOURSQUARE_API_KEY)
 *   3. Placeholder with venue name (Uses category-aware backgrounds)
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

async function tryGooglePlaces(name: string, lat: string, lng: string) {
    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) return null;

    const findPhotoInCandidate = async (candidate: any) => {
        let photoUrl = null;
        let reviews = [];
        let details = {};

        if (candidate?.place_id) {
            try {
                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=photos,reviews,formatted_phone_number,website&key=${key}`;
                const detailsRes = await fetch(detailsUrl, { next: { revalidate: 3600 } });
                const detailsData = await detailsRes.json();
                
                reviews = detailsData.result?.reviews || [];
                details = {
                    phone: detailsData.result?.formatted_phone_number,
                    website: detailsData.result?.website,
                };
                
                const photoRef = detailsData.result?.photos?.[0]?.photo_reference;
                if (photoRef) {
                    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${key}`;
                }
            } catch (e) {
                console.error('[poi-photo] Details fetch failed:', e);
            }
        }
        
        // Fallback to inline candidate photo if details didn't have one
        if (!photoUrl && candidate?.photos?.[0]?.photo_reference) {
            photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${candidate.photos[0].photo_reference}&key=${key}`;
        }
        
        return { photoUrl, reviews, details };
    };

    try {
        // Step 1: Nearby Search (Tighter radius = better match for coordinates)
        const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&keyword=${encodeURIComponent(name)}&key=${key}`;
        const nearbyRes = await fetch(nearbyUrl, { next: { revalidate: 3600 } });
        const nearbyData = await nearbyRes.json();

        if (nearbyData.status === 'OK') {
            const results = nearbyData.results || [];
            // Optimistically process top 3 candidates in parallel
            const candidateResults = await Promise.all(
                results.slice(0, 3).map((candidate: any) => findPhotoInCandidate(candidate))
            );

            for (let i = 0; i < candidateResults.length; i++) {
                const { photoUrl, reviews, details } = candidateResults[i];
                const candidate = results[i];
                if (photoUrl || reviews.length > 0) {
                    return {
                        photoUrl,
                        rating: candidate.rating,
                        userRatingsTotal: candidate.user_ratings_total,
                        vicinity: candidate.vicinity || candidate.formatted_address,
                        reviews,
                        ...details
                    };
                }
            }
        } else if (nearbyData.status === 'REQUEST_DENIED') {
            console.error(`[poi-photo] Google Nearby Search DENIED for "${name}". Check if "Places API" is enabled and billing is active.`);
        }

        // Step 2: Text Search (Broader search if nearby failed)
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(name)}&location=${lat},${lng}&radius=3000&key=${key}`;
        const searchRes = await fetch(searchUrl, { next: { revalidate: 3600 } });
        const searchData = await searchRes.json();
        
        if (searchData.status === 'OK') {
            const results = searchData.results || [];
            // Parallelize top candidates
            const candidateResults = await Promise.all(
                results.slice(0, 3).map((candidate: any) => findPhotoInCandidate(candidate))
            );

            for (let i = 0; i < candidateResults.length; i++) {
                const { photoUrl, reviews, details } = candidateResults[i];
                const candidate = results[i];
                if (photoUrl || reviews.length > 0) {
                    return {
                        photoUrl,
                        rating: candidate.rating,
                        userRatingsTotal: candidate.user_ratings_total,
                        vicinity: candidate.formatted_address || candidate.vicinity,
                        reviews,
                        ...details
                    };
                }
            }
            
            const best = results[0];
            return {
                photoUrl: null,
                rating: best.rating,
                userRatingsTotal: best.user_ratings_total,
                vicinity: best.formatted_address || best.vicinity,
                reviews: []
            };
        } else if (searchData.status === 'REQUEST_DENIED') {
            console.error(`[poi-photo] Google Text Search DENIED for "${name}". Check your API Key restrictions in Google Cloud Console.`);
        }

        console.warn(`[poi-photo] No Google photo found for "${name}" (Status: ${searchData.status}/${nearbyData.status})`);
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


export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name') || '';
    const lat = searchParams.get('lat') || '0';
    const lng = searchParams.get('lng') || '0';
    const full = searchParams.get('full') === 'true'; // If true, return JSON metadata

    if (!name) {
        return new Response('Missing name parameter', { status: 400 });
    }

    // Round coordinates to ~11m precision to improve cache hits for slight position shifts
    const roundedLat = parseFloat(lat).toFixed(4);
    const roundedLng = parseFloat(lng).toFixed(4);
    const cacheKey = `${name}|${roundedLat}|${roundedLng}|${full}`;

    // Return cached result if available
    const cached = getCached(cacheKey);
    if (cached) {
        if (full) {
            return NextResponse.json(JSON.parse(cached));
        }
        return NextResponse.redirect(cached);
    }

    try {
        let resultMetadata: any = {
            photoUrl: null,
            rating: null,
            userRatingsTotal: null,
            vicinity: null,
            source: 'none'
        };

        // --- Data Retrieval Strategy ---
        // 1. Always try Google first for metadata (ratings, address) and potential photos
        const googleResult = await tryGooglePlaces(name, lat, lng);
        if (googleResult) {
            resultMetadata = { ...resultMetadata, ...googleResult, source: googleResult.photoUrl ? 'google' : 'none' };
        }

        // 2. Decide on the photo source in a clean fallback chain
        if (resultMetadata.photoUrl) {
            // Already have a Google photo
        } else {
            // Try Foursquare as second priority for a real photo
            const fsqUrl = await tryFoursquare(name, lat, lng);
            if (fsqUrl) {
                resultMetadata.photoUrl = fsqUrl;
                resultMetadata.source = 'foursquare';
            } else {
                // Final Priority: High-quality category-aware placeholders
                const nameLower = name.toLowerCase();
                const isDining = nameLower.includes('restaurant') || nameLower.includes('cafe') || nameLower.includes('eatery');
                const isPark = nameLower.includes('park') || nameLower.includes('garden') || nameLower.includes('field');
                
                let placeholderUrl = `https://placehold.co/600x400/1e293b/94a3b8?text=${encodeURIComponent(name)}`;
                
                if (isDining) {
                    placeholderUrl = `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=600&h=400`;
                } else if (isPark) {
                    placeholderUrl = `https://images.unsplash.com/photo-1501333441792-41a2f3e8cb08?auto=format&fit=crop&q=80&w=600&h=400`;
                }
                
                resultMetadata.photoUrl = placeholderUrl;
                resultMetadata.source = 'placeholder';
            }
        }

        if (full) {
            setCache(cacheKey, JSON.stringify(resultMetadata));
            return NextResponse.json(resultMetadata);
        } else {
            // PROXY MODE: Fetch and stream the actual image bytes to bypass browser restrictions
            try {
                const imgRes = await fetch(resultMetadata.photoUrl, {
                    next: { revalidate: 3600 }
                });

                if (!imgRes.ok) {
                    console.error(`[poi-photo] Remote fetch failed for "${name}": ${imgRes.status} ${imgRes.statusText}`);
                    // If it's a 403 or 404, we'll try to redirect as a last-ditch effort, 
                    // or just let it fall through to placeholder logic if we refactored it.
                    // But in this block, we've already decided on resultMetadata.photoUrl.
                    return NextResponse.redirect(resultMetadata.photoUrl);
                }

                const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                // Use arrayBuffer for compatibility with all environments; performance is fine for small POI photos
                const buffer = await imgRes.arrayBuffer();
                
                setCache(cacheKey, resultMetadata.photoUrl); // Cache the SUCCESSFUL URL only
                
                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
                    },
                });
            } catch (proxyError) {
                console.error('[poi-photo] Internal proxy streaming error:', proxyError);
                return NextResponse.redirect(resultMetadata.photoUrl);
            }
        }
    } catch (err) {
        console.error('[poi-photo] General Error:', err);
        const fallbackUrl = `https://placehold.co/600x400/1e293b/94a3b8?text=${encodeURIComponent(name)}`;
        
        if (full) {
            return NextResponse.json({ photoUrl: fallbackUrl, source: 'error-fallback' });
        }
        return NextResponse.redirect(fallbackUrl);
    }
}
