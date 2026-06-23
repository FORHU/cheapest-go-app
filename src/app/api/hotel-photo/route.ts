import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

// ── In-memory cache (server-lifetime, per cold start) ─────────────────────────
const photoCache = new Map<string, { url: string; expires: number }>();

// ── Google Places Legacy API ──────────────────────────────────────────────────
async function fetchGooglePlacesPhoto(query: string): Promise<string | null> {
  const key = env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;

  try {
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(query)}&key=${key}`;

    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) {
      console.error(`[hotel-photo] Places search failed: HTTP ${searchRes.status} for "${query}"`);
      return null;
    }

    const data = await searchRes.json();
    if (data.status !== 'OK') {
      console.warn(`[hotel-photo] Places status "${data.status}" for "${query}"`);
      return null;
    }

    const photoRef: string | undefined = data.results?.[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) return null;

    return (
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${key}`
    );
  } catch (err: any) {
    console.error(`[hotel-photo] Places fetch threw: ${err?.message}`);
    return null;
  }
}

// ── Wikimedia — generator=search returns photo in one API call ───────────────
async function fetchWikimediaPhoto(query: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '1',
      prop: 'pageimages',
      pithumbsize: '800',
      format: 'json',
      origin: '*',
    });

    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'cheapestgo-app/1.0 (travel booking app)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    const page = Object.values(pages as Record<string, any>)[0] as any;
    const url: string | undefined = page?.thumbnail?.source;
    if (!url) return null;

    return url.replace(/\/\d+px-/, '/800px-');
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
    return fallback ? proxyImage(fallback) : placeholderSvg();
  }

  // Serve from in-memory cache
  const cached = photoCache.get(query);
  if (cached && cached.expires > Date.now()) {
    return cached.url ? proxyImage(cached.url) : placeholderSvg();
  }

  // 1. Try Google Places
  let photoUrl = await fetchGooglePlacesPhoto(query);

  // 2. Fall back to Wikimedia
  if (!photoUrl) {
    photoUrl = await fetchWikimediaPhoto(query);
  }

  // 3. Fall back to caller-supplied URL
  if (!photoUrl && fallback) {
    photoUrl = fallback;
  }

  const cacheTtl = photoUrl ? 86_400_000 : 5 * 60 * 1000;
  photoCache.set(query, { url: photoUrl ?? '', expires: Date.now() + cacheTtl });

  return photoUrl ? proxyImage(photoUrl) : placeholderSvg();
}

// ── Proxy the image bytes so credentials never reach the browser ───────────────
async function proxyImage(url: string): Promise<NextResponse> {
  if (!url) return placeholderSvg();

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

  return placeholderSvg();
}

function placeholderSvg(): NextResponse {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#1e293b"/>
  <rect x="320" y="220" width="160" height="120" rx="12" fill="#334155"/>
  <circle cx="400" cy="200" r="40" fill="#334155"/>
  <rect x="360" y="270" width="80" height="50" rx="4" fill="#475569"/>
  <circle cx="370" cy="260" r="12" fill="#64748b"/>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
