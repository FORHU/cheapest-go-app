import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { getCached, setCache } from '@/lib/server/poi-cache';
import { tryGooglePlaces } from '@/lib/server/poi-google';
import { getPlaceholderUrl } from '@/lib/server/poi-placeholder';

function makePlaceholderSvg(name: string, category: string): string {
    const lowerCat = category.toLowerCase();
    const lowerName = name.toLowerCase();
    let bg = '#1e293b';
    if (lowerCat.includes('park') || lowerCat.includes('nature') || lowerName.includes('park') || lowerName.includes('garden')) bg = '#064e3b';
    else if (lowerCat.includes('restaurant') || lowerCat.includes('food') || lowerCat.includes('cafe')) bg = '#7c2d12';
    else if (lowerCat.includes('museum') || lowerCat.includes('landmark') || lowerCat.includes('attraction') || lowerCat.includes('tourism') || lowerCat.includes('tourist')) bg = '#3730a3';
    else if (lowerCat.includes('shop') || lowerCat.includes('market')) bg = '#831843';
    else if (lowerCat.includes('transit') || lowerCat.includes('station')) bg = '#334155';
    const label = name.length > 24 ? name.slice(0, 22) + '…' : name;
    const escaped = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="${bg}"/><text x="300" y="185" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="rgba(255,255,255,0.9)">${escaped}</text><text x="300" y="220" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="rgba(255,255,255,0.5)">${lowerCat || 'point of interest'}</text></svg>`;
}

const inFlightRequests = new Map<string, Promise<any>>();

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 600, windowMs: 60_000, prefix: 'poi-photo' });
    if (!rl.success) {
        if (req.url.includes('full=true')) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
        return new NextResponse(
            Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
            { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache' } }
        );
    }

    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name') || '';
    const lat = searchParams.get('lat') || '0';
    const lng = searchParams.get('lng') || '0';
    const placeId = searchParams.get('placeId') || '';
    const category = searchParams.get('category') || '';
    const photoRef = searchParams.get('photoRef') || '';
    const full = searchParams.get('full') === 'true';

    if (!name) return new Response('Missing name parameter', { status: 400 });

    // Fast path: photo_reference already known — skip all discovery API calls
    if (photoRef && !full) {
        const key = process.env.GOOGLE_PLACES_API_KEY;
        if (key) {
            const googlePhotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${key}`;
            try {
                const res = await fetch(googlePhotoUrl, { cache: 'no-store' });
                const ct = res.headers.get('content-type') || '';
                if (res.ok && ct.startsWith('image/')) {
                    return new NextResponse(await res.arrayBuffer(), {
                        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
                    });
                }
            } catch { /* fall through to normal flow */ }
        }
    }

    const roundedLat = parseFloat(lat).toFixed(4);
    const roundedLng = parseFloat(lng).toFixed(4);
    const cacheKey = `${name}|${roundedLat}|${roundedLng}|v11`;

    // Serve from cache
    const cached = await getCached(cacheKey);
    if (cached) {
        try {
            const parsedMeta = typeof cached === 'string' ? JSON.parse(cached) : cached;
            if (full) return NextResponse.json(parsedMeta);

            const targetUrl = parsedMeta.photoUrl || (typeof parsedMeta === 'string' ? parsedMeta : null);
            if (targetUrl) {
                try {
                    const imgRes = await fetch(targetUrl, { next: { revalidate: 3600 } });
                    if (imgRes.ok) {
                        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                        return new NextResponse(await imgRes.arrayBuffer(), {
                            headers: {
                                'Content-Type': contentType,
                                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                            },
                        });
                    }
                } catch (e) {
                    console.error('[poi-photo] Cached image stream failed:', e);
                }
                return NextResponse.redirect(targetUrl);
            }
        } catch (e) {
            console.error('[poi-photo] Cache parse failed:', e);
        }
    }

    // Deduplicate concurrent requests for the same key
    let resultMetadata: any = null;

    if (inFlightRequests.has(cacheKey)) {
        try { resultMetadata = await inFlightRequests.get(cacheKey); } catch { /* fall through */ }
    }

    if (!resultMetadata) {
        const metadataPromise = buildMetadata(name, lat, lng, placeId, category, cacheKey);
        inFlightRequests.set(cacheKey, metadataPromise);
        try {
            resultMetadata = await metadataPromise;
        } catch {
            resultMetadata = null;
        } finally {
            inFlightRequests.delete(cacheKey);
        }
    }

    try {
        if (!resultMetadata) throw new Error('Metadata generation failed');

        if (full) return NextResponse.json(resultMetadata);

        const isGooglePhotoUrl = (u: string) =>
            u.includes('maps.googleapis.com/maps/api/place/photo') ||
            u.includes('lh3.googleusercontent.com');

        const svgResponse = () => new NextResponse(makePlaceholderSvg(name, category), {
            headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
        });

        const photoUrl: string = resultMetadata.photoUrl || '';
        if (!photoUrl || !isGooglePhotoUrl(photoUrl)) {
            return svgResponse();
        }

        // For Google photo URLs: stream through to hide the API key
        try {
            const res = await fetch(photoUrl, { cache: 'no-store' });
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.startsWith('image/')) {
                return new NextResponse(await res.arrayBuffer(), {
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
                    },
                });
            }
        } catch { /* fall through to SVG */ }

        return svgResponse();
    } catch (err) {
        if (full) return NextResponse.json({ photoUrl: '', source: 'error-fallback' });
        return new NextResponse(makePlaceholderSvg(name, category), {
            headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
        });
    }
}

async function buildMetadata(
    name: string,
    lat: string,
    lng: string,
    placeId: string,
    category: string,
    cacheKey: string
) {
    const lowerName = name.toLowerCase();
    const lowerCat = category.toLowerCase();

    const meta: any = {
        photoUrl: null,
        googlePhotoUrl: null,
        rating: null,
        userRatingsTotal: null,
        vicinity: null,
        name,
        source: 'none',
    };

    const googleResult = await tryGooglePlaces(name, lat, lng, placeId);

    if (googleResult) {
        const googlePhotoOk =
            googleResult.photoUrl &&
            !googleResult.photoUrl.includes('/maps/api/staticmap') &&
            !googleResult.photoUrl.includes('maps.google.com/maps/api/staticmap');

        Object.assign(meta, googleResult, {
            googlePhotoUrl: googlePhotoOk ? googleResult.photoUrl : null,
            photoUrl: googlePhotoOk ? googleResult.photoUrl : null,
            nameEn: googleResult.name,
            source: googlePhotoOk ? 'google' : 'none',
        });
    }

    // Default opening hours for always-open venue types
    if (!meta.openingHours) {
        const isTransit = lowerCat.includes('transit') || lowerCat.includes('station') || lowerName.includes('station');
        const isPark = lowerCat.includes('park') || lowerCat.includes('nature');
        if (isTransit || isPark) {
            meta.openingHours = { open_now: true, weekday_text: ['Open 24 hours'] };
        }
    }

    // Rating fallback
    if (!meta.rating) {
        meta.rating = 4.0 + Math.random() * 0.9;
        meta.userRatingsTotal = Math.floor(50 + Math.random() * 500);
        meta.vicinity = meta.vicinity || 'Recommended Local Spot';
        if (meta.source === 'none') meta.source = 'mock-fallback';
    }

    // Photo fallback
    if (!meta.photoUrl) {
        meta.photoUrl = getPlaceholderUrl(name, category, lat, lng);
        if (meta.source === 'none') meta.source = 'placeholder';
    }

    await setCache(cacheKey, JSON.stringify(meta));
    return meta;
}
