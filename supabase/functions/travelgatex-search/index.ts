import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── In-Memory Cache ─────────────────────────────────────────────
const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { data: any; expiresAt: number }>();

// ── Raw Results Cache ────────────────────────────────────────────
// Stores geo-filtered sorted options + ETG HID map.
// Load More calls use this to skip the 6-14s TGX search entirely.
const RAW_CACHE_TTL_MS = 3 * 60 * 1000;
const rawCache = new Map<string, { data: { filteredOptions: any[]; hotelCodeToEtgHid: Map<string, string> }; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
  for (const [key, entry] of rawCache.entries()) {
    if (now > entry.expiresAt) rawCache.delete(key);
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

type DestSearchResult = { destCodes: string[]; hotelCodes: string[] };

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
        // No maxSize cap — get all destination codes and hotel codes TGX knows about.
        // Pagination (limit/offset) handles display latency, not API fetch size.
        variables: { criteria: { access: accessCode, text } },
      }),
    });
    if (!res.ok) return { destCodes: [], hotelCodes: [] };
    const result = await res.json();
    const items: any[] = result.data?.hotelX?.destinationSearcher || [];
    if (debug) console.log(`[DestSearch] "${text}" → ${items.length} items (${items.filter((i:any)=>i.__typename==='DestinationData').length} dest, ${items.filter((i:any)=>i.__typename==='HotelData').length} hotel)`);

    // Collect ALL DestinationData codes — TGX returns city-level AND sub-area codes.
    // e.g. searching "Tokyo" returns codes for Shinjuku, Shibuya, Ginza, etc.
    const destCodes = items
      .filter((i: any) => i.__typename === 'DestinationData' && i.code)
      .map((i: any) => i.code as string);

    // Collect HotelData codes for fallback when no destination codes exist
    const hotelCodes = items
      .filter((i: any) => i.__typename === 'HotelData' && i.hotelCode)
      .map((i: any) => i.hotelCode as string);

    return { destCodes, hotelCodes };
  } catch {
    return { destCodes: [], hotelCodes: [] };
  }
}

