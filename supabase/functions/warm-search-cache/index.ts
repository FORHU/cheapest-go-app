/**
 * warm-search-cache
 * Pre-warms the search_results_cache table for popular destinations.
 * Invoke via Supabase cron (pg_cron) once or twice daily.
 *
 * Cron setup (run once in SQL editor):
 *   select cron.schedule(
 *     'warm-search-cache',
 *     '0 1,13 * * *',   -- 01:00 and 13:00 UTC every day
 *     $$
 *       select net.http_post(
 *         url := 'https://<project-ref>.supabase.co/functions/v1/warm-search-cache',
 *         headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
 *       );
 *     $$
 *   );
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OTV_SUPPLIER    = 'OTV';
const OTV_CONTEXT     = 'OTV';
const OTV_ACCESS_CODE = '38327';
const ENDPOINT        = 'https://api.travelgate.com';
const ETG_API_BASE    = 'https://api.worldota.net';

// Popular destinations: { city, regionId, nationality, currency }
// regionId = 0 means resolve dynamically via ETG multicomplete at warm time.
const POPULAR_DESTINATIONS = [
  { city: 'Tokyo',         regionId: 3593,   nationality: 'KR', currency: 'USD' },
  { city: 'Seoul',         regionId: 3124,   nationality: 'KR', currency: 'USD' },
  { city: 'Bangkok',       regionId: 604,    nationality: 'KR', currency: 'USD' },
  { city: 'Bali',          regionId: 100012, nationality: 'KR', currency: 'USD' },
  { city: 'Singapore',     regionId: 1033,   nationality: 'KR', currency: 'USD' },
  { city: 'Osaka',         regionId: 3598,   nationality: 'KR', currency: 'USD' },
  { city: 'Kuala Lumpur',  regionId: 3324,   nationality: 'KR', currency: 'USD' },
  { city: 'Paris',         regionId: 2981,   nationality: 'KR', currency: 'USD' },
  { city: 'London',        regionId: 2114,   nationality: 'KR', currency: 'USD' },
  { city: 'Dubai',         regionId: 1403,   nationality: 'KR', currency: 'USD' },
  { city: 'Ho Chi Minh',   regionId: 3284,   nationality: 'KR', currency: 'USD' },
  { city: 'Taipei',        regionId: 3270,   nationality: 'KR', currency: 'USD' },
  { city: 'Manila',        regionId: 6139769,nationality: 'PH', currency: 'USD' },
  { city: 'Hong Kong',     regionId: 3285,   nationality: 'KR', currency: 'USD' },
  { city: 'Phuket',        regionId: 1476,   nationality: 'KR', currency: 'USD' },
  { city: 'Jeju',          regionId: 0,      nationality: 'KR', currency: 'USD' },
  { city: 'Busan',         regionId: 0,      nationality: 'KR', currency: 'USD' },
  { city: 'Cebu',          regionId: 0,      nationality: 'PH', currency: 'USD' },
  { city: 'Boracay',       regionId: 0,      nationality: 'PH', currency: 'USD' },
];

async function resolveRegionId(city: string, etgAuth: string, supabase: any): Promise<number> {
  const cityKey = city.toLowerCase().trim();

  // Check DB cache first
  try {
    const { data } = await supabase
      .from('dest_code_cache')
      .select('dest_codes')
      .eq('city_key', cityKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (data?.dest_codes?.[0]) {
      const id = parseInt(data.dest_codes[0], 10);
      if (id > 0) { console.log(`[Warm] Region DB cache hit for "${city}": ${id}`); return id; }
    }
  } catch {}

  // ETG multicomplete
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(`${ETG_API_BASE}/api/b2b/v3/search/multicomplete/`, {
        method:  'POST',
        headers: { 'Authorization': `Basic ${etgAuth}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: city, language: 'en', limit: 5 }),
        signal:  ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return 0;
    const json    = await res.json();
    const regions = json?.data?.regions as any[] || [];
    const match =
      regions.find(r => r.type === 'City' && r.name.toLowerCase() === cityKey) ||
      regions.find(r => r.type === 'City') ||
      regions[0];
    if (!match) return 0;
    const id = parseInt(match.id, 10);
    console.log(`[Warm] ETG multicomplete "${city}" → region_id=${id}`);

    // Persist to dest_code_cache
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await supabase.from('dest_code_cache').upsert(
      { city_key: cityKey, dest_codes: [String(id)], hotel_codes: [], fetched_at: new Date().toISOString(), expires_at: expiresAt },
      { onConflict: 'city_key' }
    ).catch(() => {});
    return id;
  } catch {
    return 0;
  }
}

// Generate 3 upcoming weekend date pairs (Fri→Sun) + 2 mid-week pairs
function getWarmDates(): Array<{ checkin: string; checkout: string }> {
  const dates: Array<{ checkin: string; checkout: string }> = [];
  const now = new Date();
  for (let week = 1; week <= 3; week++) {
    const friday = new Date(now);
    friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7) + (week - 1) * 7);
    if (friday <= now) friday.setDate(friday.getDate() + 7);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    dates.push({ checkin: fmt(friday), checkout: fmt(sunday) });
  }
  // Add next month mid-week
  const nextMonth = new Date(now);
  nextMonth.setMonth(now.getMonth() + 1);
  nextMonth.setDate(10);
  const nextMonthEnd = new Date(nextMonth);
  nextMonthEnd.setDate(13);
  dates.push({ checkin: fmt(nextMonth), checkout: fmt(nextMonthEnd) });
  return dates;
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

const SEARCH_QUERY = `
query ($criteriaSearch: HotelCriteriaSearchInput, $settings: HotelSettingsInput) {
  hotelX {
    search(criteria: $criteriaSearch, settings: $settings) {
      options {
        id hotelCode hotelName boardCode
        price { currency net gross }
        cancelPolicy { refundable cancelPenalties { deadline penaltyType currency value } }
        rooms { occupancyRefId code description }
      }
      errors { code description }
    }
  }
}`;

async function searchOTV(
  regionId: number,
  checkin: string,
  checkout: string,
  nationality: string,
  currency: string,
  apiKey: string,
  client: string
): Promise<any[]> {
  const occupancies = [{ paxes: [{ age: 30 }, { age: 30 }] }];
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Apikey ${apiKey}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          criteriaSearch: {
            checkIn: checkin, checkOut: checkout, occupancies,
            currency, nationality, markets: [nationality], language: 'en',
            destinations: [String(regionId)],
          },
          settings: {
            client, context: OTV_CONTEXT, testMode: false, timeout: 25000,
            suppliers: [{ code: OTV_SUPPLIER, accesses: [{ accessId: OTV_ACCESS_CODE }] }],
            plugins: [{
              step: 'REQUEST',
              pluginsType: { type: 'PRE_STEP', name: 'search_by_destination', parameters: [{ key: 'accessID', value: OTV_ACCESS_CODE }] },
            }],
          },
        },
      }),
    });
    if (!res.ok) { console.error(`[Warm] OTV HTTP ${res.status}`); return []; }
    const json = await res.json();
    return json?.data?.hotelX?.search?.options || [];
  } catch (e: any) {
    console.error('[Warm] OTV fetch error:', e.message);
    return [];
  }
}

async function fetchContentBatch(
  hotelCodes: string[],
  etgKeyId: string,
  etgApiKey: string,
  supabase: any
): Promise<Map<string, { name: string; images: string[]; lat: number; lng: number; starRating: number; city?: string; country?: string }>> {
  const map = new Map<string, any>();
  if (hotelCodes.length === 0) return map;

  // Check DB first
  const { data: cached } = await supabase
    .from('hotel_content')
    .select('hotel_id, name, images, lat, lng, star_rating, city, country')
    .in('hotel_id', hotelCodes)
    .gt('fetched_at', new Date(Date.now() - 90 * 86_400_000).toISOString());

  const found = new Set<string>();
  for (const row of (cached || []) as any[]) {
    if (row.images?.length > 0) {
      map.set(row.hotel_id, { name: row.name, images: row.images, lat: row.lat || 0, lng: row.lng || 0, starRating: row.star_rating || 0, city: row.city, country: row.country });
      found.add(row.hotel_id);
    }
  }

  // Fetch missing from ETG
  const missing = hotelCodes.filter(id => !found.has(id));
  if (missing.length === 0 || !etgKeyId || !etgApiKey) return map;

  const auth = btoa(`${etgKeyId}:${etgApiKey}`);
  const BATCH = 10;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(batch.map(async (hotelId) => {
      try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        let res: Response;
        try {
          res = await fetch(`${ETG_API_BASE}/api/b2b/v3/hotel/info/`, {
            method:  'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ hid: parseInt(hotelId, 10), language: 'en' }),
            signal:  ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) return;
        const data  = await res.json();
        const hotel = data?.data;
        if (!hotel) return;

        const rawImages: any[] = hotel.images_ext || hotel.images || [];
        const images = rawImages
          .map((img: any) => { const u = img.url || img.src || (typeof img === 'string' ? img : null); return u ? String(u).replace(/\{size\}/g, '640x400') : null; })
          .filter((u): u is string => !!u && u.startsWith('http'))
          .slice(0, 20);

        if (images.length === 0) return;
        map.set(hotelId, { name: hotel.name || `Hotel ${hotelId}`, images, lat: Number(hotel.latitude || 0), lng: Number(hotel.longitude || 0), starRating: Number(hotel.star_rating || 0), city: hotel.region?.name, country: hotel.region?.country_code });
      } catch { /* skip */ }
    }));
    if (i + BATCH < missing.length) await new Promise(r => setTimeout(r, 200));
  }

  return map;
}

