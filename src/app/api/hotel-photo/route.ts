import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

// ── In-memory cache (server-lifetime, per cold start) ─────────────────────────
const photoCache   = new Map<string, { url: string; expires: number }>();
// Track hosts that are currently returning errors so we skip the fetch entirely.
const failedHosts  = new Map<string, number>(); // hostname → expiry ms
const HOST_FAIL_MS = 2 * 60 * 1000; // 2 minutes

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
      signal: AbortSignal.timeout(2000),
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
    const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(2000) });
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
    return fallback ? proxyImage(fallback) : placeholderSvg();
  }

  // Serve from in-memory cache
  const cached = photoCache.get(query);
  if (cached && cached.expires > Date.now()) {
    return proxyImage(cached.url);
  }

  // Prefer the actual hotel photo; fall back to the supplied image, then picsum.
  const googleUrl = await fetchGooglePlacesPhoto(query);
  const photoUrl  = googleUrl
    ?? fallback
    ?? `https://fastly.picsum.photos/seed/${encodeURIComponent(query)}/800/600`;

  // Cache real Google Photos for 24 h; cache fallback for 5 min so we retry Google Places.
  const cacheTtl = googleUrl ? 86_400_000 : 5 * 60 * 1000;
  photoCache.set(query, { url: photoUrl, expires: Date.now() + cacheTtl });

  return proxyImage(photoUrl);
}

// ── Proxy the image bytes so the API key never reaches the browser ────────────
async function proxyImage(url: string): Promise<NextResponse> {
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* ignore */ }

  // Skip fetch entirely if this host recently failed — avoids waiting for a timeout.
  if (hostname && (failedHosts.get(hostname) ?? 0) > Date.now()) {
    return placeholderSvg();
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
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

  // Mark host as down for 2 minutes so subsequent requests skip the fetch.
  if (hostname) failedHosts.set(hostname, Date.now() + HOST_FAIL_MS);
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