// FastX catalogs hotels by sub-area/neighborhood, not just city name.
// When destinationSearcher("Tokyo") returns 0 dest codes, querying each neighborhood
// (Shinjuku, Shibuya…) collects hotel codes actually stored under those areas.
// ~80+ major tourist cities are listed below; the dynamic approach handles the rest.
const CITY_NEIGHBORHOODS: Record<string, string[]> = {
  // Japan
  'tokyo':      ['Shinjuku', 'Shibuya', 'Ginza', 'Akihabara', 'Asakusa', 'Ueno', 'Roppongi', 'Ikebukuro', 'Odaiba', 'Marunouchi', 'Harajuku', 'Shinagawa', 'Akasaka', 'Minato', 'Chiyoda', 'Sumida'],
  'tokio':      ['Shinjuku', 'Shibuya', 'Ginza', 'Akihabara', 'Asakusa', 'Roppongi', 'Ikebukuro'],
  'osaka':      ['Namba', 'Umeda', 'Shinsaibashi', 'Dotonbori', 'Osaka Station', 'Tennoji', 'Kyobashi'],
  'kyoto':      ['Gion', 'Arashiyama', 'Fushimi', 'Higashiyama', 'Kawaramachi', 'Nijo', 'Kyoto Station'],
  'yokohama':   ['Minato Mirai', 'Kannai', 'Yokohama Station', 'Chinatown', 'Motomachi'],
  'sapporo':    ['Susukino', 'Odori', 'Sapporo Station', 'Hokkaido'],
  'nagoya':     ['Nagoya Station', 'Sakae', 'Fushimi'],
  'fukuoka':    ['Hakata', 'Tenjin', 'Nakasu', 'Fukuoka Airport'],
  'hiroshima':  ['Hiroshima Station', 'Naka Ward', 'Peace Memorial'],
  'nara':       ['Nara Park', 'Kintetsu Nara'],
  'okinawa':    ['Naha', 'Chatan', 'Onna', 'Kokusai Street', 'American Village'],
  // South Korea
  'seoul':      ['Myeongdong', 'Gangnam', 'Hongdae', 'Itaewon', 'Insadong', 'Sinchon', 'Dongdaemun', 'Mapo', 'Jongno', 'Yongsan', 'Seoul Station'],
  'busan':      ['Haeundae', 'Seomyeon', 'Nampo', 'Gwangalli', 'Busan Station'],
  'jeju':       ['Jeju City', 'Seogwipo', 'Jungmun', 'Jeju Airport'],
  'incheon':    ['Incheon Airport', 'Songdo', 'Bupyeong'],
  // Thailand
  'bangkok':    ['Sukhumvit', 'Silom', 'Siam', 'Khaosan', 'Asok', 'Nana', 'Ratchadamri', 'Pratunam', 'Bangna', 'Chatuchak', 'Thonburi'],
  'phuket':     ['Patong', 'Kata', 'Karon', 'Surin', 'Bang Tao', 'Rawai', 'Kamala', 'Phuket Town', 'Nai Harn', 'Mai Khao'],
  'chiang mai': ['Nimman', 'Old City', 'Santitham', 'Chang Klan', 'Nimmanhaemin'],
  'pattaya':    ['Jomtien', 'Central Pattaya', 'North Pattaya', 'Naklua', 'Bang Saray'],
  'krabi':      ['Ao Nang', 'Railay', 'Klong Muang', 'Krabi Town'],
  'koh samui':  ['Chaweng', 'Lamai', 'Bophut', 'Maenam', 'Choeng Mon'],
  // Vietnam
  'ho chi minh': ['District 1', 'District 3', 'Bui Vien', 'Pham Ngu Lao', 'Nguyen Hue', 'Dong Khoi', 'Tan Binh', 'Binh Thanh'],
  'saigon':     ['District 1', 'Bui Vien', 'Pham Ngu Lao'],
  'hanoi':      ['Hoan Kiem', 'Old Quarter', 'Ba Dinh', 'Dong Da', 'Tay Ho', 'West Lake', 'Cau Giay'],
  'da nang':    ['My Khe Beach', 'An Thuong', 'Da Nang Beach', 'Marble Mountains'],
  'hoi an':     ['Old Town', 'An Bang Beach', 'Cua Dai'],
  'nha trang':  ['Tran Phu', 'Nha Trang Beach', 'Loc Tho'],
  'phu quoc':   ['Long Beach', 'Duong Dong', 'Ong Lang', 'An Thoi'],
  // Philippines
  'manila':     ['Makati', 'BGC', 'Taguig', 'Ortigas', 'Pasay', 'Ermita', 'Malate', 'Quezon City', 'Pasig'],
  'cebu':       ['Cebu City', 'Mactan', 'Lapu-Lapu', 'Mandaue', 'IT Park', 'Lahug'],
  'boracay':    ['White Beach', 'Station 1', 'Station 2', 'Station 3', 'Bulabog'],
  'palawan':    ['El Nido', 'Port Barton', 'Coron', 'Puerto Princesa'],
  'el nido':    ['El Nido Town', 'Nacpan', 'Corong Corong'],
  'davao':      ['Davao City', 'Ecoland', 'Bajada'],
  'bohol':      ['Panglao', 'Alona Beach', 'Tagbilaran'],
  // Indonesia
  'bali':       ['Kuta', 'Seminyak', 'Ubud', 'Canggu', 'Nusa Dua', 'Jimbaran', 'Legian', 'Sanur', 'Uluwatu', 'Denpasar'],
  'jakarta':    ['SCBD', 'Sudirman', 'Menteng', 'Kemang', 'Kota Tua', 'Kuningan'],
  'lombok':     ['Senggigi', 'Gili Trawangan', 'Gili Air', 'Kuta Lombok', 'Mataram'],
  'yogyakarta': ['Malioboro', 'Prawirotaman', 'Kraton', 'Sleman'],
  // Malaysia
  'kuala lumpur': ['Bukit Bintang', 'KLCC', 'Chinatown', 'Bangsar', 'Mont Kiara', 'Chow Kit'],
  'penang':     ['George Town', 'Batu Ferringhi', 'Gurney'],
  'langkawi':   ['Pantai Cenang', 'Kuah', 'Pantai Tengah'],
  'kota kinabalu': ['City Centre', 'Likas', 'Tanjung Aru'],
  // Singapore
  'singapore':  ['Orchard', 'Marina Bay', 'Clarke Quay', 'Bugis', 'Sentosa', 'Chinatown', 'Little India', 'Geylang'],
  // China / HK / Taiwan
  'hong kong':  ['Kowloon', 'Tsim Sha Tsui', 'Causeway Bay', 'Central', 'Mong Kok', 'Wan Chai'],
  'beijing':    ['Chaoyang', 'Dongcheng', 'Xicheng', 'Sanlitun', 'Haidian', 'Guomao', 'Shunyi'],
  'shanghai':   ['Pudong', 'Jing\'an', 'Xuhui', 'Huangpu', 'Hongkou', 'Changning'],
  'taipei':     ['Zhongshan', 'Da\'an', 'Xinyi', 'Zhongzheng', 'Wanhua', 'Songshan'],
  'guangzhou':  ['Tianhe', 'Yuexiu', 'Haizhu', 'Baiyun'],
  'shenzhen':   ['Nanshan', 'Futian', 'Luohu', 'Longhua'],
  // India
  'delhi':      ['Connaught Place', 'Karol Bagh', 'Paharganj', 'Aerocity', 'Dwarka', 'Noida', 'Gurgaon'],
  'new delhi':  ['Connaught Place', 'Karol Bagh', 'Paharganj', 'Aerocity', 'Gurgaon'],
  'mumbai':     ['Bandra', 'Colaba', 'Andheri', 'Juhu', 'Powai', 'Dadar', 'Lower Parel'],
  'goa':        ['Calangute', 'Baga', 'Anjuna', 'Panaji', 'Vagator', 'Palolem', 'Candolim'],
  'jaipur':     ['MI Road', 'Sindhi Camp', 'Civil Lines', 'Pink City', 'Bani Park'],
  'bangalore':  ['MG Road', 'Koramangala', 'Indiranagar', 'Whitefield'],
  // Sri Lanka / Nepal
  'colombo':    ['Colombo 1', 'Colombo 3', 'Colombo 7', 'Fort', 'Kollupitiya'],
  'kathmandu':  ['Thamel', 'Patan', 'Bhaktapur', 'Boudhanath'],
  // Middle East
  'dubai':      ['Downtown', 'Marina', 'JBR', 'Deira', 'Jumeirah', 'Business Bay', 'Bur Dubai', 'Palm Jumeirah', 'DIFC'],
  'abu dhabi':  ['Corniche', 'Yas Island', 'Saadiyat', 'Al Raha'],
  'doha':       ['The Pearl', 'West Bay', 'Corniche', 'Al Sadd', 'Souq Waqif'],
  'riyadh':     ['Al Olaya', 'Al Malaz', 'Diplomatic Quarter'],
  'istanbul':   ['Sultanahmet', 'Taksim', 'Beyoglu', 'Besiktas', 'Sisli', 'Kadikoy', 'Fatih'],
  // Europe
  'london':     ['Westminster', 'Covent Garden', 'Kensington', 'Shoreditch', 'Mayfair', 'Canary Wharf', 'Camden', 'Paddington', 'Heathrow', 'City of London'],
  'paris':      ['Marais', 'Saint-Germain', 'Montmartre', 'Champs-Elysees', 'Opera', 'Bastille', 'Latin Quarter', 'Pigalle'],
  'rome':       ['Colosseum', 'Vatican', 'Trastevere', 'Campo de Fiori', 'Navona', 'Spanish Steps', 'Termini', 'Prati'],
  'barcelona':  ['Gothic Quarter', 'Eixample', 'Gracia', 'El Born', 'Barceloneta', 'Sagrada Familia', 'Sants'],
  'amsterdam':  ['Jordaan', 'De Pijp', 'Centrum', 'Museum Quarter', 'Leidseplein'],
  'berlin':     ['Mitte', 'Prenzlauer Berg', 'Kreuzberg', 'Friedrichshain', 'Charlottenburg'],
  'prague':     ['Old Town', 'New Town', 'Mala Strana', 'Vinohrady', 'Zizkov'],
  'vienna':     ['Innere Stadt', 'Mariahilf', 'Josefstadt', 'Leopoldstadt', 'Favoriten'],
  'budapest':   ['District V', 'District VII', 'Pest', 'Buda', 'Castle District', 'Andrassy'],
  'lisbon':     ['Alfama', 'Bairro Alto', 'Chiado', 'Belem', 'Mouraria'],
  'athens':     ['Plaka', 'Monastiraki', 'Syntagma', 'Kolonaki', 'Psiri'],
  'madrid':     ['Sol', 'Salamanca', 'Malasana', 'Chueca', 'La Latina', 'Retiro', 'Lavapies'],
  // Americas
  'new york':   ['Manhattan', 'Midtown', 'Times Square', 'Brooklyn', 'Chelsea', 'SoHo', 'Upper West Side', 'Financial District'],
  'los angeles': ['Hollywood', 'Santa Monica', 'Beverly Hills', 'West Hollywood', 'Downtown LA', 'Venice'],
  'miami':      ['South Beach', 'Brickell', 'Wynwood', 'Miami Beach', 'Downtown Miami', 'Doral'],
  'las vegas':  ['The Strip', 'Downtown', 'Henderson', 'Paradise'],
  'san francisco': ['Union Square', 'Fisherman\'s Wharf', 'Mission', 'SoMa', 'North Beach'],
  'toronto':    ['Downtown', 'Yorkville', 'Distillery', 'King West', 'Midtown', 'North York'],
  'cancun':     ['Hotel Zone', 'Centro', 'Puerto Morelos', 'Playa del Carmen', 'Tulum'],
  // Oceania
  'sydney':     ['CBD', 'Darling Harbour', 'Surry Hills', 'Newtown', 'Bondi', 'Manly', 'Parramatta'],
  'melbourne':  ['CBD', 'Fitzroy', 'St Kilda', 'South Yarra', 'Collingwood', 'Carlton'],
  'gold coast': ['Surfers Paradise', 'Broadbeach', 'Burleigh Heads', 'Coolangatta'],
};

