import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

// ── In-memory cache (server-lifetime, per cold start) ─────────────────────────
const photoCache = new Map<string, { url: string; expires: number }>();

// ── Google Places New API v1 — text search → first photo ──────────────────────
async function fetchGooglePlacesPhoto(query: string): Promise<string | null> {
  const key = env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;

  try {
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.photos',
      },
      body: JSON.stringify({ textQuery: query }),
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 },
    });

    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const photoName: string | undefined = data.places?.[0]?.photos?.[0]?.name;
    if (!photoName) return null;

    // Resolve photo resource name to a direct CDN URL
    const mediaUrl =
      `https://places.googleapis.com/v1/${photoName}/media` +
      `?maxWidthPx=800&skipHttpRedirect=true&key=${key}`;
    const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(6000) });
    if (!mediaRes.ok) return null;

    const { photoUri } = await mediaRes.json();
    return photoUri ?? null;
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const params   = new URL(req.url).searchParams;
  const query    = params.get('q')?.trim() ?? '';
  const fallback = params.get('fallback')?.trim() || '';

  if (!query) {
    return NextResponse.redirect(
      fallback || `https://picsum.photos/seed/hotel/800/600`,
    );
  }

  // Serve from in-memory cache
  const cached = photoCache.get(query);
  if (cached && cached.expires > Date.now()) {
    return proxyImage(cached.url);
  }

  // Prefer the actual hotel photo; fall back to the supplied image, then picsum.
  const photoUrl = await fetchGooglePlacesPhoto(query)
    ?? fallback
    ?? `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`;

  photoCache.set(query, { url: photoUrl, expires: Date.now() + 86_400_000 });

  return proxyImage(photoUrl);
}

// ── Proxy the image bytes so the API key never reaches the browser ────────────
async function proxyImage(url: string): Promise<NextResponse> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (res.ok) {
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (contentType.startsWith('image/')) {
        return new NextResponse(await res.arrayBuffer(), {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
          },
        });
      }
    }
  } catch { /* fall through */ }
  return NextResponse.redirect(url);
}
