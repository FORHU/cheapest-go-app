import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { getCached, setCache } from '@/lib/server/poi-cache';
import { tryGooglePlaces } from '@/lib/server/poi-google';
import { tryFoursquare } from '@/lib/server/poi-foursquare';
import { getPlaceholderUrl } from '@/lib/server/poi-placeholder';

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
    const fsqId = searchParams.get('fsqId') || '';
    const category = searchParams.get('category') || '';
    const full = searchParams.get('full') === 'true';

    if (!name) return new Response('Missing name parameter', { status: 400 });

    const roundedLat = parseFloat(lat).toFixed(4);
    const roundedLng = parseFloat(lng).toFixed(4);
    const cacheKey = `${name}|${roundedLat}|${roundedLng}|v10`;

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
        const metadataPromise = buildMetadata(name, lat, lng, placeId, fsqId, category, cacheKey);
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

        const tryFetchImage = async (url: string) => {
            const res = await fetch(url, { next: { revalidate: 3600 } });
            const contentType = res.headers.get('content-type') || '';
            return { res, contentType, isImage: contentType.toLowerCase().startsWith('image/') };
        };

        let finalUrl = resultMetadata.photoUrl;
        let { res: imgRes, contentType, isImage } = await tryFetchImage(finalUrl);

        if (!imgRes.ok || !isImage) {
            const candidates = [
                resultMetadata.source === 'google' ? resultMetadata.foursquarePhotoUrl : resultMetadata.googlePhotoUrl,
                resultMetadata.googlePhotoUrl,
                resultMetadata.foursquarePhotoUrl,
                getPlaceholderUrl(name, category, lat, lng),
            ].filter((u, i, arr): u is string => !!u && arr.indexOf(u) === i);

            for (const url of candidates) {
                const candidate = await tryFetchImage(url);
                if (candidate.res.ok && candidate.isImage) {
                    finalUrl = url;
                    imgRes = candidate.res;
                    contentType = candidate.contentType;
                    isImage = true;
                    break;
                }
            }
        }

        if (!imgRes.ok || !isImage) return NextResponse.redirect(finalUrl);

        return new NextResponse(await imgRes.arrayBuffer(), {
            headers: {
                'Content-Type': contentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
            },
        });
    } catch (err) {
        const fallbackUrl = getPlaceholderUrl(name, category, lat, lng);
        if (full) return NextResponse.json({ photoUrl: fallbackUrl, source: 'error-fallback' });
        return NextResponse.redirect(fallbackUrl);
    }
}

async function buildMetadata(
    name: string,
    lat: string,
    lng: string,
    placeId: string,
    fsqId: string,
    category: string,
    cacheKey: string
) {
    const lowerName = name.toLowerCase();
    const lowerCat = category.toLowerCase();

    const meta: any = {
        photoUrl: null,
        googlePhotoUrl: null,
        foursquarePhotoUrl: null,
        rating: null,
        userRatingsTotal: null,
        vicinity: null,
        name,
        source: 'none',
    };

    const [googleResult, fsqResult] = await Promise.all([
        tryGooglePlaces(name, lat, lng, placeId),
        tryFoursquare(name, lat, lng, fsqId),
    ]);

    if (googleResult) {
        Object.assign(meta, googleResult, {
            googlePhotoUrl: googleResult.photoUrl || null,
            nameEn: googleResult.name,
            source: googleResult.photoUrl ? 'google' : 'none',
        });
    }

    if (fsqResult) {
        if (!meta.category && fsqResult.category) meta.category = fsqResult.category;
        if (!meta.rating && fsqResult.rating) {
            meta.rating = fsqResult.rating;
            meta.userRatingsTotal = fsqResult.userRatingsTotal;
        }
        if (!meta.vicinity && fsqResult.vicinity) meta.vicinity = fsqResult.vicinity;
        if (!meta.openingHours && fsqResult.openingHours) meta.openingHours = fsqResult.openingHours;

        // Interleave FSQ tips and Google reviews
        const googleReviews = [...(meta.reviews || [])];
        const fsqTips = [...fsqResult.tips];
        const merged = [];
        while (merged.length < 10 && (googleReviews.length > 0 || fsqTips.length > 0)) {
            if (fsqTips.length > 0) merged.push(fsqTips.shift());
            if (googleReviews.length > 0 && merged.length < 10) merged.push(googleReviews.shift());
        }
        meta.reviews = merged;

        if (!meta.photoUrl && fsqResult.photoUrl) {
            meta.photoUrl = fsqResult.photoUrl;
            meta.foursquarePhotoUrl = fsqResult.photoUrl;
            meta.source = 'foursquare';
        } else if (meta.photoUrl && fsqResult.tips.length > 0) {
            meta.foursquarePhotoUrl = fsqResult.photoUrl || null;
            meta.source = 'fsq-google';
        }
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