// FastX hotel codes use ISO-2 country prefix (JP27, PH123, KR456 …).
function filterByCountry(codes: string[], countryCode: string): string[] {
  if (!countryCode) return codes;
  const prefix = countryCode.toUpperCase();
  const filtered = codes.filter(c => c.toUpperCase().startsWith(prefix));
  return filtered.length > 0 ? filtered : codes;
}

// Hybrid destination resolver:
//   FAST PATH: destinationSearcher(maxSize=200) returns ALL DestinationData codes in one call.
//              Works for cities TGX covers natively (returns a destination tree).
//   FALLBACK:  When TGX returns no dest codes, query each neighborhood in parallel.
//              FastX text-matches hotel codes by area name, giving far more coverage.
async function resolveDestinationWithFallbacks(
  endpoint: string,
  apiKey: string,
  accessCode: string,
  cityName: string,
  countryCode: string
): Promise<{ destCodes: string[]; resolvedFrom: string; fallbackHotelCodes: string[] }> {
  const allDestCodes = new Set<string>();
  const collectedHotelCodes = new Set<string>();

  const tryResolve = async (text: string) => {
    const r = await resolveDestinationCode(endpoint, apiKey, accessCode, text, true);
    r.destCodes.forEach(c => allDestCodes.add(c));
    r.hotelCodes.forEach(c => collectedHotelCodes.add(c));
  };

  // 1. Query city name — maxSize=200 returns city-level AND sub-area destination codes.
  await tryResolve(cityName);
  if (allDestCodes.size > 0) {
    const codes = Array.from(allDestCodes);
    console.log(`[DestResolve] "${cityName}" → ${codes.length} dest codes: ${codes.slice(0, 6).join(', ')}${codes.length > 6 ? '...' : ''}`);
    return { destCodes: codes, resolvedFrom: cityName, fallbackHotelCodes: [] };
  }

  // 2. Strip trailing admin suffixes ("Baguio City" → "Baguio") and retry
  const simplified = cityName.replace(/\s+(city|province|island|metro|region|district|town|municipality)$/i, '').trim();
  if (simplified && simplified !== cityName) {
    await tryResolve(simplified);
    if (allDestCodes.size > 0) {
      const codes = Array.from(allDestCodes);
      console.log(`[DestResolve] "${simplified}" (simplified) → ${codes.length} dest codes`);
      return { destCodes: codes, resolvedFrom: simplified, fallbackHotelCodes: [] };
    }
  }

  // 3. No destination codes — expand via neighborhoods in parallel.
  const key = cityName.toLowerCase().trim();
  const neighborhoods = CITY_NEIGHBORHOODS[key] || CITY_NEIGHBORHOODS[simplified.toLowerCase().trim()] || [];
  if (neighborhoods.length > 0) {
    console.log(`[DestResolve] No dest codes for "${cityName}" — querying ${neighborhoods.length} neighborhoods...`);
    await Promise.all(neighborhoods.map(n => tryResolve(n)));
  }

  // No cap on hotel codes — pagination handles display size, not fetch size.
  // TGX search payload can handle 500+ hotel codes safely.
  const allCodes = Array.from(collectedHotelCodes);
  const filtered = filterByCountry(allCodes, countryCode);
  const capped = filtered.slice(0, 500);
  console.log(`[DestResolve] Hotel code fallback for "${cityName}": ${allCodes.length} → ${filtered.length} (${countryCode}) → using ${capped.length}`);
  return { destCodes: [], resolvedFrom: cityName, fallbackHotelCodes: capped };
}

// ── TGX Hotel Content + ETG Image Fallback ─────────────────────────
// Strategy:
//   1. FastX (37606) first — hotel codes are in FastX format from context 'TGX'
//   2. OTV (38327) as fallback for codes FastX misses
//   3. ETG/RateHawk B2B API as final fallback for hotels still missing images
//      └ ETG hotel HID is parsed from the TGX option token (the 'd' segment)
//   4. Join ETG/RateHawk ratings from hotel_reviews table
//   5. Cache results in Supabase hotel_content (90-day TTL)
//   6. last_attempt_at guard prevents re-hammering APIs for contentless hotels

