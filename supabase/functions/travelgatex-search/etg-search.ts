const ETG_API_BASE = 'https://api.worldota.net';

// Module-level cache for hotel/info responses — survives across requests in the same Deno process.
// Avoids repeated API calls for the same hotel and prevents rate-limit (429) cascades.
const hotelInfoCache = new Map<number, { content: any; expiresAt: number }>();
const INFO_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface ETGHotel {
  id: string;
  name: string;
  lat: number;
  lng: number;
  images: string[];
  starRating: number;
  address: string;
  description: string;
  price: number;
  currency: string;
  isRefundable: boolean;
  matchHash: string;
  meal: string;
}

export interface ETGSearchParams {
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  childrenAges: number[];
  rooms: number;
  currency: string;
  nationality: string;
}

function buildGuests(params: ETGSearchParams) {
  const ages = params.childrenAges.length > 0 ? params.childrenAges
    : params.children > 0 ? Array(params.children).fill(10) : [];
  const adultsPerRoom = Math.ceil(params.adults / params.rooms);
  const agesPerRoom   = Math.ceil(ages.length / params.rooms);
  return Array.from({ length: params.rooms }, (_, i) => ({
    adults: Math.max(adultsPerRoom, 1),
    children: ages.slice(i * agesPerRoom, (i + 1) * agesPerRoom).map(age => ({ age })),
  }));
}

// Look up an ETG region_id using a known hotel HID (numeric, from TGX match)
async function getRegionIdFromHotelInfo(hid: string, auth: string): Promise<number | null> {
  try {
    const fetchP = fetch(`${ETG_API_BASE}/api/b2b/v3/hotel/info/`, {
      method:  'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hid: parseInt(hid, 10), language: 'en' }),
    }).catch(() => null);
    const timeoutP = new Promise<null>(r => setTimeout(() => r(null), 5000));
    const res = await Promise.race([fetchP, timeoutP]);
    if (!res || !res.ok) return null;
    const json = await res.json();
    const d    = json?.data;
    if (!d) return null;
    console.log(`[ETG Bootstrap] hid=${hid} all keys: ${Object.keys(d).join(', ')}`);
    const regionId = d.region_id ?? d.region?.id ?? d.city_id ?? d.city?.region_id ?? null;
    console.log(`[ETG Bootstrap] hid=${hid} → region_id=${regionId}`);
    return regionId !== null && regionId !== undefined ? Number(regionId) : null;
  } catch (e) {
    console.error('[ETG Bootstrap] hotel info error:', e);
    return null;
  }
}

// The path-based URL /serp/region/{id}/ returns 404 for this account.
// Only the body-param form /serp/region/ with region_id in body works (but is intermittent).
// Retry once on failure.
async function searchByRegionId(
  regionId: number, params: ETGSearchParams, guests: any[], auth: string
): Promise<any[]> {
  const body = {
    checkin:   params.checkin,
    checkout:  params.checkout,
    residency: params.nationality.toLowerCase(),
    language:  'en',
    guests,
    currency:  params.currency,
    region_id: regionId,
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const fetchP = fetch(`${ETG_API_BASE}/api/b2b/v3/search/serp/region/`, {
      method:  'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }).catch((e: any) => {
      console.error(`[ETG RegionSearch] attempt=${attempt} fetch error: ${e.message}`);
      return null;
    });
    const timeoutP = new Promise<null>(r => setTimeout(() => {
      console.error(`[ETG RegionSearch] attempt=${attempt} 10s timeout`);
      r(null);
    }, 10000));
    const res = await Promise.race([fetchP, timeoutP]);
    if (!res) continue;
    const text = await res.text();
    if (!res.ok) {
      console.error(`[ETG HotelSearch] attempt=${attempt} HTTP ${res.status}: ${text.substring(0, 200)}`);
      continue;
    }
    const json = JSON.parse(text);
    const hotels = json?.data?.hotels ?? json?.data ?? [];
    const list = Array.isArray(hotels) ? hotels : [];
    console.log(`[ETG HotelSearch] attempt=${attempt} 200 region=${regionId}: ${list.length} hotels`);
    if (list.length > 0) return list;
  }
  return [];
}

