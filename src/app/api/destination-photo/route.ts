import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { IATA_TO_SLUG } from '@/lib/destination-images';

// ── IATA → Google Places search query ────────────────────────────────────────
const PLACE_QUERIES: Record<string, string> = {
  HKG: 'Hong Kong Victoria Harbour skyline',
  SIN: 'Singapore Marina Bay Sands skyline',
  ICN: 'Seoul Gyeongbokgung Palace South Korea',
  GMP: 'Seoul South Korea cityscape',
  KIX: 'Osaka Castle Japan',
  NRT: 'Tokyo Japan Shinjuku skyline',
  HND: 'Tokyo Japan cityscape',
  BKK: 'Bangkok Wat Phra Kaew Thailand',
  DMK: 'Bangkok Thailand landmark',
  KUL: 'Kuala Lumpur Petronas Towers Malaysia',
  MNL: 'Manila Philippines skyline',
  CEB: 'Cebu City Philippines',
  CRK: 'Clark Pampanga Philippines',
  DVO: 'Davao City Philippines',
  ILO: 'Iloilo City Philippines',
  KLO: 'Boracay Philippines beach',
  PPS: 'Puerto Princesa Palawan Philippines',
  DXB: 'Dubai Burj Khalifa skyline UAE',
  AUH: 'Abu Dhabi Sheikh Zayed Grand Mosque UAE',
  DOH: 'Doha Qatar Museum of Islamic Art',
  KWI: 'Kuwait Towers Kuwait City',
  RUH: 'Riyadh Saudi Arabia skyline',
  JED: 'Jeddah Saudi Arabia',
  MCT: 'Sultan Qaboos Grand Mosque Muscat Oman',
  SYD: 'Sydney Opera House Australia',
  MEL: 'Melbourne Australia skyline',
  LHR: 'London Big Ben United Kingdom',
  LGW: 'London cityscape United Kingdom',
  CDG: 'Paris Eiffel Tower France',
  ORY: 'Paris France landmark',
  FRA: 'Frankfurt Germany skyline',
  AMS: 'Amsterdam Netherlands canal',
  JFK: 'New York Times Square USA',
  EWR: 'New York City USA skyline',
  LAX: 'Los Angeles California USA',
  SFO: 'San Francisco Golden Gate Bridge',
  ORD: 'Chicago Illinois skyline USA',
  YYZ: 'Toronto Canada skyline',
  YVR: 'Vancouver Canada mountains',
  GUM: 'Guam beach tropical island',
  TPE: 'Taipei 101 Taiwan',
  PEK: 'Beijing Forbidden City China',
  PKX: 'Beijing China skyline',
  PVG: 'Shanghai China Pudong skyline',
  SHA: 'Shanghai China landmark',
  CGK: 'Jakarta Indonesia skyline',
  SGN: 'Ho Chi Minh City Vietnam',
  HAN: 'Hanoi Vietnam Old Quarter',
  DEL: 'New Delhi India Red Fort',
  BOM: 'Mumbai India Gateway of India',
  CMB: 'Colombo Sri Lanka',
  NAN: 'Fiji island tropical beach',
  GVA: 'Geneva Switzerland lake',
  ZRH: 'Zurich Switzerland skyline',
  BCN: 'Barcelona Sagrada Familia Spain',
  MAD: 'Madrid Spain Royal Palace',
  FCO: 'Rome Colosseum Italy',
  MXP: 'Milan Italy Duomo cathedral',
  IST: 'Istanbul Hagia Sophia Turkey',
  NBO: 'Nairobi Kenya skyline',
  ADD: 'Addis Ababa Ethiopia',
  MFM: 'Macau Ruins of St Pauls',
  NGO: 'Nagoya Castle Japan',
  OKA: 'Okinawa Japan beach',
  CTS: 'Sapporo Japan',
  FUK: 'Fukuoka Japan',
  MEX: 'Mexico City Zocalo',
  GRU: 'São Paulo Brazil skyline',
  EZE: 'Buenos Aires Argentina',
  SCL: 'Santiago Chile Andes',
  BOG: 'Bogota Colombia',
};

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
      console.error(`[destination-photo] Places search failed: HTTP ${searchRes.status} for "${query}"`);
      return null;
    }

    const data = await searchRes.json();
    if (data.status !== 'OK') {
      console.warn(`[destination-photo] Places status "${data.status}" for "${query}"`);
      return null;
    }

    const photoRef: string | undefined = data.results?.[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) return null;

    return (
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${key}`
    );
  } catch (err: any) {
    console.error(`[destination-photo] Places fetch threw: ${err?.message}`);
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
  const iata  = new URL(req.url).searchParams.get('iata')?.toUpperCase() ?? '';

  // Serve local static image if we have one downloaded
  const slug = IATA_TO_SLUG[iata];
  if (slug) {
    return NextResponse.redirect(new URL(`/images/destinations/${slug}.jpg`, req.url));
  }

  const query = PLACE_QUERIES[iata];
  if (!query) {
    return placeholderSvg();
  }

  // Serve from in-memory cache
  const cached = photoCache.get(iata);
  if (cached && cached.expires > Date.now()) {
    return cached.url ? proxyImage(cached.url) : placeholderSvg();
  }

  // 1. Try Google Places
  let photoUrl = await fetchGooglePlacesPhoto(query);

  // 2. Fall back to Wikimedia
  if (!photoUrl) {
    photoUrl = await fetchWikimediaPhoto(query);
  }

  const cacheTtl = photoUrl ? 86_400_000 : 5 * 60_000;
  photoCache.set(iata, { url: photoUrl ?? '', expires: Date.now() + cacheTtl });

  return photoUrl ? proxyImage(photoUrl) : placeholderSvg();
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