function groupByHotel(options: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const opt of options) {
    if (!opt.hotelCode) continue;
    const existing = map.get(opt.hotelCode);
    if (!existing || (opt.price?.gross || 0) < (existing.price?.gross || Infinity)) {
      map.set(opt.hotelCode, opt);
    }
  }
  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const TRAVELGATEX_API_KEY = Deno.env.get('TRAVELGATEX_API_KEY') || '';
  const TRAVELGATEX_CLIENT  = Deno.env.get('TRAVELGATEX_CLIENT') || 'forhuinc';
  const ETG_KEY_ID  = Deno.env.get('ETG_KEY_ID')  || Deno.env.get('RATEHAWK_KEY_ID')  || '';
  const ETG_API_KEY = Deno.env.get('ETG_API_KEY') || Deno.env.get('RATEHAWK_API_KEY') || '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const body = await req.json().catch(() => ({}));
  const targetCity     = body.city     as string | undefined;
  const targetCheckin  = body.checkin  as string | undefined;
  const targetCheckout = body.checkout as string | undefined;

  const datePairs = (targetCheckin && targetCheckout)
    ? [{ checkin: targetCheckin, checkout: targetCheckout }]
    : getWarmDates();

  // Build destination list dynamically:
  // 1. Start with hardcoded popular destinations (have known regionIds)
  // 2. Add every city ever searched by users (stored in dest_code_cache)
  //    so the warm list grows automatically as users discover new places.
  const seenCities = new Set(POPULAR_DESTINATIONS.map(d => d.city.toLowerCase()));
  const destinations: Array<{ city: string; regionId: number; nationality: string; currency: string }> = [
    ...POPULAR_DESTINATIONS,
  ];

  if (!targetCity) {
    try {
      const { data: cachedCities } = await supabase
        .from('dest_code_cache')
        .select('city_key, dest_codes')
        .gt('expires_at', new Date().toISOString())
        .order('fetched_at', { ascending: false })
        .limit(500);

      for (const row of (cachedCities || []) as any[]) {
        const city = row.city_key as string;
        if (!city || seenCities.has(city)) continue;
        seenCities.add(city);
        const regionId = parseInt(row.dest_codes?.[0] || '0', 10);
        if (regionId > 0) {
          // Capitalise city name for display
          const cityDisplay = city.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          destinations.push({ city: cityDisplay, regionId, nationality: 'KR', currency: 'USD' });
        }
      }
      console.log(`[Warm] Total destinations to warm: ${destinations.length} (${POPULAR_DESTINATIONS.length} popular + ${destinations.length - POPULAR_DESTINATIONS.length} from user searches)`);
    } catch (e: any) {
      console.error('[Warm] Could not load dest_code_cache:', e.message);
    }
  }

  const results: string[] = [];
  let totalSaved = 0;

  const etgAuth = (ETG_KEY_ID && ETG_API_KEY) ? btoa(`${ETG_KEY_ID}:${ETG_API_KEY}`) : '';

  const activeDestinations = targetCity
    ? destinations.filter(d => d.city.toLowerCase() === targetCity.toLowerCase())
    : destinations;

  for (const dest of activeDestinations) {
    // Resolve region ID dynamically if not hardcoded
    let regionId = dest.regionId;
    if (regionId === 0) {
      if (!etgAuth) { results.push(`SKIP ${dest.city} — no ETG credentials for region resolution`); continue; }
      regionId = await resolveRegionId(dest.city, etgAuth, supabase);
      if (regionId === 0) { results.push(`SKIP ${dest.city} — could not resolve region_id`); continue; }
    }

    for (const { checkin, checkout } of datePairs) {
      const adults = 2; const children = 0; const rooms = 1;
      const { nationality, currency } = dest;

      const cacheKey = `${dest.city.toLowerCase()}|${checkin}|${checkout}|${adults}|${children}|${rooms}|${currency}|${nationality}`;

      // Skip if already cached and fresh (< 6 hours old)
      const { data: existing } = await supabase
        .from('search_results_cache')
        .select('cached_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existing) {
        console.log(`[Warm] SKIP ${dest.city} ${checkin} — still fresh`);
        results.push(`SKIP ${dest.city} ${checkin}`);
        continue;
      }

      console.log(`[Warm] Searching OTV: ${dest.city} (region ${regionId}) ${checkin}→${checkout}`);
      const t0      = Date.now();
      const options = await searchOTV(regionId, checkin, checkout, nationality, currency, TRAVELGATEX_API_KEY, TRAVELGATEX_CLIENT);

      if (options.length === 0) {
        results.push(`EMPTY ${dest.city} ${checkin}`);
        continue;
      }

      const hotelMap     = groupByHotel(options);
      const uniqueCodes  = Array.from(hotelMap.keys());
      const contentMap   = await fetchContentBatch(uniqueCodes, ETG_KEY_ID, ETG_API_KEY, supabase);

      const hotels = Array.from(hotelMap.values())
        .map(opt => {
          const c = contentMap.get(opt.hotelCode);
          if (!c?.images?.length) return null;
          return {
            hotelId:   opt.hotelCode,
            name:      c.name || opt.hotelName || `Hotel ${opt.hotelCode}`,
            location:  dest.city,
            price:     opt.price?.gross || opt.price?.net || 0,
            currency:  opt.price?.currency || currency,
            image:     c.images[0],
            images:    c.images,
            coordinates: { lat: c.lat, lng: c.lng },
            starRating:  c.starRating,
            rating:      0,
            city:        c.city,
            country:     c.country,
            refundableTag: opt.cancelPolicy?.refundable ? 'RFN' : 'NRFN',
            _tgx: { optionId: opt.id },
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a.price || 0) - (b.price || 0));

      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h
      const { error } = await supabase.from('search_results_cache').upsert({
        cache_key: cacheKey, city_name: dest.city, region_id: regionId,
        checkin, checkout, adults, children, rooms, currency, nationality,
        hotels, total_count: hotels.length,
        cached_at: new Date().toISOString(), expires_at: expiresAt,
      }, { onConflict: 'cache_key' });

      const elapsed = Date.now() - t0;
      if (error) {
        console.error(`[Warm] DB save error for ${dest.city}:`, error.message);
        results.push(`ERROR ${dest.city} ${checkin}: ${error.message}`);
      } else {
        totalSaved += hotels.length;
        console.log(`[Warm] Saved ${hotels.length} hotels for ${dest.city} ${checkin} in ${elapsed}ms`);
        results.push(`OK ${dest.city} ${checkin}: ${hotels.length} hotels (${elapsed}ms)`);
      }

      // Brief pause between destinations to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return new Response(JSON.stringify({ ok: true, totalSaved, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