async function searchByGeo(
  lat: number, lng: number, radiusKm: number,
  params: ETGSearchParams, guests: any[], auth: string
): Promise<any[]> {
  const body = {
    checkin:   params.checkin,
    checkout:  params.checkout,
    residency: params.nationality.toLowerCase(),
    language:  'en',
    guests,
    currency:  params.currency,
    latitude:  lat,
    longitude: lng,
    radius:    radiusKm,
  };

  // Promise.race timeout — AbortController may not reliably interrupt in all runtimes
  const fetchPromise = fetch(`${ETG_API_BASE}/api/b2b/v3/search/serp/geo/`, {
    method:  'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }).then(async res => {
    const text = await res.text();
    if (!res.ok) {
      console.error(`[ETG GeoSearch] HTTP ${res.status}: ${text.substring(0, 300)}`);
      return [] as any[];
    }
    const json = JSON.parse(text);
    console.log(`[ETG GeoSearch] 200 lat=${lat} lng=${lng}: ${text.substring(0, 400)}`);
    const hotels = json?.data?.hotels ?? json?.data ?? [];
    return Array.isArray(hotels) ? hotels as any[] : [] as any[];
  }).catch((e: any) => {
    console.error(`[ETG GeoSearch] fetch error: ${e.message}`);
    return [] as any[];
  });

  const timeoutPromise = new Promise<any[]>(resolve =>
    setTimeout(() => { console.error('[ETG GeoSearch] 10s timeout'); resolve([]); }, 10000)
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

function slugToTitle(slug: string): string {
  return slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Fetch hotel/info content for a single raw hotel object.
 * Checks hotelInfoCache first, retries once on HTTP 429.
 * Returns { key, content } on success, null on any failure.
 */
async function fetchHotelInfoContent(h: any, auth: string): Promise<{ key: string; content: any } | null> {
  const key = String(h.id);
  const hid = h.hid ?? (typeof h.id === 'number' ? h.id : parseInt(h.id, 10));
  if (!hid || isNaN(hid)) return null;

  // Check module-level cache first — avoids re-fetching across requests
  const cached = hotelInfoCache.get(hid);
  if (cached && Date.now() < cached.expiresAt) {
    return { key, content: cached.content };
  }

  const doFetch = (): Promise<Response | null> => {
    const fetchP = fetch(`${ETG_API_BASE}/api/b2b/v3/hotel/info/`, {
      method:  'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hid, language: 'en' }),
    }).catch(() => null);
    const timeoutP = new Promise<null>(r => setTimeout(() => r(null), 2000));
    return Promise.race([fetchP, timeoutP]);
  };
  const tryFetch = async (): Promise<Response | null> => {
    const res = await doFetch();
    if (!res) return null;
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 500));
      return doFetch();
    }
    return res;
  };

  try {
    const res = await tryFetch();
    if (!res || !res.ok) return null;
    const json = await res.json();
    const d    = json?.data;
    if (!d) return null;

    const rawImages: any[] = d.images || d.images_ext || d.photos || [];
    const images = rawImages
      .map((img: any) => {
        const raw = img.src || img.url || (typeof img === 'string' ? img : null);
        if (!raw || typeof raw !== 'string') return null;
        return raw.replace(/\{size\}/g, '640x400');
      })
      .filter((u): u is string => !!u && u.startsWith('http'))
      .slice(0, 20);

    const desc = d.description || d.descriptions || d.description_struct;
    let description = '';
    if (Array.isArray(desc)) description = desc.map((s: any) => s?.paragraphs?.join(' ') || '').join(' ');
    else if (typeof desc === 'object' && desc !== null) description = desc?.en || (Object.values(desc)[0] as string) || '';
    else if (typeof desc === 'string') description = desc;

    const content = {
      name:       d.name || slugToTitle(key),
      lat:        Number(d.latitude  || d.coords?.lat || 0),
      lng:        Number(d.longitude || d.coords?.lon || 0),
      images,
      starRating: Number(d.star_rating || d.stars || 0),
      address:    typeof d.address === 'string' ? d.address : (d.address?.street || ''),
      description,
    };
    hotelInfoCache.set(hid, { content, expiresAt: Date.now() + INFO_CACHE_TTL });
    return { key, content };
  } catch {
    return null;
  }
}


