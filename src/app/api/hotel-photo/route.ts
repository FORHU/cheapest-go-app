import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

// ── In-memory cache (server-lifetime, per cold start) ─────────────────────────
// Holds the decoded image bytes, not the provider URL. Caching only the URL
// meant every request re-downloaded ~250 KB from the provider CDN; a landing
// screen renders ~20 cards at once, so that was ~5 MB per render.
type CachedPhoto = {
  body: Buffer | null;      // null → lookup failed; serve the placeholder
  contentType: string;
  expires: number;
};

const photoCache = new Map<string, CachedPhoto>();
let cacheBytes = 0;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

const PHOTO_TTL_MS = 86_400_000;
const MISS_TTL_MS = 5 * 60 * 1000;

// ── 1. hotel_content DB lookup ────────────────────────────────────────────────
async function fetchFromDb(hotelCode: string): Promise<string | null> {
  try {
    const sql = getSqlAdmin();
    const rows = await sql`
      SELECT images[1] AS first_image
      FROM hotel_content
      WHERE hotel_id = ${hotelCode}
        AND array_length(images, 1) > 0
      LIMIT 1
    `;
    const url = rows[0]?.first_image as string | undefined;
    return url ? url.replace('{size}', '640x400') : null;
  } catch {
    return null;
  }
}

// ── 2. ETG (WorldOTA / RateHawk) hotel/info API ───────────────────────────────
async function fetchFromEtg(hotelCode: string): Promise<string | null> {
  const keyId  = process.env.ETG_KEY_ID;
  const apiKey = process.env.ETG_API_KEY;
  if (!keyId || !apiKey) return null;
  const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
  try {
    const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: hotelCode, language: 'en' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const info = json?.data ?? null;
    if (!info) return null;
    const images: string[] = (info.images ?? [])
      .map((u: string) => (typeof u === 'string' ? u.replace('{size}', '640x400') : ''))
      .filter(Boolean);
    if (!images[0]) return null;
    backfillToDb(hotelCode, images).catch(() => {});
    return images[0];
  } catch {
    return null;
  }
}

// ── 3. OTV via TGX GraphQL (single hotel by code) ────────────────────────────
async function fetchFromOtv(hotelCode: string): Promise<string | null> {
  try {
    const cfg = getTgxConfig();
    const result = await tgxGraphQL(
      `query OtvHotelPhoto($criteria: HotelXHotelListInput!) {
         hotelX {
           hotels(criteria: $criteria) {
             edges {
               node {
                 hotelData {
                   code
                   medias { url type }
                 }
               }
             }
           }
         }
       }`,
      { criteria: { access: cfg.accessCode, hotelCodes: [hotelCode] } }
    );
    const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
    for (const e of edges) {
      const medias: any[] = e?.node?.hotelData?.medias ?? [];
      const url = medias[0]?.url as string | undefined;
      if (url) {
        backfillToDb(hotelCode, [url]).catch(() => {});
        return url;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Backfill found images to hotel_content for future DB hits ─────────────────
async function backfillToDb(hotelCode: string, images: string[]): Promise<void> {
  try {
    const sql = getSqlAdmin();
    await sql`
      INSERT INTO hotel_content (hotel_id, name, images, content_source, fetched_at)
      VALUES (${hotelCode}, ${hotelCode}, ${sql.array(images)}, 'etg', now())
      ON CONFLICT (hotel_id) DO UPDATE SET
        images     = CASE WHEN array_length(hotel_content.images, 1) > 0
                     THEN hotel_content.images ELSE EXCLUDED.images END,
        fetched_at = now()
    `;
  } catch { /* ignore */ }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const hotelCode = new URL(req.url).searchParams.get('hotelCode')?.trim() || '';

  if (!hotelCode) return placeholderImage();

  const cached = photoCache.get(hotelCode);
  if (cached && cached.expires > Date.now()) {
    return cached.body ? imageResponse(cached.body, cached.contentType) : placeholderImage();
  }

  let photoUrl: string | null = null;

  // 1. hotel_content DB (previously fetched OTV/ETG data)
  photoUrl = await fetchFromDb(hotelCode);

  // 2. ETG hotel/info API
  if (!photoUrl) photoUrl = await fetchFromEtg(hotelCode);

  // 3. OTV via TGX GraphQL
  if (!photoUrl) photoUrl = await fetchFromOtv(hotelCode);

  const fetched = photoUrl ? await fetchImageBytes(photoUrl) : null;
  rememberPhoto(hotelCode, fetched);

  return fetched ? imageResponse(fetched.body, fetched.contentType) : placeholderImage();
}

/** Store the bytes, evicting oldest-first once the budget is exceeded. */
function rememberPhoto(hotelCode: string, fetched: FetchedImage | null): void {
  const previous = photoCache.get(hotelCode);
  if (previous?.body) cacheBytes -= previous.body.byteLength;

  if (fetched) cacheBytes += fetched.body.byteLength;
  photoCache.set(hotelCode, {
    body: fetched?.body ?? null,
    contentType: fetched?.contentType ?? '',
    expires: Date.now() + (fetched ? PHOTO_TTL_MS : MISS_TTL_MS),
  });

  // Map iterates in insertion order, so the first key is the oldest.
  for (const key of photoCache.keys()) {
    if (cacheBytes <= MAX_CACHE_BYTES) break;
    if (key === hotelCode) continue;
    cacheBytes -= photoCache.get(key)?.body?.byteLength ?? 0;
    photoCache.delete(key);
  }
}

// ── Download image bytes so API keys never reach the browser ──────────────────
type FetchedImage = { body: Buffer; contentType: string };

async function fetchImageBytes(url: string): Promise<FetchedImage | null> {
  if (!url) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    return { body: Buffer.from(await res.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}

/**
 * Copy the cached bytes into each response. Handing the cached Buffer straight
 * to NextResponse would let a consumed body invalidate the cache entry.
 * Content-Length matters: without it the response is chunked, and React
 * Native's native image loader is happier with a declared length.
 */
function imageResponse(body: Buffer, contentType: string): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
    },
  });
}

// PNG, not SVG: Android's Fresco cannot decode SVG, so an SVG placeholder
// renders as a blank card rather than as a placeholder.
const PLACEHOLDER_PNG = readFileSync(
  path.join(process.cwd(), 'public', 'hotel-placeholder.png')
);

function placeholderImage(): NextResponse {
  return new NextResponse(new Uint8Array(PLACEHOLDER_PNG), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PLACEHOLDER_PNG.byteLength),
      'Cache-Control': 'public, max-age=60',
    },
  });
}

