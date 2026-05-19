import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveDestinationWithFallbacks } from '../travelgatex-search/destinations.ts';

declare const Deno: any;

// ── Popular destinations to pre-warm ─────────────────────────────
const POPULAR_CITIES: Array<{ city: string; country: string }> = [
  // Asia
  { city: 'Tokyo', country: 'JP' },
  { city: 'Osaka', country: 'JP' },
  { city: 'Kyoto', country: 'JP' },
  { city: 'Bangkok', country: 'TH' },
  { city: 'Phuket', country: 'TH' },
  { city: 'Chiang Mai', country: 'TH' },
  { city: 'Bali', country: 'ID' },
  { city: 'Jakarta', country: 'ID' },
  { city: 'Singapore', country: 'SG' },
  { city: 'Kuala Lumpur', country: 'MY' },
  { city: 'Seoul', country: 'KR' },
  { city: 'Busan', country: 'KR' },
  { city: 'Ho Chi Minh City', country: 'VN' },
  { city: 'Hanoi', country: 'VN' },
  { city: 'Da Nang', country: 'VN' },
  { city: 'Manila', country: 'PH' },
  { city: 'Cebu', country: 'PH' },
  { city: 'Boracay', country: 'PH' },
  { city: 'Hong Kong', country: 'HK' },
  { city: 'Taipei', country: 'TW' },
  { city: 'Beijing', country: 'CN' },
  { city: 'Shanghai', country: 'CN' },
  { city: 'Chengdu', country: 'CN' },
  { city: 'Mumbai', country: 'IN' },
  { city: 'Delhi', country: 'IN' },
  { city: 'Goa', country: 'IN' },
  { city: 'Colombo', country: 'LK' },
  { city: 'Maldives', country: 'MV' },
  { city: 'Kathmandu', country: 'NP' },
  { city: 'Dhaka', country: 'BD' },
  // Middle East
  { city: 'Dubai', country: 'AE' },
  { city: 'Abu Dhabi', country: 'AE' },
  { city: 'Doha', country: 'QA' },
  { city: 'Riyadh', country: 'SA' },
  { city: 'Istanbul', country: 'TR' },
  { city: 'Antalya', country: 'TR' },
  { city: 'Amman', country: 'JO' },
  { city: 'Beirut', country: 'LB' },
  { city: 'Tel Aviv', country: 'IL' },
  // Europe
  { city: 'London', country: 'GB' },
  { city: 'Paris', country: 'FR' },
  { city: 'Rome', country: 'IT' },
  { city: 'Milan', country: 'IT' },
  { city: 'Venice', country: 'IT' },
  { city: 'Florence', country: 'IT' },
  { city: 'Barcelona', country: 'ES' },
  { city: 'Madrid', country: 'ES' },
  { city: 'Amsterdam', country: 'NL' },
  { city: 'Berlin', country: 'DE' },
  { city: 'Munich', country: 'DE' },
  { city: 'Vienna', country: 'AT' },
  { city: 'Prague', country: 'CZ' },
  { city: 'Budapest', country: 'HU' },
  { city: 'Warsaw', country: 'PL' },
  { city: 'Athens', country: 'GR' },
  { city: 'Santorini', country: 'GR' },
  { city: 'Lisbon', country: 'PT' },
  { city: 'Porto', country: 'PT' },
  { city: 'Brussels', country: 'BE' },
  { city: 'Zurich', country: 'CH' },
  { city: 'Geneva', country: 'CH' },
  { city: 'Copenhagen', country: 'DK' },
  { city: 'Stockholm', country: 'SE' },
  { city: 'Oslo', country: 'NO' },
  { city: 'Helsinki', country: 'FI' },
  { city: 'Dublin', country: 'IE' },
  { city: 'Edinburgh', country: 'GB' },
  { city: 'Reykjavik', country: 'IS' },
  { city: 'Dubrovnik', country: 'HR' },
  { city: 'Krakow', country: 'PL' },
  { city: 'Bucharest', country: 'RO' },
  { city: 'Sofia', country: 'BG' },
  { city: 'Tallinn', country: 'EE' },
  { city: 'Riga', country: 'LV' },
  // Americas
  { city: 'New York', country: 'US' },
  { city: 'Los Angeles', country: 'US' },
  { city: 'Miami', country: 'US' },
  { city: 'Las Vegas', country: 'US' },
  { city: 'Chicago', country: 'US' },
  { city: 'San Francisco', country: 'US' },
  { city: 'Orlando', country: 'US' },
  { city: 'Honolulu', country: 'US' },
  { city: 'Seattle', country: 'US' },
  { city: 'Boston', country: 'US' },
  { city: 'Washington DC', country: 'US' },
  { city: 'Toronto', country: 'CA' },
  { city: 'Vancouver', country: 'CA' },
  { city: 'Montreal', country: 'CA' },
  { city: 'Mexico City', country: 'MX' },
  { city: 'Cancun', country: 'MX' },
  { city: 'Tulum', country: 'MX' },
  { city: 'Havana', country: 'CU' },
  { city: 'Bogota', country: 'CO' },
  { city: 'Medellin', country: 'CO' },
  { city: 'Buenos Aires', country: 'AR' },
  { city: 'Santiago', country: 'CL' },
  { city: 'Lima', country: 'PE' },
  { city: 'Rio de Janeiro', country: 'BR' },
  { city: 'Sao Paulo', country: 'BR' },
  { city: 'Cartagena', country: 'CO' },
  // Africa & Oceania
  { city: 'Cape Town', country: 'ZA' },
  { city: 'Johannesburg', country: 'ZA' },
  { city: 'Nairobi', country: 'KE' },
  { city: 'Cairo', country: 'EG' },
  { city: 'Marrakech', country: 'MA' },
  { city: 'Casablanca', country: 'MA' },
  { city: 'Sydney', country: 'AU' },
  { city: 'Melbourne', country: 'AU' },
  { city: 'Brisbane', country: 'AU' },
  { city: 'Auckland', country: 'NZ' },
  { city: 'Queenstown', country: 'NZ' },
  // Philippines (target market)
  { city: 'Palawan', country: 'PH' },
  { city: 'Siargao', country: 'PH' },
  { city: 'Davao', country: 'PH' },
  { city: 'Iloilo', country: 'PH' },
  { city: 'Tagaytay', country: 'PH' },
];