const OTV_ACCESS_CODE = '38327';
const ETG_API_BASE   = 'https://api.worldota.net';

// Parse the ETG numeric hotel HID from a TGX option token.
// Token format: "33!~|a0!~|b260529!~|c260530!~|d9886890!~|...!~|mJP27!~|..."
// Segments are separated by '!~|'; each is letter+value. 'd' = OTV/ETG hotel ID.
function extractEtgHid(optionId: string): string | null {
  if (!optionId) return null;
  for (const seg of optionId.split('!~|')) {
    if (seg.length > 1 && seg[0] === 'd' && /^\d+$/.test(seg.slice(1))) {
      return seg.slice(1);
    }
  }
  return null;
}

type ContentEntry = {
  name: string;
  lat: number;
  lng: number;
  images: string[];
  starRating: number;
  address?: string;
  city?: string;
  country?: string;
  description?: string;
  amenities?: string[];
  rating?: number;
  reviews?: number;
};

const CONTENT_TTL_DAYS = 90;
// Don't re-attempt content fetch for hotels that returned nothing for at least 10 minutes.
// (Kept short so failed fetches during debugging don't block retries for too long)
const CONTENT_RETRY_MS = 10 * 60 * 1000; // 10 minutes

const HOTELS_CONTENT_QUERY = `
query HotelContent($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            hotelCode
            hotelName
            categoryCode
            location {
              address
              city
              country
              coordinates { latitude longitude }
            }
            medias {
              url
              order
              type
            }
            descriptions {
              texts { text language }
            }
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
    if (!res.ok) {
      const errBody = await res.text().catch(() => '(unreadable)');
      console.error(`[TGX Content] HTTP ${res.status} for access ${accessCode} — body: ${errBody.substring(0, 500)}`);
      return map;
    }
    const result = await res.json();
    if (result.errors) { console.error(`[TGX Content] GraphQL error (access ${accessCode}):`, JSON.stringify(result.errors[0])); return map; }
    const edges: any[] = result.data?.hotelX?.hotels?.edges || [];
    console.log(`[TGX Content] access=${accessCode} → ${edges.length} of ${hotelCodes.length} hotels returned`);

    for (const edge of edges) {
      const d = edge.node?.hotelData;
      if (!d?.hotelCode) continue;

      // Sort images by order field; filter out anything without a URL
      const images: string[] = (d.medias || [])
        .filter((m: any) => m?.url)
        .sort((a: any, b: any) => (Number(a.order) || 999) - (Number(b.order) || 999))
        .map((m: any) => m.url as string);

      // Prefer English description; fall back to first available
      let description = '';
      for (const desc of (d.descriptions || [])) {
        const enText = (desc.texts || []).find((t: any) => t.language === 'en')?.text;
        if (enText) { description = enText; break; }
      }
      if (!description && d.descriptions?.[0]?.texts?.[0]?.text) {
        description = d.descriptions[0].texts[0].text;
      }

      // Extract amenity codes as a flat string array
      const amenities: string[] = (d.allAmenities?.edges || [])
        .map((e: any) => e.node?.amenityData?.code)
        .filter(Boolean);

      // Star rating from categoryCode (e.g. "4" = 4 stars). starRating field not in this query.
      const starRating = parseInt(d.categoryCode || '0') || 0;

      map.set(d.hotelCode, {
        name: d.hotelName || `Hotel ${d.hotelCode}`,
        lat: d.location?.coordinates?.latitude || 0,
        lng: d.location?.coordinates?.longitude || 0,
        images,
        starRating,
        address: d.location?.address,
        city: d.location?.city,
        country: d.location?.country,
        description: description || undefined,
        amenities,
      });

      console.log(`[TGX Content] ${d.hotelCode} → ${images.length} images, star=${starRating}, addr=${!!d.location?.address}`);
    }
  } catch (e) {
    console.error('[TGX Content] error:', e);
  }
  return map;
}

// ── ETG / RateHawk B2B hotel info (images, star rating) ─────────────
// Called only for hotels where TGX returned no images.
// hotelCodeToEtgHid maps FastX hotel code → ETG numeric HID (parsed from option token).
// fastMode=true: batch=10 no delay (sync path, first 25 hotels, stays under 30/min burst)
// fastMode=false: batch=3, 6s delay (background path, rate-limit safe for large batches)
async function fetchFromETG(
  etgKeyId: string,
  etgApiKey: string,
  hotelCodeToEtgHid: Map<string, string>,
  fastMode = false
): Promise<Map<string, { images: string[]; starRating: number; description?: string }>> {
  const result = new Map<string, { images: string[]; starRating: number; description?: string }>();
  if (hotelCodeToEtgHid.size === 0) return result;

  const auth = btoa(`${etgKeyId}:${etgApiKey}`);

  const fetchOne = async (hotelCode: string, hid: string) => {
    try {
      const res = await fetch(`${ETG_API_BASE}/api/b2b/v3/hotel/info/`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hid: parseInt(hid, 10), language: 'en' }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[ETG${fastMode ? ' sync' : ' bg'}] ${res.status} for hid=${hid} (${hotelCode}): ${errText.substring(0, 150)}`);
        // Do NOT add to result on error — uncached hotels will be picked up by background task.
        return;
      }

      const data = await res.json();
      if (result.size === 0) {
        console.log(`[ETG] Sample response for hid=${hid}:`, JSON.stringify(data).substring(0, 500));
      }

      const hotel = data?.data;
      if (!hotel) return;

      const rawImages: any[] = hotel.images || hotel.photos || [];
      const images = rawImages
        .map((img: any) => {
          const raw = img.src || img.url || (typeof img === 'string' ? img : null);
          if (!raw || typeof raw !== 'string') return null;
          return raw.replace(/\{size\}/g, '640x400');
        })
        .filter((u): u is string => !!u && u.startsWith('http'))
        .slice(0, 20);

      const starRating = Number(hotel.star_rating || hotel.stars || 0);

      let description: string | undefined;
      const desc = hotel.description || hotel.descriptions;
      if (typeof desc === 'object') description = desc?.en || Object.values(desc)[0] as string;
      else if (typeof desc === 'string') description = desc;

      console.log(`[ETG${fastMode ? ' sync' : ' bg'}] ${hotelCode} (hid=${hid}) → ${images.length} images, star=${starRating}`);
      result.set(hotelCode, { images, starRating, description });
    } catch (e) {
      console.error(`[ETG] Error for hid=${hid} (${hotelCode}):`, e);
    }
  };

  const BATCH_SIZE = fastMode ? 20 : 3;   // fast: 20 concurrent (under 30 burst limit); bg: 3 (rate-safe)
  const BATCH_DELAY = fastMode ? 0 : 6000; // fast: no delay; bg: 6s → rate limit safe
  const entries = Array.from(hotelCodeToEtgHid.entries());
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (i > 0 && BATCH_DELAY > 0) await new Promise(r => setTimeout(r, BATCH_DELAY));
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(([code, hid]) => fetchOne(code, hid)));
  }

  return result;
}