function extractPrice(rate: any): number {
  // payment_options format (used in some ETG responses)
  const payType = rate.payment_options?.payment_types?.[0];
  if (payType) {
    const v = parseFloat(payType.show_amount || payType.amount || '0');
    if (v > 0) return v;
  }
  // daily_prices format (used in SERP responses) — sum all nights
  if (Array.isArray(rate.daily_prices) && rate.daily_prices.length > 0) {
    const total = rate.daily_prices.reduce((s: number, p: any) => {
      const v = parseFloat(String(p ?? 0));
      return s + (isNaN(v) ? 0 : v);
    }, 0);
    if (total > 0 && isFinite(total)) return total;
  }
  // flat price field
  const flat = rate.price?.amount || rate.amount;
  if (flat) {
    const v = parseFloat(flat);
    if (v > 0) return v;
  }
  return 0;
}

function extractCurrency(rate: any, fallback: string): string {
  return rate.payment_options?.payment_types?.[0]?.currency_code
    || rate.price?.currency
    || rate.currency
    || fallback;
}

function parseETGHotels(
  rawHotels: any[], contentMap: Map<string, any>, params: ETGSearchParams,
  existingEtgHids: Set<string>
): ETGHotel[] {
  let noRate = 0, badPrice = 0, noHash = 0, dupes = 0;
  const deduped = rawHotels.filter(h => {
    if (existingEtgHids.has(String(h.id))) { dupes++; return false; }
    return true;
  });
  const result = deduped
    .map(h => {
      const id   = String(h.id);
      const rate = h.rates?.[0];
      if (!rate) { noRate++; return null; }
      const price = extractPrice(rate);
      if (price <= 0 || !isFinite(price)) { badPrice++; return null; }
      if (!rate.match_hash) { noHash++; return null; }
      const c = contentMap.get(id) || {};
      return {
        id,
        name:        c.name || slugToTitle(id),
        lat:         c.lat  || 0,
        lng:         c.lng  || 0,
        images:      c.images     || [],
        starRating:  c.starRating || 0,
        address:     c.address    || '',
        description: c.description || '',
        price,
        currency:    extractCurrency(rate, params.currency),
        isRefundable: !rate.cancel_penalties?.length,
        matchHash:    rate.match_hash,
        meal:         rate.meal || '',
      } as ETGHotel;
    })
    .filter((h): h is ETGHotel => h !== null);
  console.log(`[ETG Parse] raw=${rawHotels.length} dupes=${dupes} noRate=${noRate} badPrice=${badPrice} noHash=${noHash} ok=${result.length}`);
  return result;
}

/**
 * Internal async generator: processes raw SERP hotels in batches of 5,
 * fetching hotel/info content in parallel and yielding parsed ETGHotel batches.
 */
async function* streamHotelContent(
  rawHotels: any[],
  params: ETGSearchParams,
  auth: string,
  existingEtgHids: Set<string>
): AsyncGenerator<ETGHotel[]> {
  const BATCH = 15;
  const DELAY = 50;

  for (let i = 0; i < rawHotels.length; i += BATCH) {
    const batchRaw = rawHotels.slice(i, i + BATCH);
    const results = await Promise.all(batchRaw.map(h => fetchHotelInfoContent(h, auth)));
    const contentMap = new Map<string, any>();
    for (const r of results) {
      if (r) contentMap.set(r.key, r.content);
    }

    const parsed = parseETGHotels(batchRaw, contentMap, params, existingEtgHids);
    // Add parsed IDs to existingEtgHids so subsequent batches deduplicate correctly
    for (const h of parsed) existingEtgHids.add(h.id);

    if (parsed.length > 0) yield parsed;

    if (i + BATCH < rawHotels.length) await new Promise(r => setTimeout(r, DELAY));
  }
}

/**
 * Streaming ETG search by lat/lng — yields batches of ETGHotel[] as content is fetched.
 */
