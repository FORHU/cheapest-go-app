import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Rate limiting ────────────────────────────────────────────────
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const attempts = new Map<string, number[]>();
setInterval(() => {
  const now = Date.now();
  attempts.forEach((ts, ip) => {
    const recent = ts.filter(t => now - t < WINDOW_MS);
    if (recent.length === 0) attempts.delete(ip); else attempts.set(ip, recent);
  });
}, 60_000);
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const ts = attempts.get(ip) ?? [];
  const recent = ts.filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) { attempts.set(ip, recent); return true; }
  recent.push(now); attempts.set(ip, recent); return false;
}

// ── GraphQL query (destinationSearcher for text-based search) ────
const DESTINATION_SEARCHER_QUERY = `
query DestinationSearcher($criteria: HotelXDestinationSearcherInput!) {
  hotelX {
    destinationSearcher(criteria: $criteria) {
      ... on DestinationData {
        code
        available
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

// ── Main Handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const TRAVELGATEX_API_KEY = Deno.env.get('TRAVELGATEX_API_KEY');
  // Use TTHOTTEST (5647) for destination search — it has the TGX-context catalog.
  // FastX (37606) catalog is not synced, but TGX context codes are shared across accesses.
  const TRAVELGATEX_CODE = '5647';

  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    const { keyword } = await req.json();

    if (!keyword || keyword.length < 2) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const variables = {
      criteria: {
        access: TRAVELGATEX_CODE,
        text: keyword,
        maxSize: 10,
      },
    };

    const response = await fetch('https://api.travelgate.com', {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`,
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({ query: DESTINATION_SEARCHER_QUERY, variables }),
    });

    if (!response.ok) throw new Error(`TravelgateX ${response.status}`);

    const result = await response.json();
    console.log('[destinations] raw:', JSON.stringify(result).substring(0, 500));

    if (result.errors) throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);

    const items: any[] = result.data?.hotelX?.destinationSearcher || [];

    // Keep only DestinationData items (have `code`), not HotelData (have `hotelCode`).
    // Do NOT filter by `available` — TTHOTTEST destinations are available:false but the
    // TGX context codes are still valid for FastX searches.
    const data = items
      .filter((item: any) => item.code && !item.hotelCode)
      .map((item: any) => {
        const name =
          item.texts?.find((t: any) => t.language === 'en')?.text ||
          item.texts?.[0]?.text ||
          item.code;
        return { code: item.code, type: item.type || 'city', name };
      })
      .filter((item: any, idx: number, arr: any[]) =>
        arr.findIndex((x: any) => x.code === item.code) === idx
      );

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[TravelgateX Destinations Error]', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