// One city at a time — TGX destinationSearcher is not parallelism-friendly
const PARALLEL    = 1;
// Stop processing new cities when this much time is left before the 150s function limit
const RESERVE_MS  = 10000;
const START_LIMIT = 140000; // ms budget for processing

const ENDPOINT = 'https://api.travelgate.com';

Deno.serve(async (req: Request) => {
  const seedSecret = Deno.env.get('SEED_SECRET');
  const authHeader = req.headers.get('Authorization') || '';
  if (!seedSecret || authHeader !== `Bearer ${seedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const tgxApiKey  = Deno.env.get('TRAVELGATEX_API_KEY') || '';
  const accessCode = Deno.env.get('TRAVELGATEX_CODE')    || '37606';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')              ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const body   = await req.json().catch(() => ({}));
  const offset = Number(body.offset ?? 0);
  const total  = POPULAR_CITIES.length;

  if (offset >= total) {
    console.log('[SeedDestCache] All cities done!');
    return new Response(JSON.stringify({ done: true, total }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const startedAt  = Date.now();
  let currentOffset = offset;
  let processed     = 0;

  // Process one city at a time until we're running low on time
  while (currentOffset < total) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > START_LIMIT - RESERVE_MS) {
      console.log(`[SeedDestCache] Time limit approaching at ${elapsed}ms — stopping at offset ${currentOffset}`);
      break;
    }

    const { city, country } = POPULAR_CITIES[currentOffset];
    console.log(`[SeedDestCache] [${currentOffset + 1}/${total}] Processing "${city}" (${country})...`);

    try {
      const PER_CITY_TIMEOUT_MS = 90000;
      const resolveP  = resolveDestinationWithFallbacks(ENDPOINT, tgxApiKey, accessCode, city, country, supabase);
      const timeoutP  = new Promise<null>(res => setTimeout(() => res(null), PER_CITY_TIMEOUT_MS));
      const r = await Promise.race([resolveP, timeoutP]);
      if (r) console.log(`[SeedDestCache] "${city}" → ${r.destCodes.length} dest codes, ${r.fallbackHotelCodes.length} hotel fallbacks`);
      else    console.warn(`[SeedDestCache] "${city}" timed out after ${PER_CITY_TIMEOUT_MS / 1000}s — skipping`);
    } catch (e: any) {
      console.error(`[SeedDestCache] "${city}" failed:`, e.message);
    }

    currentOffset += PARALLEL;
    processed++;
  }

  const done       = currentOffset >= total;
  const nextOffset = done ? null : currentOffset;

  console.log(`[SeedDestCache] Batch done — processed ${processed} cities, nextOffset=${nextOffset ?? 'done'}`);

  return new Response(JSON.stringify({
    done,
    processed: currentOffset,
    total,
    nextOffset,
    elapsedMs: Date.now() - startedAt,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
