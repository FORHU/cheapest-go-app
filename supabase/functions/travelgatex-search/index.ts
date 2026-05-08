import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── In-Memory Cache ─────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: any; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, 60_000);

function getCacheKey(params: Record<string, any>): string {
  const keys = Object.keys(params).sort();
  return keys.map(k => `${k}:${JSON.stringify(params[k])}`).join('|');
}

function getFromCache(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Destination resolver ─────────────────────────────────────────
const DESTINATION_SEARCH_QUERY = `
query DestinationSearcher($criteria: HotelXDestinationSearcherInput!) {
  hotelX {
    destinationSearcher(criteria: $criteria) {
      __typename
      ... on DestinationData {
        code
        type
        texts { text language }
      }
      ... on HotelData {
        hotelCode
        hotelName
      }
    }
  }
}
`;

type DestSearchResult = { destCode: string | null; hotelCodes: string[] };

async function resolveDestinationCode(
  endpoint: string,
  apiKey: string,
  accessCode: string,
  text: string,
  debug = false
): Promise<DestSearchResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${apiKey}`,
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({
        query: DESTINATION_SEARCH_QUERY,
        variables: { criteria: { access: accessCode, text, maxSize: 50 } },
      }),
    });
    if (!res.ok) return { destCode: null, hotelCodes: [] };
    const result = await res.json();
    const items: any[] = result.data?.hotelX?.destinationSearcher || [];
    if (debug) console.log(`[DestSearch] "${text}" → ${items.length} items, types:`, JSON.stringify(items.slice(0, 3).map((i: any) => ({ __typename: i.__typename, code: i.code, hotelCode: i.hotelCode, name: i.hotelName }))));

    // Prefer a proper DestinationData entity (has code, no hotelCode)
    const destItem = items.find((i: any) => i.__typename === 'DestinationData' && i.code);
    if (destItem) return { destCode: destItem.code, hotelCodes: [] };

    // Fallback: collect HotelData codes for direct hotel-code search
    const hotelCodes = items
      .filter((i: any) => i.__typename === 'HotelData' && i.hotelCode)
      .map((i: any) => i.hotelCode);

    return { destCode: null, hotelCodes };
  } catch {
    return { destCode: null, hotelCodes: [] };
  }
}

// City aliases for text variants that TGX/FastX may recognise differently.
// Keep aliases specific — generic region names (e.g. "Kanto") match hotels worldwide.
const CITY_ALIASES: Record<string, string[]> = {
  'tokyo': ['Tokyo', 'Tokio'],
  'osaka': ['Osaka'],
  'kyoto': ['Kyoto'],
  'seoul': ['Seoul'],
  'busan': ['Busan', 'Pusan'],
  'bangkok': ['Bangkok'],
  'ho chi minh': ['Ho Chi Minh City', 'Saigon'],
  'kuala lumpur': ['Kuala Lumpur'],
  'new york': ['New York', 'New York City'],
};

// FastX hotel codes use ISO-2 country prefix (JP27, PH123, KR456 …).
// When we only have hotel codes (no destination code), filter to the expected country
// so a search for "Tokyo" doesn't pull in Polish/Indonesian hotels that also match the text.
function filterByCountry(codes: string[], countryCode: string): string[] {
  if (!countryCode) return codes;
  const prefix = countryCode.toUpperCase();
  const filtered = codes.filter(c => c.toUpperCase().startsWith(prefix));
  // Fall back to unfiltered if filtering removes everything
  return filtered.length > 0 ? filtered : codes;
}

async function resolveDestinationWithFallbacks(
  endpoint: string,
  apiKey: string,
  accessCode: string,
  cityName: string,
  countryCode: string
): Promise<{ destCode: string | null; resolvedFrom: string; fallbackHotelCodes: string[] }> {
  const collectedHotelCodes = new Set<string>();

  const tryResolve = async (text: string): Promise<string | null> => {
    const r = await resolveDestinationCode(endpoint, apiKey, accessCode, text, true);
    r.hotelCodes.forEach(c => collectedHotelCodes.add(c));
    return r.destCode;
  };

  // 1. Try exact city name
  let destCode = await tryResolve(cityName);
  if (destCode) return { destCode, resolvedFrom: cityName, fallbackHotelCodes: [] };

  // 2. Strip trailing admin suffixes ("Baguio City" → "Baguio")
  const simplified = cityName.replace(/\s+(city|province|island|metro|region|district|town|municipality)$/i, '').trim();
  if (simplified && simplified !== cityName) {
    destCode = await tryResolve(simplified);
    if (destCode) return { destCode, resolvedFrom: simplified, fallbackHotelCodes: [] };
  }

  // 3. Try known aliases
  const key = cityName.toLowerCase().trim();
  const aliases = CITY_ALIASES[key] || CITY_ALIASES[simplified.toLowerCase().trim()] || [];
  for (const alias of aliases) {
    if (alias.toLowerCase() === key || alias.toLowerCase() === simplified.toLowerCase()) continue;
    destCode = await tryResolve(alias);
    if (destCode) return { destCode, resolvedFrom: alias, fallbackHotelCodes: [] };
  }

  // No destination code found — return hotel codes filtered to the correct country
  const allCodes = Array.from(collectedHotelCodes);
  const filtered = filterByCountry(allCodes, countryCode);
  console.log(`[DestResolve] Hotel code fallback: ${allCodes.length} total, ${filtered.length} after country filter (${countryCode})`);
  return { destCode: null, resolvedFrom: cityName, fallbackHotelCodes: filtered };
}

// ── TGX Hotel Content ────────────────────────────────────────────
// Fetch names, coordinates and images from TGX hotelX.hotels content query.
// RateHawk's per-hotel API requires string slugs, not numeric HIDs — not usable here.
// Results cached in Supabase hotel_content (90-day TTL).

type ContentEntry = { name: string; lat: number; lng: number; images: string[]; starRating: number };

const CONTENT_TTL_DAYS = 90;

const HOTELS_CONTENT_QUERY = `
query HotelContent($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            hotelCode
            hotelName
            location {
              coordinates { latitude longitude }
            }
            medias { url }
          }
        }
      }
    }
  }
}
`;

async function fetchFromTGX(
  endpoint: string,
  tgxApiKey: string,
  accessCode: string,
  hotelCodes: string[]
): Promise<Map<string, ContentEntry>> {
  const map = new Map<string, ContentEntry>();
  if (hotelCodes.length === 0) return map;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${tgxApiKey}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify({
        query: HOTELS_CONTENT_QUERY,
        variables: { criteria: { access: accessCode, hotelCodes } },
      }),
    });
    if (!res.ok) { console.error(`[TGX Content] ${res.status}`); return map; }
    const result = await res.json();
    if (result.errors) { console.error(`[TGX Content] GraphQL error:`, JSON.stringify(result.errors[0])); return map; }
    const edges: any[] = result.data?.hotelX?.hotels?.edges || [];
    console.log(`[TGX Content] edges: ${edges.length} for ${hotelCodes.length} codes (access ${accessCode}, sample: ${hotelCodes.slice(0,3).join(',')})`);
    for (const edge of edges) {
      const d = edge.node?.hotelData;
      if (!d?.hotelCode) continue;
      map.set(d.hotelCode, {
        name: d.hotelName || null,
        lat: d.location?.coordinates?.latitude || 0,
        lng: d.location?.coordinates?.longitude || 0,
        images: (d.medias || []).map((m: any) => m.url).filter(Boolean),
        starRating: 0,
      });
    }
  } catch (e) {
    console.error('[TGX Content] error:', e);
  }
  return map;
}

async function fetchHotelContent(
  supabase: any,
  tgxEndpoint: string,
  tgxApiKey: string,
  accessCode: string,
  hotelIds: string[]
): Promise<Map<string, ContentEntry>> {
  const map = new Map<string, ContentEntry>();
  if (hotelIds.length === 0) return map;

  // 1. Load whatever is cached and still fresh
  const cutoff = new Date(Date.now() - CONTENT_TTL_DAYS * 86_400_000).toISOString();
  const { data: cached, error: cacheErr } = await supabase
    .from('hotel_content')
    .select('hotel_id, name, images, star_rating, lat, lng')
    .in('hotel_id', hotelIds)
    .gt('fetched_at', cutoff);

  if (cacheErr) console.error('[HotelContent] Cache read error:', cacheErr.message);

  const cachedIds = new Set<string>();
  for (const row of (cached || []) as any[]) {
    // Only treat as a valid cache hit if we actually have images.
    // Rows cached with empty images (from a previous failed content fetch) are
    // re-fetched so TGX gets another chance to return real photos.
    if (!row.images || row.images.length === 0) continue;
    map.set(row.hotel_id, {
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      images: row.images,
      starRating: row.star_rating || 0,
    });
    cachedIds.add(row.hotel_id);
  }

  // 2. Fetch hotels missing from cache OR cached without images
  const missing = hotelIds.filter(id => !cachedIds.has(id));
  console.log(`[HotelContent] Cache hit: ${cachedIds.size}, miss/re-fetch: ${missing.length}`);

  if (missing.length === 0) return map;

  const fresh = await fetchFromTGX(tgxEndpoint, tgxApiKey, accessCode, missing);

  // 3. Upsert fresh entries into Supabase for future searches
  if (fresh.size > 0) {
    const rows = Array.from(fresh.entries() as Iterable<[string, ContentEntry]>).map(([hotel_id, c]) => ({
      hotel_id,
      name: c.name,
      images: c.images,
      star_rating: c.starRating,
      lat: c.lat,
      lng: c.lng,
      fetched_at: new Date().toISOString(),
    }));
    const { error: upsertErr } = await supabase
      .from('hotel_content')
      .upsert(rows, { onConflict: 'hotel_id' });
    if (upsertErr) console.error('[HotelContent] Upsert error:', upsertErr.message);
    for (const [id, entry] of fresh) map.set(id, entry);
  }

  return map;
}

// ── GraphQL Query ────────────────────────────────────────────────
const SEARCH_QUERY = `
query (
  $criteriaSearch: HotelCriteriaSearchInput
  $settings: HotelSettingsInput
  $filterSearch: HotelXFilterSearchInput
) {
  hotelX {
    search(
      criteria: $criteriaSearch
      settings: $settings
      filterSearch: $filterSearch
    ) {
      options {
        id
        hotelCode
        hotelName
        boardCode
        paymentType
        status
        token
        accessCode
        supplierCode
        rateRules
        price {
          currency
          binding
          net
          gross
        }
        cancelPolicy {
          refundable
          cancelPenalties {
            deadline
            penaltyType
            currency
            value
          }
        }
        rooms {
          occupancyRefId
          code
          description
        }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}
`;

// ── Helpers ──────────────────────────────────────────────────────

function buildOccupancies(
  adults: number,
  _children: number,
  childrenAges: number[],
  rooms: number
) {
  const adultsPerRoom = Math.ceil(adults / rooms);
  const childrenPerRoom = Math.ceil(childrenAges.length / rooms);
  let remainingAdults = adults;
  const remainingAges = [...childrenAges];
  const occupancies = [];

  for (let i = 0; i < rooms; i++) {
    const roomAdults = Math.max(Math.min(adultsPerRoom, remainingAdults), 1);
    remainingAdults -= roomAdults;
    const roomAges = remainingAges.splice(0, childrenPerRoom);

    occupancies.push({
      paxes: [
        ...Array(roomAdults).fill(null).map(() => ({ age: 30 })),
        ...roomAges.map((age: number) => ({ age })),
      ],
    });
  }
  return occupancies;
}


/** Group search options by hotelCode, keeping the cheapest option per hotel */
function groupByHotel(options: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const option of options) {
    const code = option.hotelCode;
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, option);
    } else {
      const existing = map.get(code);
      const existingPrice = existing.price?.gross || existing.price?.net || Infinity;
      const newPrice = option.price?.gross || option.price?.net || Infinity;
      if (newPrice < existingPrice) map.set(code, option);
    }
  }
  return map;
}

function transformOptionToHotel(
  option: any,
  cityName: string,
  currency: string,
  content?: { name: string; lat: number; lng: number; images: string[]; starRating: number }
) {
  const price = option.price?.gross || option.price?.net || 0;
  const isRefundable = option.cancelPolicy?.refundable === true;
  const name = content?.name || option.hotelName || `Hotel ${option.hotelCode}`;
  const lat = content?.lat || 0;
  const lng = content?.lng || 0;
  const images = content?.images || [];
  const image = images[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800';

  return {
    hotelId: option.hotelCode,
    name,
    location: cityName,
    description: '',
    rating: 0,
    reviews: 0,
    price,
    currency: option.price?.currency || currency,
    image,
    images,
    amenities: [],
    badges: [],
    type: 'hotel',
    coordinates: { lat, lng },
    refundableTag: isRefundable ? 'RFN' : 'NRFN',
    boardTypes: option.boardCode ? [option.boardCode] : [],
    starRating: content?.starRating || 0,
    latitude: lat,
    longitude: lng,
    _tgx: {
      optionId: option.id,
      token: option.token,
      accessCode: option.accessCode,
      supplierCode: option.supplierCode,
      boardCode: option.boardCode,
      rateRules: option.rateRules,
    },
  };
}

// ── Main Handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const TRAVELGATEX_API_KEY = Deno.env.get('TRAVELGATEX_API_KEY');
  // FastX (37606) is the aggregated access with 1M+ hotels across all suppliers.
  // OTV (38327) was the direct supplier access — narrower coverage, no Japan.
  const TRAVELGATEX_ACCESS_CODE = Deno.env.get('TRAVELGATEX_CODE') || '37606';
  // FastX access uses supplier 'FASTX' and context 'TGX' (visible in TGX dashboard).
  // Context 'TGX' tells TGX to map FastX hotel codes (JP27 etc.) → OTV native codes.
  const TRAVELGATEX_SUPPLIER = Deno.env.get('TRAVELGATEX_SUPPLIER') || 'FASTX';
  const TRAVELGATEX_CONTEXT = Deno.env.get('TRAVELGATEX_CONTEXT') || 'TGX';
  const TRAVELGATEX_TEST_MODE = Deno.env.get('TRAVELGATEX_TEST_MODE') === 'true';
  const TRAVELGATEX_CLIENT = Deno.env.get('TRAVELGATEX_CLIENT') || 'forhuinc';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const ENDPOINT = 'https://api.travelgate.com';

  try {
    const t0 = Date.now();
    const body = await req.json();

    console.log('===== TRAVELGATEX SEARCH REQUEST =====', JSON.stringify(body).substring(0, 300));

    // ── Cache lookup ──
    const cacheKey = getCacheKey(body);
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${Date.now() - t0}ms`);
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        status: 200,
      });
    }

    const {
      checkin,
      checkout,
      adults = 2,
      children = 0,
      childrenAges = [],
      rooms = 1,
      currency = 'USD',
      guest_nationality: nationality = 'PH',
      cityName = '',
      countryCode = '',
      destinationCode, // TravelgateX destination code — overrides countryCode if provided
    } = body;

    if (!checkin || !checkout) {
      throw new Error('checkin and checkout are required');
    }

    // Destination: use explicit destinationCode if provided, otherwise resolve via destinationSearcher.
    // ISO country codes (e.g. 'PH') are NOT valid TravelgateX destination codes — must resolve first.
    let destCode = destinationCode || '';
    let fallbackHotelCodes: string[] = [];

    if (!destCode) {
      const lookupText = cityName || '';
      if (lookupText) {
        const { destCode: resolved, resolvedFrom, fallbackHotelCodes: hotelFallback } = await resolveDestinationWithFallbacks(
          ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE, lookupText, countryCode
        );
        if (resolved) {
          destCode = resolved;
          console.log(`[TravelgateX] Resolved destination "${lookupText}" via "${resolvedFrom}" → "${destCode}"`);
        } else {
          fallbackHotelCodes = hotelFallback;
          console.warn(`[TravelgateX] No destination code for "${lookupText}" — fallback hotel codes: ${fallbackHotelCodes.length}`);
        }
      }
    }

    if (!destCode && fallbackHotelCodes.length === 0) {
      return new Response(JSON.stringify({
        data: [],
        _debug: {
          error: 'No destination code or hotel codes resolved — supplier catalog may not cover this destination',
          cityName,
          countryCode,
          triedAliases: CITY_ALIASES[cityName.toLowerCase().trim()] || [],
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Build occupancies (TravelgateX uses paxes with ages)
    const normalizedAges: number[] = Array.isArray(childrenAges) ? childrenAges : [];
    if (normalizedAges.length === 0 && children > 0) {
      for (let i = 0; i < children; i++) normalizedAges.push(10);
    }
    const occupancies = buildOccupancies(adults, children, normalizedAges, rooms);

    // When a destination code resolved → search by destination + plugin (full city coverage).
    // When only hotel codes resolved → search those specific hotels directly (no plugin needed).
    const criteriaSearch: any = {
      checkIn: checkin,
      checkOut: checkout,
      occupancies,
      currency,
      nationality,
      markets: [nationality],
      language: 'en',
    };
    if (destCode) {
      criteriaSearch.destinations = [destCode];
    } else {
      criteriaSearch.hotels = fallbackHotelCodes;
    }

    const settings: any = {
      client: TRAVELGATEX_CLIENT,
      context: TRAVELGATEX_CONTEXT,
      testMode: TRAVELGATEX_TEST_MODE,
      timeout: 18000,
      suppliers: [
        {
          code: TRAVELGATEX_SUPPLIER,
          accesses: [{ accessId: TRAVELGATEX_ACCESS_CODE }],
        },
      ],
      // search_by_destination plugin only needed when searching by destination code
      ...(destCode ? {
        plugins: [
          {
            step: 'REQUEST',
            pluginsType: {
              type: 'PRE_STEP',
              name: 'search_by_destination',
              parameters: [{ key: 'accessID', value: TRAVELGATEX_ACCESS_CODE }],
            },
          },
        ],
      } : {}),
    };

    const variables: any = { criteriaSearch, settings };

    const t1 = Date.now();
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({ query: SEARCH_QUERY, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TravelgateX API ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const t2 = Date.now();

    if (result.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    const searchData = result.data?.hotelX?.search;

    // DEBUG: log full response for diagnosis
    console.log('[TravelgateX] Full searchData:', JSON.stringify(searchData).substring(0, 2000));

    if (searchData?.errors?.length > 0) {
      console.warn('[TravelgateX] Search errors:', JSON.stringify(searchData.errors));
    }
    if (searchData?.warnings?.length > 0) {
      console.warn('[TravelgateX] Search warnings:', JSON.stringify(searchData.warnings));
    }

    const options: any[] = searchData?.options || [];
    console.log(`[TravelgateX] API: ${t2 - t1}ms, options: ${options.length}`);

    if (options.length === 0) {
      return new Response(JSON.stringify({
        data: [],
        _debug: {
          errors: searchData?.errors || [],
          warnings: searchData?.warnings || [],
          destCode: destCode || null,
          fallbackHotelCodes: fallbackHotelCodes.length > 0 ? fallbackHotelCodes : undefined,
          searchMode: destCode ? 'destination' : 'hotel-codes',
          ms: t2 - t1,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        status: 200,
      });
    }

    // Group by hotel and pick cheapest option per hotel, sorted price-asc
    const hotelMap = groupByHotel(options);
    const sortedOptions = Array.from(hotelMap.values())
      .sort((a: any, b: any) => {
        const pa = a.price?.gross || a.price?.net || Infinity;
        const pb = b.price?.gross || b.price?.net || Infinity;
        return pa - pb;
      });
    const uniqueCodes = sortedOptions.map((o: any) => o.hotelCode);

    // Fetch hotel names, coordinates and images in parallel with result processing
    const contentMap = await fetchHotelContent(supabase, ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE, uniqueCodes);

    const hotels = sortedOptions
      .map((option: any) => transformOptionToHotel(option, cityName, currency, contentMap.get(option.hotelCode)));

    console.log(JSON.stringify({
      _event: 'travelgatex_search_analytics',
      cityName,
      countryCode,
      destCode,
      checkin,
      checkout,
      rooms,
      adults,
      children,
      optionCount: options.length,
      hotelCount: hotels.length,
      duration_ms: Date.now() - t0,
      api_ms: t2 - t1,
      testMode: false,
      timestamp: new Date().toISOString(),
    }));

    const responseData = { data: hotels };
    setCache(cacheKey, responseData);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[TravelgateX Search Error]', error.message);
    return new Response(JSON.stringify({ error: 'Search failed', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