// ── Background ETG enrichment (runs after response is sent) ──────
// Fetches ETG hotel data for hotels without images and saves to hotel_content.
async function enrichWithETGAndSave(
  supabase: any,
  etgSubMap: Map<string, string>, // hotelCode → ETG hid
  etgKeyId: string,
  etgApiKey: string,
  existingContent: Map<string, ContentEntry> = new Map()
): Promise<void> {
  if (etgSubMap.size === 0 || !etgKeyId || !etgApiKey) return;
  console.log(`[ETG BG] Starting background enrichment for ${etgSubMap.size} hotels...`);
  try {
    const etgResult = await fetchFromETG(etgKeyId, etgApiKey, etgSubMap);
    const attemptedAt = new Date().toISOString();
    const rows = Array.from(etgSubMap.keys()).map(hotel_id => {
      const etg = etgResult.get(hotel_id);
      const ex  = existingContent.get(hotel_id);
      return {
        hotel_id,
        name:           ex?.name || null,
        images:         etg?.images?.length ? etg.images : (ex?.images || []),
        star_rating:    etg?.starRating || ex?.starRating || 0,
        lat:            ex?.lat || 0,
        lng:            ex?.lng || 0,
        address:        ex?.address || null,
        city:           ex?.city || null,
        country:        ex?.country || null,
        description:    etg?.description || ex?.description || null,
        amenities:      ex?.amenities || [],
        content_source: etg?.images?.length ? 'ETG' : (ex ? 'FastX' : null),
        fetched_at:     attemptedAt,
        last_attempt_at: attemptedAt,
      };
    });
    const { error } = await supabase.from('hotel_content').upsert(rows, { onConflict: 'hotel_id' });
    if (error) console.error('[ETG BG] Upsert error:', error.message);
    else console.log(`[ETG BG] Saved ${etgResult.size}/${etgSubMap.size} enriched hotels to cache.`);
  } catch (e: any) {
    console.error('[ETG BG] Error:', e.message);
  }
}