export async function* streamETGByGeo(
  lat: number,
  lng: number,
  params: ETGSearchParams,
  etgKeyId: string,
  etgApiKey: string,
  existingEtgHids: Set<string> = new Set()
): AsyncGenerator<ETGHotel[]> {
  if (!etgKeyId || !etgApiKey) return;

  const auth   = btoa(`${etgKeyId}:${etgApiKey}`);
  const guests = buildGuests(params);
  const t0     = Date.now();

  const rawHotels = await searchByGeo(lat, lng, 30, params, guests, auth);
  console.log(`[ETG GeoSearch] ${rawHotels.length} raw hotels in ${Date.now() - t0}ms`);
  if (rawHotels.length === 0) return;

  // No cap — the 20s task deadline in index.ts breaks the for-await loop when time is up.
  // hotelInfoCache means repeat searches are instant; only cold searches hit the deadline.
  yield* streamHotelContent(rawHotels, params, auth, existingEtgHids);
}

/**
 * Streaming ETG search bootstrapped from a known ETG hotel HID.
 * Calls hotel/info/ to get region_id, then SERP for full region availability,
 * yielding batches of ETGHotel[] as content is fetched.
 */
export async function* streamETGFromHint(
  hintHid: string,
  params: ETGSearchParams,
  etgKeyId: string,
  etgApiKey: string,
  existingEtgHids: Set<string> = new Set()
): AsyncGenerator<ETGHotel[]> {
  if (!etgKeyId || !etgApiKey || !hintHid) return;

  const auth   = btoa(`${etgKeyId}:${etgApiKey}`);
  const guests = buildGuests(params);
  const t0     = Date.now();

  const regionId = await getRegionIdFromHotelInfo(hintHid, auth);
  if (!regionId) {
    console.log(`[ETG Bootstrap] No region_id from hid=${hintHid} — skipping ETG`);
    return;
  }

  const rawHotels = await searchByRegionId(regionId, params, guests, auth);
  console.log(`[ETG Bootstrap] ${rawHotels.length} raw hotels for region ${regionId} in ${Date.now() - t0}ms`);
  if (rawHotels.length === 0) return;

  yield* streamHotelContent(rawHotels, params, auth, existingEtgHids);
}

/**
 * ETG search bootstrapped from a known ETG hotel HID (numeric, extracted from a TGX result).
 * Calls hotel/info/ to get region_id, then SERP for full region availability.
 */
export async function searchETGFromHint(
  hintHid: string,
  params: ETGSearchParams,
  etgKeyId: string,
  etgApiKey: string,
  existingEtgHids: Set<string> = new Set()
): Promise<ETGHotel[]> {
  const result: ETGHotel[] = [];
  for await (const batch of streamETGFromHint(hintHid, params, etgKeyId, etgApiKey, existingEtgHids)) {
    result.push(...batch);
  }
  console.log(`[ETG Bootstrap] ${result.length} final hotels after dedup+parse`);
  return result;
}

/**
 * ETG search by lat/lng — uses the SERP geo endpoint.
 * Used when TGX returns no ETG HIDs but we have city center coordinates.
 */
export async function searchETGByGeo(
  lat: number,
  lng: number,
  params: ETGSearchParams,
  etgKeyId: string,
  etgApiKey: string,
  existingEtgHids: Set<string> = new Set()
): Promise<ETGHotel[]> {
  const result: ETGHotel[] = [];
  for await (const batch of streamETGByGeo(lat, lng, params, etgKeyId, etgApiKey, existingEtgHids)) {
    result.push(...batch);
  }
  console.log(`[ETG GeoSearch] ${result.length} final hotels after dedup+parse`);
  return result;
}

/**
 * ETG search by city name — region lookup APIs unavailable for this account.
 * Use searchETGFromHint or searchETGByGeo instead.
 */
export async function searchETG(
  _cityName: string,
  _params: ETGSearchParams,
  _etgKeyId: string,
  _etgApiKey: string,
  _existingEtgHids: Set<string> = new Set()
): Promise<ETGHotel[]> {
  return [];
}
