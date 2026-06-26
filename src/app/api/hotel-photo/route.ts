import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

// ── In-memory cache (server-lifetime, per cold start) ─────────────────────────
const photoCache = new Map<string, { url: string; expires: number }>();

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

  if (!hotelCode) return placeholderSvg();

  const cached = photoCache.get(hotelCode);
  if (cached && cached.expires > Date.now()) {
    return cached.url ? proxyImage(cached.url) : placeholderSvg();
  }

  let photoUrl: string | null = null;

  // 1. hotel_content DB (previously fetched OTV/ETG data)
  photoUrl = await fetchFromDb(hotelCode);

  // 2. ETG hotel/info API
  if (!photoUrl) photoUrl = await fetchFromEtg(hotelCode);

  // 3. OTV via TGX GraphQL
  if (!photoUrl) photoUrl = await fetchFromOtv(hotelCode);

  const cacheTtl = photoUrl ? 86_400_000 : 5 * 60 * 1000;
  photoCache.set(hotelCode, { url: photoUrl ?? '', expires: Date.now() + cacheTtl });

  return photoUrl ? proxyImage(photoUrl) : placeholderSvg();
}

// ── Proxy image bytes so API keys never reach the browser ─────────────────────
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
