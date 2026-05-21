/**
 * enrich-hotel-ratings
 *
 * Backfills review_rating + review_count on hotel_content rows that have
 * coordinates but no rating from ETG, using the Google Places Find Place API.
 *
 * Google rating (1–5) is scaled to our 0–10 system (× 2).
 *
 * POST body (all optional):
 *   { limit?: number, force?: boolean }
 *   limit  — max hotels to process per run (default 50, max 200)
 *   force  — re-enrich hotels that were already enriched (default false)
 *
 * Returns:
 *   { processed, enriched, skipped, errors, durationMs }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_FIND_PLACE_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const REENRICH_AFTER_DAYS = 30;
const DELAY_BETWEEN_REQUESTS_MS = 120; // ~8 req/s, well under Google's 10 req/s QPS

interface Hotel {
  hotel_id: string;
  name: string | null;
  lat: number;
  lng: number;
  review_rating: number | null;
  google_enriched_at: string | null;
}

interface PlacesResult {
  placeId: string | null;
  rating: number | null;       // already on 0–10 scale
  reviewCount: number | null;
  found: boolean;
}

async function findPlaceRating(
  name: string,
  lat: number,
  lng: number,
  apiKey: string
): Promise<PlacesResult> {
  const params = new URLSearchParams({
    input: name,
    inputtype: 'textquery',
    fields: 'rating,user_ratings_total,place_id,name',
    // 500m radius bias — tight enough to avoid wrong hotels in dense cities
    locationbias: `circle:500@${lat},${lng}`,
    key: apiKey,
  });

  const res = await fetch(`${GOOGLE_FIND_PLACE_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Google Places API HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(`Google Places API denied: ${data.error_message ?? 'unknown'}`);
  }

  if (data.status === 'ZERO_RESULTS' || !data.candidates?.length) {
    return { placeId: null, rating: null, reviewCount: null, found: false };
  }

  const place = data.candidates[0];
  const googleRating = typeof place.rating === 'number' ? place.rating : null;

  return {
    placeId: place.place_id ?? null,
    // Scale 1–5 → 0–10
    rating: googleRating !== null ? Math.round(googleRating * 2 * 10) / 10 : null,
    reviewCount: typeof place.user_ratings_total === 'number' ? place.user_ratings_total : null,
    found: true,
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startMs = Date.now();

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleApiKey    = Deno.env.get('GOOGLE_PLACES_API_KEY');

  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { limit?: number; force?: boolean } = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch { /* no body is fine */ }

  const limit = Math.min(Number(body.limit ?? 50), 200);
  const force = body.force === true;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch hotels that need enrichment
  const cutoff = new Date(Date.now() - REENRICH_AFTER_DAYS * 86400_000).toISOString();
  let query = supabase
    .from('hotel_content')
    .select('hotel_id, name, lat, lng, review_rating, google_enriched_at')
    .neq('lat', 0)
    .neq('lng', 0)
    .not('name', 'is', null)
    .limit(limit);

  if (force) {
    // Re-enrich everything with coordinates, regardless of existing rating
    query = query.or(`google_enriched_at.is.null,google_enriched_at.lt.${cutoff}`);
  } else {
    // Only enrich hotels with no rating and never enriched (or enriched long ago)
    query = query.is('review_rating', null).or(`google_enriched_at.is.null,google_enriched_at.lt.${cutoff}`);
  }

  const { data: hotels, error: fetchErr } = await query;

  if (fetchErr) {
    return new Response(JSON.stringify({ error: 'DB query failed', details: fetchErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = (hotels ?? []) as Hotel[];
  console.log(`[enrich-hotel-ratings] Processing ${rows.length} hotels (force=${force})`);

  let enriched = 0;
  let skipped  = 0;
  const errors: string[] = [];

  for (const hotel of rows) {
    if (!hotel.name?.trim()) { skipped++; continue; }

    try {
      const result = await findPlaceRating(hotel.name, hotel.lat, hotel.lng, googleApiKey);

      const updatePayload: Record<string, unknown> = {
        google_enriched_at: new Date().toISOString(),
        ...(result.placeId && { google_place_id: result.placeId }),
      };

      if (result.found && result.rating !== null) {
        updatePayload.review_rating = result.rating;
        if (result.reviewCount !== null) {
          updatePayload.review_count = result.reviewCount;
        }
        enriched++;
        console.log(`[enrich] ${hotel.hotel_id} "${hotel.name}" → ${result.rating}/10 (${result.reviewCount ?? '?'} reviews)`);
      } else {
        skipped++;
        console.log(`[enrich] ${hotel.hotel_id} "${hotel.name}" → not found on Google Places`);
      }

      await supabase
        .from('hotel_content')
        .update(updatePayload)
        .eq('hotel_id', hotel.hotel_id);

    } catch (err: any) {
      const msg = `${hotel.hotel_id} (${hotel.name}): ${err.message}`;
      errors.push(msg);
      console.error('[enrich] Error:', msg);

      // On API key error, abort immediately — no point retrying
      if (err.message?.includes('denied')) break;
    }

    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  const durationMs = Date.now() - startMs;
  const summary = {
    processed: rows.length,
    enriched,
    skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 10), // cap payload size
    durationMs,
  };

  console.log(`[enrich-hotel-ratings] Done:`, summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});