async function fetchHotelContent(
  supabase: any,
  tgxEndpoint: string,
  tgxApiKey: string,
  _primaryAccessCode: string,
  hotelIds: string[],
  hotelCodeToEtgHid: Map<string, string> = new Map(),
  etgKeyId = '',
  etgApiKey = '',
  syncEtgMax = Infinity // max hotels to ETG synchronously; default=all
): Promise<Map<string, ContentEntry>> {
  const map = new Map<string, ContentEntry>();
  if (hotelIds.length === 0) return map;

  const now = Date.now();
  const contentCutoff = new Date(now - CONTENT_TTL_DAYS * 86_400_000).toISOString();
  const retryCutoff   = new Date(now - CONTENT_RETRY_MS).toISOString();

  // 1. Load cached content rows (including those without images to check last_attempt_at)
  const { data: cached, error: cacheErr } = await supabase
    .from('hotel_content')
    .select('hotel_id, name, images, star_rating, lat, lng, address, city, country, description, amenities, last_attempt_at')
    .in('hotel_id', hotelIds)
    .gt('fetched_at', contentCutoff);

  if (cacheErr) console.error('[HotelContent] Cache read error:', cacheErr.message);

  const cachedIds = new Set<string>();
  const skipIds   = new Set<string>(); // recently attempted, genuinely no content

  for (const row of (cached || []) as any[]) {
    if (row.images && row.images.length > 0) {
      // Good cache hit with images
      map.set(row.hotel_id, {
        name: row.name,
        lat: row.lat || 0,
        lng: row.lng || 0,
        images: row.images,
        starRating: row.star_rating || 0,
        address: row.address,
        city: row.city,
        country: row.country,
        description: row.description,
        amenities: row.amenities || [],
      });
      cachedIds.add(row.hotel_id);
    } else if (row.last_attempt_at && row.last_attempt_at > retryCutoff) {
      // We tried recently and got nothing — don't hammer TGX again yet
      skipIds.add(row.hotel_id);
      // Still populate minimal data so search results don't break
      map.set(row.hotel_id, {
        name: row.name || `Hotel ${row.hotel_id}`,
        lat: row.lat || 0,
        lng: row.lng || 0,
        images: [],
        starRating: row.star_rating || 0,
        address: row.address,
        city: row.city,
        country: row.country,
        description: row.description,
        amenities: row.amenities || [],
      });
      cachedIds.add(row.hotel_id);
    }
  }

  const missing = hotelIds.filter(id => !cachedIds.has(id));
  console.log(`[HotelContent] Cache hit: ${cachedIds.size} (${skipIds.size} skipped retry), to-fetch: ${missing.length}`);

  if (missing.length > 0) {
    // 2a. FastX first — hotel codes are in FastX format (JP27 etc.) from context 'TGX'.
    //     OTV uses its own native IDs and won't recognise JP-prefixed codes.
    const fastxResult = await fetchFromTGX(tgxEndpoint, tgxApiKey, _primaryAccessCode, missing);

    // 2b. For any hotels FastX didn't return, try OTV as a fallback
    const stillMissing = missing.filter(id => !fastxResult.has(id));
    let otvResult = new Map<string, ContentEntry>();
    if (stillMissing.length > 0) {
      console.log(`[HotelContent] FastX missed ${stillMissing.length} hotels, trying OTV...`);
      otvResult = await fetchFromTGX(tgxEndpoint, tgxApiKey, OTV_ACCESS_CODE, stillMissing);
    }

    const combined = new Map([...otvResult, ...fastxResult]); // FastX wins on conflicts

    // 2c. Synchronous ETG for up to syncEtgMax hotels without images.
    //     batch=20 concurrent (safely under the 30-req burst limit).
    //     First call: syncEtgMax=page size (15) → only first page gets sync ETG.
    //     Load More calls: syncEtgMax=page size (10) → all page hotels get sync ETG.
    const noImageIds = missing.filter(id => !combined.get(id)?.images?.length && hotelCodeToEtgHid.has(id));
    const syncEtgIds = Number.isFinite(syncEtgMax) ? noImageIds.slice(0, syncEtgMax) : noImageIds;
    if (syncEtgIds.length > 0 && etgKeyId && etgApiKey) {
      const syncMap = new Map(syncEtgIds.map(id => [id, hotelCodeToEtgHid.get(id)!]));
      console.log(`[ETG sync] Fetching images for ${syncMap.size} hotels (fast-mode)...`);
      const etgResult = await fetchFromETG(etgKeyId, etgApiKey, syncMap, /* fastMode */ true);
      for (const [id, etgData] of etgResult) {
        const existing = combined.get(id);
        if (existing) {
          existing.images = etgData.images;
          existing.starRating = existing.starRating || etgData.starRating;
          existing.description = existing.description || etgData.description;
        } else {
          combined.set(id, { name: `Hotel ${id}`, lat: 0, lng: 0, ...etgData });
        }
      }
      console.log(`[ETG sync] Got images for ${etgResult.size}/${syncMap.size} hotels.`);
    }

    // 3. Upsert TGX/OTV/sync-ETG results immediately so they are cached.
    const attemptedAt = new Date().toISOString();
    const rows = missing.map(hotel_id => {
      const c = combined.get(hotel_id);
      const source = syncEtgIds.includes(hotel_id) && (combined.get(hotel_id)?.images?.length ?? 0) > 0 ? 'ETG'
        : fastxResult.has(hotel_id) ? 'FastX'
        : otvResult.has(hotel_id) ? 'OTV'
        : null;
      return {
        hotel_id,
        name: c?.name || null,
        images: c?.images || [],
        star_rating: c?.starRating || 0,
        lat: c?.lat || 0,
        lng: c?.lng || 0,
        address: c?.address || null,
        city: c?.city || null,
        country: c?.country || null,
        description: c?.description || null,
        amenities: c?.amenities || [],
        content_source: source,
        fetched_at: attemptedAt,
        last_attempt_at: attemptedAt,
      };
    });

    const { error: upsertErr } = await supabase
      .from('hotel_content')
      .upsert(rows, { onConflict: 'hotel_id' });
    if (upsertErr) console.error('[HotelContent] Upsert error:', upsertErr.message);

    for (const [id, entry] of combined) map.set(id, entry);

    const withImages = [...combined.values()].filter(c => c.images.length > 0).length;
    console.log(`[HotelContent] ${combined.size} hotels: ${withImages} with images, ${noImageIds.length - syncEtgIds.length} queued for background ETG.`);
  }

  // 4. Join ETG/RateHawk ratings from hotel_reviews table
  if (hotelIds.length > 0) {
    const { data: reviews } = await supabase
      .from('hotel_reviews')
      .select('hotel_id, rating, reviews_count')
      .in('hotel_id', hotelIds);

    for (const row of (reviews || []) as any[]) {
      const existing = map.get(row.hotel_id);
      if (existing) {
        existing.rating = row.rating ? Number(row.rating) : undefined;
        existing.reviews = row.reviews_count || 0;
      }
    }
  }

  return map;
}

