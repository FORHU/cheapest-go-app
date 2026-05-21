const DEST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ETG_API_BASE      = 'https://api.worldota.net';

/** Resolve a city name → OTV/ETG region_id via ETG multicomplete. */
async function resolveETGRegionId(
  cityName: string,
  etgAuth: string
): Promise<string | null> {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(`${ETG_API_BASE}/api/b2b/v3/search/multicomplete/`, {
        method:  'POST',
        headers: { 'Authorization': `Basic ${etgAuth}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: cityName, language: 'en', limit: 5 }),
        signal:  ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const json    = await res.json();
    const regions = json?.data?.regions as any[] || [];
    // Prefer exact City-type match, then any City, then first region
    const match =
      regions.find(r => r.type === 'City' && r.name.toLowerCase() === cityName.toLowerCase()) ||
      regions.find(r => r.type === 'City') ||
      regions[0];
    if (!match) return null;
    console.log(`[DestResolve] ETG multicomplete "${cityName}" → region_id=${match.id} (${match.name}, ${match.type})`);
    return String(match.id);
  } catch {
    return null;
  }
}

export async function resolveDestinationWithFallbacks(
  cityName: string,
  _countryCode: string,
  supabase: any,
  etgKeyId: string,
  etgApiKey: string,
): Promise<{ destCodes: string[]; resolvedFrom: string; fallbackHotelCodes: string[] }> {
  const cityKey = cityName.toLowerCase().trim();

  // Check DB cache first
  if (supabase) {
    try {
      const { data } = await supabase
        .from('dest_code_cache')
        .select('dest_codes, hotel_codes')
        .eq('city_key', cityKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (data?.dest_codes?.length > 0) {
        console.log(`[DestResolve] DB cache hit for "${cityName}" → region_id=${data.dest_codes[0]}`);
        return { destCodes: data.dest_codes, resolvedFrom: cityName, fallbackHotelCodes: [] };
      }
    } catch (e: any) {
      console.error('[DestResolve] DB cache read error:', e.message);
    }
  }

  if (!etgKeyId || !etgApiKey) {
    return { destCodes: [], resolvedFrom: cityName, fallbackHotelCodes: [] };
  }

  const etgAuth = btoa(`${etgKeyId}:${etgApiKey}`);

  // Try exact name, then strip common suffixes
  let regionId = await resolveETGRegionId(cityName, etgAuth);

  if (!regionId) {
    const simplified = cityName.replace(/\s+(city|province|island|metro|region|district|town|municipality)$/i, '').trim();
    if (simplified && simplified !== cityName) {
      regionId = await resolveETGRegionId(simplified, etgAuth);
    }
  }

  if (regionId) {
    await saveDestCache(supabase, cityKey, [regionId], []);
    return { destCodes: [regionId], resolvedFrom: cityName, fallbackHotelCodes: [] };
  }

  console.warn(`[DestResolve] No region_id found for "${cityName}"`);
  return { destCodes: [], resolvedFrom: cityName, fallbackHotelCodes: [] };
}

async function saveDestCache(supabase: any, cityKey: string, destCodes: string[], hotelCodes: string[]) {
  if (!supabase) return;
  const expiresAt = new Date(Date.now() + DEST_CACHE_TTL_MS).toISOString();
  const { error } = await supabase
    .from('dest_code_cache')
    .upsert(
      { city_key: cityKey, dest_codes: destCodes, hotel_codes: hotelCodes, fetched_at: new Date().toISOString(), expires_at: expiresAt },
      { onConflict: 'city_key' }
    );
  if (error) console.error('[DestResolve] DB cache save error:', error.message);
  else console.log(`[DestResolve] Cached region_id for "${cityKey}": ${destCodes[0]}`);
}
