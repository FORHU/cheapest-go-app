import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    }
  }
}
`;

// ── Helpers ──────────────────────────────────────────────────────

function buildOccupancies(
  adults: number,
  children: number,
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

function transformOptionToHotel(option: any, cityName: string, currency: string) {
  const price = option.price?.gross || option.price?.net || 0;
  const isRefundable = option.cancelPolicy?.refundable === true;

  return {
    hotelId: option.hotelCode,
    name: option.hotelName || `Hotel ${option.hotelCode}`,
    location: cityName,
    description: '',
    rating: 0,
    reviews: 0,
    price,
    currency: option.price?.currency || currency,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
    images: [],
    amenities: [],
    badges: [],
    type: 'hotel',
    coordinates: { lat: 0, lng: 0 },
    refundableTag: isRefundable ? 'RFN' : 'NRFN',
    boardTypes: option.boardCode ? [option.boardCode] : [],
    starRating: 0,
    latitude: 0,
    longitude: 0,
    // TravelgateX-specific fields needed for quote/book flows
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
  const TRAVELGATEX_ACCESS_CODE = Deno.env.get('TRAVELGATEX_CODE') || '37606';
  const TRAVELGATEX_CLIENT = Deno.env.get('TRAVELGATEX_CLIENT') || 'forhuinc';
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

    // Destination: use explicit destinationCode if provided, otherwise fall back to countryCode
    const destCode = destinationCode || countryCode || '';

    // Build occupancies (TravelgateX uses paxes with ages)
    const normalizedAges: number[] = Array.isArray(childrenAges) ? childrenAges : [];
    if (normalizedAges.length === 0 && children > 0) {
      for (let i = 0; i < children; i++) normalizedAges.push(10);
    }
    const occupancies = buildOccupancies(adults, children, normalizedAges, rooms);

    const variables = {
      criteriaSearch: {
        checkIn: checkin,
        checkOut: checkout,
        occupancies,
        destinations: [destCode],
        currency,
        nationality,
        markets: [nationality],
        language: 'en',
      },
      settings: {
        client: TRAVELGATEX_CLIENT,
        context: 'TGX',
        testMode: false,
        timeout: 25000,
        suppliers: [
          {
            code: 'FASTX',
            accesses: [{ accessId: TRAVELGATEX_ACCESS_CODE }],
          },
        ],
      },
    };

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
          destCode,
          ms: t2 - t1,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        status: 200,
      });
    }

    // Group by hotel and pick cheapest option per hotel
    const hotelMap = groupByHotel(options);
    const hotels = Array.from(hotelMap.values())
      .map(option => transformOptionToHotel(option, cityName, currency));

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