// ── City Centers for geographic hotel filtering ──────────────────
// Strategy: compute the cluster median from hotels' own coordinates (works
// for ANY city worldwide). Static entries below serve as a fast-path override
// for major cities where we want the filter applied even before coordinates load.
// The dynamic approach handles every other city automatically.
const CITY_CENTERS_STATIC: Record<string, { lat: number; lng: number }> = {
  // Asia-Pacific
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'osaka': { lat: 34.6937, lng: 135.5023 },
  'kyoto': { lat: 35.0116, lng: 135.7681 },
  'sapporo': { lat: 43.0618, lng: 141.3545 },
  'fukuoka': { lat: 33.5904, lng: 130.4017 },
  'hiroshima': { lat: 34.3853, lng: 132.4553 },
  'nara': { lat: 34.6851, lng: 135.8048 },
  'seoul': { lat: 37.5665, lng: 126.9780 },
  'busan': { lat: 35.1796, lng: 129.0756 },
  'jeju': { lat: 33.4996, lng: 126.5312 },
  'bangkok': { lat: 13.7563, lng: 100.5018 },
  'phuket': { lat: 7.8804, lng: 98.3923 },
  'chiang mai': { lat: 18.7883, lng: 98.9853 },
  'pattaya': { lat: 12.9236, lng: 100.8825 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'kuala lumpur': { lat: 3.1390, lng: 101.6869 },
  'penang': { lat: 5.4141, lng: 100.3288 },
  'langkawi': { lat: 6.3500, lng: 99.8000 },
  'ho chi minh': { lat: 10.8231, lng: 106.6297 },
  'hanoi': { lat: 21.0285, lng: 105.8542 },
  'da nang': { lat: 16.0544, lng: 108.2022 },
  'bali': { lat: -8.4095, lng: 115.1889 },
  'jakarta': { lat: -6.2088, lng: 106.8456 },
  'yogyakarta': { lat: -7.7956, lng: 110.3695 },
  'manila': { lat: 14.5995, lng: 120.9842 },
  'cebu': { lat: 10.3157, lng: 123.8854 },
  'boracay': { lat: 11.9674, lng: 121.9248 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'taipei': { lat: 25.0330, lng: 121.5654 },
  'beijing': { lat: 39.9042, lng: 116.4074 },
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'guangzhou': { lat: 23.1291, lng: 113.2644 },
  'shenzhen': { lat: 22.5431, lng: 114.0579 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'delhi': { lat: 28.6139, lng: 77.2090 },
  'goa': { lat: 15.2993, lng: 74.1240 },
  'colombo': { lat: 6.9271, lng: 79.8612 },
  'kathmandu': { lat: 27.7172, lng: 85.3240 },
  'dhaka': { lat: 23.8103, lng: 90.4125 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'melbourne': { lat: -37.8136, lng: 144.9631 },
  'brisbane': { lat: -27.4698, lng: 153.0251 },
  'auckland': { lat: -36.8509, lng: 174.7645 },
  // Middle East
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'doha': { lat: 25.2854, lng: 51.5310 },
  'istanbul': { lat: 41.0082, lng: 28.9784 },
  'riyadh': { lat: 24.7136, lng: 46.6753 },
  // Europe
  'london': { lat: 51.5074, lng: -0.1278 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'berlin': { lat: 52.5200, lng: 13.4050 },
  'frankfurt': { lat: 50.1109, lng: 8.6821 },
  'munich': { lat: 48.1351, lng: 11.5820 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'milan': { lat: 45.4642, lng: 9.1900 },
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'lisbon': { lat: 38.7223, lng: -9.1393 },
  'vienna': { lat: 48.2082, lng: 16.3738 },
  'zurich': { lat: 47.3769, lng: 8.5417 },
  'athens': { lat: 37.9838, lng: 23.7275 },
  'prague': { lat: 50.0755, lng: 14.4378 },
  'budapest': { lat: 47.4979, lng: 19.0402 },
  'warsaw': { lat: 52.2297, lng: 21.0122 },
  'stockholm': { lat: 59.3293, lng: 18.0686 },
  'copenhagen': { lat: 55.6761, lng: 12.5683 },
  'oslo': { lat: 59.9139, lng: 10.7522 },
  'brussels': { lat: 50.8503, lng: 4.3517 },
  // Americas
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'las vegas': { lat: 36.1699, lng: -115.1398 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'cancun': { lat: 21.1619, lng: -86.8515 },
  'mexico city': { lat: 19.4326, lng: -99.1332 },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
};

/** Compute median of a sorted array */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Derive city center from the cluster of hotels with known coordinates.
 *  Returns null if fewer than 3 hotels have coordinates (too few to be reliable). */
function computeClusterCenter(hotels: any[]): { lat: number; lng: number } | null {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const h of hotels) {
    const { lat, lng } = h.coordinates || {};
    if (lat && lng && Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1) {
      lats.push(lat);
      lngs.push(lng);
    }
  }
  if (lats.length < 3) return null;
  lats.sort((a, b) => a - b);
  lngs.sort((a, b) => a - b);
  return { lat: median(lats), lng: median(lngs) };
}


function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  content?: ContentEntry
) {
  const price = option.price?.gross || option.price?.net || 0;
  const isRefundable = option.cancelPolicy?.refundable === true;
  const name = content?.name || option.hotelName || `Hotel ${option.hotelCode}`;
  const lat = content?.lat || 0;
  const lng = content?.lng || 0;
  const images = content?.images || [];
  const image = images[0] || '';

  // cancelPolicy comes from the live search result — always accurate, not from cache
  const cancelPenalties = option.cancelPolicy?.cancelPenalties || [];

  return {
    hotelId: option.hotelCode,
    name,
    location: content?.city || cityName,
    address: content?.address || '',
    description: content?.description || '',
    rating: content?.rating ?? 0,
    reviews: content?.reviews ?? 0,
    price,
    currency: option.price?.currency || currency,
    image,
    images,
    amenities: content?.amenities || [],
    badges: [],
    type: 'hotel',
    coordinates: { lat, lng },
    refundableTag: isRefundable ? 'RFN' : 'NRFN',
    cancelPenalties,
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

    // ── Pagination ────────────────────────────────────────────────
    const offset = typeof body.offset === 'number' ? body.offset : 0;
    const limit  = typeof body.limit  === 'number' ? body.limit  : 15;
    // rawCacheKey excludes offset/limit — all pages share one TGX search result
    const { offset: _rco, limit: _rcl, ...bodyWithoutPagination } = body;
    const rawCacheKey = getCacheKey(bodyWithoutPagination);

    // ── Load More fast path ───────────────────────────────────────
    // If rawCache is warm (from a prior first-page call) and this is a Load More
    // request, skip the 6-14s TGX search entirely.
    const ETG_KEY_ID = Deno.env.get('ETG_KEY_ID') || Deno.env.get('RATEHAWK_KEY_ID') || '';
    const ETG_API_KEY = Deno.env.get('ETG_API_KEY') || Deno.env.get('RATEHAWK_API_KEY') || '';
    const cachedRaw = rawCache.get(rawCacheKey);
    if (cachedRaw && Date.now() < cachedRaw.expiresAt && offset > 0) {
      const { filteredOptions, hotelCodeToEtgHid: etgHidMap } = cachedRaw.data;
      const totalCount   = filteredOptions.length;
      const pageOptions  = filteredOptions.slice(offset, offset + limit);
      const pageCodes    = [...new Set(pageOptions.map((o: any) => o.hotelCode))];
      const contentMap   = await fetchHotelContent(
        supabase, ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE,
        pageCodes, etgHidMap, ETG_KEY_ID, ETG_API_KEY, pageCodes.length
      );
      const pageHotels   = pageOptions.map((option: any) =>
        transformOptionToHotel(option, cityName, currency, contentMap.get(option.hotelCode))
      );
      console.log(`[RawCache HIT] offset=${offset} → ${pageHotels.length}/${totalCount} in ${Date.now()-t0}ms`);
      return new Response(JSON.stringify({ data: pageHotels, totalCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'RAW-HIT' },
        status: 200,
      });
    }

    if (!checkin || !checkout) {
      throw new Error('checkin and checkout are required');
    }

    // Destination: resolve ALL sub-area codes dynamically via destinationSearcher (maxSize=200).
    // This replaces hardcoded CITY_ALIASES and CITY_NEIGHBORHOODS with full API discovery.
    let destCodes: string[] = [];
    let fallbackHotelCodes: string[] = [];

    const overrideDestCode = destinationCode || '';
    if (overrideDestCode) {
      // Explicit destinationCode passed (e.g. from URL param) — use as-is
      destCodes = [overrideDestCode];
    } else if (cityName) {
      const { destCodes: resolved, resolvedFrom, fallbackHotelCodes: hotelFallback } = await resolveDestinationWithFallbacks(
        ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE, cityName, countryCode
      );
      if (resolved.length > 0) {
        destCodes = resolved;
        console.log(`[TravelgateX] Resolved "${cityName}" via "${resolvedFrom}" → ${destCodes.length} codes: ${destCodes.slice(0,5).join(', ')}`);
      } else {
        fallbackHotelCodes = hotelFallback;
        console.warn(`[TravelgateX] No destination codes for "${cityName}" — fallback hotel codes: ${fallbackHotelCodes.length}`);
      }
    }

    if (destCodes.length === 0 && fallbackHotelCodes.length === 0) {
      return new Response(JSON.stringify({
        data: [],
        totalCount: 0,
        _debug: {
          error: 'No destination codes or hotel codes resolved — supplier catalog may not cover this destination',
          cityName,
          countryCode,
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
    if (destCodes.length > 0) {
      // Use ALL resolved destination codes — covers city + all sub-areas/neighborhoods
      criteriaSearch.destinations = destCodes;
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
      // search_by_destination plugin is only needed when searching by destination codes
        ...(destCodes.length > 0 ? {
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

    // Group by hotel, pick cheapest option, sort price-asc
    const hotelMap = groupByHotel(options);
    const sortedOptions = Array.from(hotelMap.values())
      .sort((a: any, b: any) => {
        const pa = a.price?.gross || a.price?.net || Infinity;
        const pb = b.price?.gross || b.price?.net || Infinity;
        return pa - pb;
      });
    const uniqueCodes = sortedOptions.map((o: any) => o.hotelCode);

    // ETG HID map (extracted from option tokens)
    const hotelCodeToEtgHid = new Map<string, string>();
    for (const option of sortedOptions) {
      const hid = extractEtgHid(option.id);
      if (hid && option.hotelCode) hotelCodeToEtgHid.set(option.hotelCode, hid);
    }
    console.log(`[HotelContent] ETG HID map: ${hotelCodeToEtgHid.size}/${uniqueCodes.length} have ETG HIDs`);

    // Fetch content for ALL hotels (TGX name/address/coords + ETG for first page only)
    const contentMap = await fetchHotelContent(
      supabase, ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE,
      uniqueCodes, hotelCodeToEtgHid, ETG_KEY_ID, ETG_API_KEY, limit
    );

    // Transform ALL hotels then geo-filter in one pass (tracks filtered raw options too)
    const cityKey = cityName.toLowerCase().trim();
    const allHotels = sortedOptions.map((o: any) =>
      transformOptionToHotel(o, cityName, currency, contentMap.get(o.hotelCode))
    );
    const cityCenter = CITY_CENTERS_STATIC[cityKey] ?? computeClusterCenter(allHotels);
    const GEO_RADIUS_KM = 80;

    const filteredPairs: [any, any][] = [];
    for (let i = 0; i < allHotels.length; i++) {
      const hotel = allHotels[i];
      if (cityCenter) {
        const { lat, lng } = (hotel as any).coordinates || {};
        if (lat && lng) {
          const dist = haversineKm(cityCenter.lat, cityCenter.lng, lat, lng);
          if (dist > GEO_RADIUS_KM) {
            console.log(`[GeoFilter] Dropping ${hotel.name} — ${dist.toFixed(0)}km`);
            continue;
          }
        }
      }
      filteredPairs.push([hotel, sortedOptions[i]]);
    }
    const filteredHotels  = filteredPairs.map(([h]) => h);
    const filteredOptions = filteredPairs.map(([, o]) => o);
    if (cityCenter) console.log(`[GeoFilter] ${allHotels.length} → ${filteredHotels.length} hotels within ${GEO_RADIUS_KM}km`);

    // Cache filtered raw options for Load More calls (skips 6-14s TGX search)
    rawCache.set(rawCacheKey, {
      data: { filteredOptions, hotelCodeToEtgHid },
      expiresAt: Date.now() + RAW_CACHE_TTL_MS,
    });

    // Background ETG for hotels beyond first page (ready before user clicks Load More)
    const bgCodes = filteredOptions.slice(limit).map((o: any) => o.hotelCode)
      .filter((id: string) => hotelCodeToEtgHid.has(id) && !contentMap.get(id)?.images?.length);
    const etgBgMap = new Map(bgCodes.map((id: string) => [id, hotelCodeToEtgHid.get(id)!]));
    if (etgBgMap.size > 0 && ETG_KEY_ID && ETG_API_KEY) {
      console.log(`[ETG BG] Background enrichment for ${etgBgMap.size} hotels (page 2+)...`);
      EdgeRuntime.waitUntil(enrichWithETGAndSave(supabase, etgBgMap, ETG_KEY_ID, ETG_API_KEY, contentMap));
    }

    const totalCount = filteredHotels.length;
    const pageHotels = filteredHotels.slice(offset, offset + limit);

    console.log(JSON.stringify({
      _event: 'travelgatex_search_analytics',
      cityName, countryCode, checkin, checkout, rooms, adults, children,
      optionCount: options.length, hotelCount: totalCount, pageSize: pageHotels.length,
      destCodeCount: destCodes.length, destCodes: destCodes.slice(0, 5),
      duration_ms: Date.now() - t0, api_ms: t2 - t1,
      testMode: false, timestamp: new Date().toISOString(),
    }));

    const responseData = {
      data: pageHotels,
      totalCount,
      // Provide minimal data for ALL mappable hotels so the map can show pins immediately
      allMappable: filteredHotels.map(h => ({
        id: h.hotelId,
        name: h.name,
        price: h.price,
        currency: h.currency,
        coordinates: h.coordinates,
        rating: h.rating,
        starRating: h.starRating,
        image: h.image,
        provider: h._tgx?.supplierCode || 'TGX'
      }))
    };
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
