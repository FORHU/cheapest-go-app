import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: any;

const ETG_API_BASE = 'https://api.worldota.net';

// ISO-3166-1 alpha-2 country codes — prioritised by search volume.
// The seeder works through this list one country per invocation.
const ALL_COUNTRIES: string[] = [
  // High-volume first
  'JP','TH','ID','SG','MY','PH','KR','CN','HK','TW','VN','IN','AE','TR','GB','FR','IT','ES',
  'DE','NL','AT','CH','GR','PT','PL','CZ','HU','HR','RO','BG','EE','LV','LT','IS','IE','DK',
  'SE','NO','FI','BE','US','CA','MX','BR','AR','CL','CO','PE','AU','NZ','ZA','EG','MA','KE',
  'QA','SA','JO','LB','IL','LK','MV','NP','BD','KH','MM','LA','BN','TL','MO','MN','UZ','KZ',
  'GE','AM','AZ','UA','BY','RS','BA','SI','SK','MK','AL','ME','XK','LU','MT','CY','LI','AD',
  'MC','SM','VA','CU','DO','PR','JM','BB','TT','HT','GT','HN','SV','NI','CR','PA','PY','UY',
  'BO','EC','VE','GY','SR','GH','NG','TZ','UG','ET','CI','SN','CM','MZ','MG','MU','SC','CV',
  'FJ','PG','WS','TO','SB','VU','PF','NC','NR','PW','FM','MH','KI','TV','CK','NU','WF','TK',
  'RU','PK','AF','IR','IQ','SY','YE','OM','KW','BH','LY','TN','DZ','SD','SO','DJ','ER',
];

// Normalize hotel name for matching: lowercase, collapse whitespace, strip punctuation
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ETG hotel list for a country — paginated
async function fetchHotelsForCountry(
  auth: string,
  countryCode: string,
  page: number,
  pageSize = 1000
): Promise<{ hotels: any[]; hasMore: boolean }> {
  const ctrl    = new AbortController();
  const timer   = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${ETG_API_BASE}/api/b2b/v3/hotel/list/`, {
      method:  'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: { country: countryCode },
        language: 'en',
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[ETGIndex] ${countryCode} page=${page} HTTP ${res.status}: ${text.substring(0, 200)}`);
      return { hotels: [], hasMore: false };
    }

    const json = await res.json();
    // ETG list response may vary — handle both array and paginated object forms
    const data    = json?.data ?? json;
    const hotels  = Array.isArray(data) ? data
      : Array.isArray(data?.hotels) ? data.hotels
      : [];
    const total   = data?.total_count ?? data?.total ?? hotels.length;
    const hasMore = page * pageSize < total;

    console.log(`[ETGIndex] ${countryCode} page=${page} → ${hotels.length} hotels (total=${total})`);
    return { hotels, hasMore };
  } catch (e: any) {
    clearTimeout(timer);
    console.error(`[ETGIndex] ${countryCode} page=${page} error: ${e.message}`);
    return { hotels: [], hasMore: false };
  }
}

Deno.serve(async (req: Request) => {
  const seedSecret = Deno.env.get('SEED_SECRET');
  const authHeader = req.headers.get('Authorization') || '';
  if (!seedSecret || authHeader !== `Bearer ${seedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const etgKeyId  = Deno.env.get('ETG_KEY_ID')  || Deno.env.get('RATEHAWK_KEY_ID')  || '';
  const etgApiKey = Deno.env.get('ETG_API_KEY') || Deno.env.get('RATEHAWK_API_KEY') || '';
  if (!etgKeyId || !etgApiKey) {
    return new Response(JSON.stringify({ error: 'ETG credentials not set' }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')              ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const body = await req.json().catch(() => ({}));
  // Allow caller to specify a country to force-reseed, otherwise pick next pending
  const forceCountry: string | undefined = body.country?.toUpperCase();

  let countryCode: string;
  if (forceCountry) {
    countryCode = forceCountry;
  } else {
    // Find next country not yet seeded
    const { data: done } = await supabase
      .from('etg_index_status')
      .select('country_code')
      .eq('status', 'done');
    const doneSet = new Set((done || []).map((r: any) => r.country_code));
    const next = ALL_COUNTRIES.find(c => !doneSet.has(c));
    if (!next) {
      return new Response(JSON.stringify({ done: true, message: 'All countries indexed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    countryCode = next;
  }

  console.log(`[ETGIndex] Starting country: ${countryCode}`);
  await supabase.from('etg_index_status').upsert(
    { country_code: countryCode, status: 'seeding', last_error: null },
    { onConflict: 'country_code' }
  );

  const auth      = btoa(`${etgKeyId}:${etgApiKey}`);
  const startedAt = Date.now();
  const BUDGET_MS = 130000; // leave 20s buffer before 150s function limit
  const PAGE_SIZE = 1000;

  let page         = body.page ?? 1;
  let totalIndexed = body.totalIndexed ?? 0;
  let hasMore      = true;

  while (hasMore && (Date.now() - startedAt) < BUDGET_MS) {
    const { hotels, hasMore: more } = await fetchHotelsForCountry(auth, countryCode, page, PAGE_SIZE);
    hasMore = more;

    if (hotels.length > 0) {
      const rows = hotels
        .filter((h: any) => h.id || h.hid)
        .map((h: any) => ({
          hid:             Number(h.id ?? h.hid),
          name:            h.name || h.title || '',
          name_normalized: normalizeName(h.name || h.title || ''),
          lat:             Number(h.latitude  || h.coords?.lat  || h.location?.lat  || 0),
          lng:             Number(h.longitude || h.coords?.lon  || h.location?.lon  || 0),
          country_code:    (h.country ?? countryCode).toUpperCase().slice(0, 2),
          region_id:       h.region_id ? Number(h.region_id) : null,
          star_rating:     Number(h.star_rating || h.stars || 0),
          indexed_at:      new Date().toISOString(),
        }))
        .filter((r: any) => r.hid > 0 && r.name);

      if (rows.length > 0) {
        const { error } = await supabase
          .from('etg_hotel_index')
          .upsert(rows, { onConflict: 'hid' });
        if (error) console.error(`[ETGIndex] upsert error page=${page}:`, error.message);
        else totalIndexed += rows.length;
      }
    }

    console.log(`[ETGIndex] ${countryCode} page=${page} done — totalIndexed=${totalIndexed} elapsed=${Date.now() - startedAt}ms`);
    page++;

    if (!hasMore) break;
  }

  const timedOut = hasMore && (Date.now() - startedAt) >= BUDGET_MS;

  if (!timedOut && !hasMore) {
    await supabase.from('etg_index_status').upsert(
      { country_code: countryCode, status: 'done', hotel_count: totalIndexed, last_seeded_at: new Date().toISOString() },
      { onConflict: 'country_code' }
    );
    console.log(`[ETGIndex] ${countryCode} fully indexed — ${totalIndexed} hotels`);
  } else {
    console.log(`[ETGIndex] ${countryCode} timed out at page=${page} — resume with page=${page}`);
  }

  return new Response(JSON.stringify({
    countryCode,
    page,
    totalIndexed,
    done: !timedOut && !hasMore,
    nextPage: timedOut ? page : null,
    elapsedMs: Date.now() - startedAt,
  }), { headers: { 'Content-Type': 'application/json' } });
});
