import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCacheKey, getFromCache, setCache, getRawCache, setRawCache } from './cache.ts';
import { resolveDestinationWithFallbacks } from './destinations.ts';
import { CITY_CENTERS_STATIC, computeClusterCenter, haversineKm } from './geo.ts';
import { fetchHotelContent } from './content.ts';
import { SEARCH_QUERY, buildOccupancies, groupByHotel, extractEtgHid } from './search.ts';
import { transformOptionToHotel } from './transform.ts';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENDPOINT         = 'https://api.travelgate.com';
const OTV_SUPPLIER     = 'OTV';
const OTV_CONTEXT      = 'OTV';
const OTV_ACCESS_CODE  = '38327';
const GEO_RADIUS_KM    = 30;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const TRAVELGATEX_API_KEY = Deno.env.get('TRAVELGATEX_API_KEY');
  const TRAVELGATEX_CLIENT  = Deno.env.get('TRAVELGATEX_CLIENT') || 'forhuinc';
  const TRAVELGATEX_TEST_MODE = Deno.env.get('TRAVELGATEX_TEST_MODE') === 'true';
  const ETG_KEY_ID  = Deno.env.get('ETG_KEY_ID')  || Deno.env.get('RATEHAWK_KEY_ID')  || '';
  const ETG_API_KEY = Deno.env.get('ETG_API_KEY') || Deno.env.get('RATEHAWK_API_KEY') || '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const t0   = Date.now();
    const body = await req.json();
    console.log('===== OTV SEARCH REQUEST =====', JSON.stringify(body).substring(0, 300));

    // ── In-memory response cache ──────────────────────────────────
    const cacheKey = getCacheKey(body);
    const cached   = getFromCache(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${Date.now() - t0}ms`);
      const ndjson = [
        JSON.stringify({ type: 'hotels', source: 'cache', data: cached.data || [], allMappable: cached.allMappable || [], totalCount: cached.totalCount || 0 }),
        JSON.stringify({ type: 'done', totalCount: cached.totalCount || 0 }),
      ].join('\n') + '\n';
      return new Response(ndjson, {
        headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'X-Cache': 'HIT' },
      });
    }

    // Normalize params
    const checkin  = body.checkin  || body.checkIn;
    const checkout = body.checkout || body.checkOut;
    const {
      adults = 2, children = 0, childrenAges = [], rooms = 1,
      currency = 'USD', guest_nationality: nationality = 'KR',
      countryCode = '',
      destinationCode,
    } = body;
    const cityName: string = body.cityName || body.destination || '';

    const offset = typeof body.offset === 'number' ? body.offset : 0;
    const limit  = typeof body.limit  === 'number' ? body.limit  : 15;
    const { offset: _o, limit: _l, ...bodyWithoutPagination } = body;
    const rawCacheKey = getCacheKey(bodyWithoutPagination);

    // ── Load More fast path ───────────────────────────────────────
    const cachedRaw = getRawCache(rawCacheKey);
    if (cachedRaw && offset > 0) {
      const fallbackCity = cityName || body.destination || '';
      const pageHotels  = cachedRaw.allHotels
        .slice(offset, offset + limit)
        .map((h: any) => (h.location || !fallbackCity) ? h : { ...h, location: fallbackCity });
      console.log(`[RawCache HIT] offset=${offset} → ${pageHotels.length}/${cachedRaw.allHotels.length} in ${Date.now() - t0}ms`);
      return new Response(JSON.stringify({ data: pageHotels, totalCount: cachedRaw.allHotels.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'RAW-HIT' },
      });
    }

    if (!checkin || !checkout) throw new Error('checkin and checkout are required');

    // ── DB search cache check (pre-warmed by cron) ────────────────
    if (cityName && offset === 0) {
      try {
        const dbCacheKey = `${cityName.toLowerCase().trim()}|${checkin}|${checkout}|${adults}|${children}|${rooms}|${currency}|${nationality}`;
        const { data: dbCached } = await supabase
          .from('search_results_cache')
          .select('hotels, total_count')
          .eq('cache_key', dbCacheKey)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (dbCached?.hotels?.length > 0) {
          console.log(`[DB Cache HIT] "${cityName}" ${checkin}→${checkout}: ${dbCached.total_count} hotels in ${Date.now() - t0}ms`);
          // Patch missing location with cityName (covers stale cache entries built before ETG city extraction fix)
          const hotels = (dbCached.hotels as any[]).map(h => h.location ? h : { ...h, location: cityName });
          setRawCache(rawCacheKey, { allHotels: hotels });
          const ndjson = [
            JSON.stringify({ type: 'hotels', source: 'cache', data: hotels.slice(0, limit), allMappable: hotels.map(h => ({ id: h.hotelId, name: h.name, price: h.price, currency: h.currency, coordinates: h.coordinates, rating: h.rating, image: h.image })), totalCount: hotels.length }),
            JSON.stringify({ type: 'done', totalCount: hotels.length }),
          ].join('\n') + '\n';
          return new Response(ndjson, {
            headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'X-Cache': 'DB-HIT' },
          });
        }
      } catch (e: any) {
        console.error('[DB Cache] Read error:', e.message);
      }
    }

    // ── Single-hotel detail mode ──────────────────────────────────
    const directHotelCode = body.hotelCode as string | undefined;
    if (directHotelCode) {
      return await handleSingleHotel(
        directHotelCode, body, checkin, checkout, adults, children, childrenAges, rooms,
        currency, nationality, supabase, ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_CLIENT,
        TRAVELGATEX_TEST_MODE, ETG_KEY_ID, ETG_API_KEY, corsHeaders
      );
    }

    // ── Destination resolution via ETG multicomplete ──────────────
    let destCodes: string[] = [];
    if (destinationCode) {
      destCodes = [destinationCode];
    } else if (cityName) {
      const { destCodes: resolved, resolvedFrom } = await resolveDestinationWithFallbacks(
        cityName, countryCode, supabase, ETG_KEY_ID, ETG_API_KEY
      );
      destCodes = resolved;
      if (destCodes.length > 0) {
        console.log(`[OTV] Resolved "${cityName}" via ETG multicomplete → region_id=${destCodes[0]} (from "${resolvedFrom}")`);
      } else {
        console.warn(`[OTV] Could not resolve destination for "${cityName}"`);
      }
    }

    if (destCodes.length === 0) {
      return new Response(
        JSON.stringify({ type: 'done', totalCount: 0, data: [] }) + '\n',
        { headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson' } }
      );
    }

    // ── Build OTV search ──────────────────────────────────────────
    const normalizedAges: number[] = Array.isArray(childrenAges) ? childrenAges : [];
    if (normalizedAges.length === 0 && children > 0) {
      for (let i = 0; i < children; i++) normalizedAges.push(10);
    }
    const occupancies = buildOccupancies(adults, children, normalizedAges, rooms);

    const criteriaSearch = {
      checkIn: checkin, checkOut: checkout, occupancies,
      currency, nationality, markets: [nationality], language: 'en',
      destinations: destCodes,
    };

    const settings = {
      client: TRAVELGATEX_CLIENT,
      context: OTV_CONTEXT,
      testMode: TRAVELGATEX_TEST_MODE,
      timeout: 25000,
      suppliers: [{ code: OTV_SUPPLIER, accesses: [{ accessId: OTV_ACCESS_CODE }] }],
      plugins: [{
        step: 'REQUEST',
        pluginsType: { type: 'PRE_STEP', name: 'search_by_destination', parameters: [{ key: 'accessID', value: OTV_ACCESS_CODE }] },
      }],
    };

    // ── Streaming response ────────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer  = writable.getWriter();
    const encoder = new TextEncoder();
    const send = async (obj: object) => {
      try { await writer.write(encoder.encode(JSON.stringify(obj) + '\n')); } catch {}
    };

    const cityKey          = cityName.toLowerCase().trim();
    const staticCityCenter = CITY_CENTERS_STATIC[cityKey] ?? null;

    const streamResponse = new Response(readable, {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'X-Cache': 'MISS' },
    });

    (async () => {
      try {
        // ── OTV search ────────────────────────────────────────────
        const t1 = Date.now();
        const otvFetch = fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
          body: JSON.stringify({ query: SEARCH_QUERY, variables: { criteriaSearch, settings } }),
        }).then(r => r.ok ? r.json() : (console.error(`[OTV] HTTP ${r.status}`), null))
          .catch((e: any) => { console.error('[OTV] fetch error:', e.message); return null; });

        const otvTimeout = new Promise<null>(resolve => setTimeout(() => { console.error('[OTV] 30s timeout'); resolve(null); }, 30000));
        const otvResult  = await Promise.race([otvFetch, otvTimeout]);

        console.log(`[OTV] Search: ${Date.now() - t1}ms`);

        if (!otvResult) {
          await send({ type: 'done', totalCount: 0, data: [] });
          return;
        }

        if (otvResult.errors) console.error('[OTV] GraphQL errors:', JSON.stringify(otvResult.errors));
        const searchData = otvResult.data?.hotelX?.search;
        if (searchData?.errors?.length)   console.warn('[OTV] Errors:', JSON.stringify(searchData.errors));
        if (searchData?.warnings?.length) console.warn('[OTV] Warnings:', JSON.stringify(searchData.warnings));

        const options: any[] = searchData?.options || [];
        console.log(`[OTV] ${options.length} options returned`);

        if (options.length === 0) {
          await send({ type: 'done', totalCount: 0, data: [] });
          return;
        }

        // ── Group by hotel, keep cheapest option per hotel ────────
        const hotelMap = groupByHotel(options);
        const sorted   = Array.from(hotelMap.values())
          .sort((a: any, b: any) => (a.price?.gross || a.price?.net || Infinity) - (b.price?.gross || b.price?.net || Infinity));

        // Build hotelCode → ETG HID map (with OTV, hotelCode IS the ETG HID)
        const hotelCodeToEtgHid = new Map<string, string>();
        for (const opt of sorted) {
          const hid = extractEtgHid(opt.id) || opt.hotelCode;
          if (hid && opt.hotelCode) hotelCodeToEtgHid.set(opt.hotelCode, hid);
        }

        const uniqueCodes = sorted.map((o: any) => o.hotelCode);

        // ── Phase 1: DB-cached content (fast) ─────────────────────
        const t1db = Date.now();
        const contentMap = await Promise.race([
          fetchHotelContent(
            supabase, ENDPOINT, TRAVELGATEX_API_KEY, OTV_ACCESS_CODE,
            uniqueCodes, hotelCodeToEtgHid, ETG_KEY_ID, ETG_API_KEY, 0, true
          ),
          new Promise<Map<string, any>>(resolve => setTimeout(() => {
            console.log('[Content] DB slow — proceeding with empty after 3s');
            resolve(new Map());
          }, 3000)),
        ]);
        console.log(`[Content] DB: ${Date.now() - t1db}ms, hits=${contentMap.size}`);

        // ── Transform & geo-filter ────────────────────────────────
        const hotels = sorted
          .map((o: any) => transformOptionToHotel(o, cityName, currency, contentMap.get(o.hotelCode)))
          .filter(h => {
            const isRawCode = /^Hotel \d+$/.test(h.name);
            return !isRawCode || !!h.image;
          });

        const cityCenter = staticCityCenter ?? computeClusterCenter(hotels);
        const filtered   = cityCenter
          ? hotels.filter(h => {
              const { lat, lng } = h.coordinates || {};
              if (!lat || !lng) return true;
              return haversineKm(cityCenter.lat, cityCenter.lng, lat, lng) <= GEO_RADIUS_KM;
            })
          : hotels;

        console.log(`[OTV] ${hotels.length} → ${filtered.length} within ${GEO_RADIUS_KM}km`);

        // Send first batch immediately
        await send({
          type: 'hotels', source: 'otv',
          data: filtered,
          totalCount: filtered.length,
          allMappable: filtered
            .filter(h => h.coordinates?.lat && h.coordinates?.lng)
            .map(h => ({ id: h.hotelId, name: h.name, price: h.price, currency: h.currency, coordinates: h.coordinates, rating: h.rating, image: h.image, provider: 'OTV' })),
        });

        // ── Phase 2: Inline content fetch for hotels missing images ──────────
        // Runs before `done` so the current user receives enriched results.
        // A 10s timeout ensures we never stall indefinitely when ETG is slow.
        const missingContent = uniqueCodes.filter((id: string) => !contentMap.get(id)?.images?.length);
        let finalFiltered = filtered;

        if (missingContent.length > 0) {
          console.log(`[Phase2] ${missingContent.length} hotels missing content — fetching inline`);
          const t2 = Date.now();

          const phase2Content = await Promise.race([
            fetchHotelContent(
              supabase, ENDPOINT, TRAVELGATEX_API_KEY, OTV_ACCESS_CODE,
              missingContent, hotelCodeToEtgHid, ETG_KEY_ID, ETG_API_KEY, Infinity
            ),
            new Promise<Map<string, any>>(resolve =>
              setTimeout(() => { console.log('[Phase2] 10s timeout reached'); resolve(new Map()); }, 10000)
            ),
          ]);

          console.log(`[Phase2] ${phase2Content.size} hits in ${Date.now() - t2}ms`);

          if (phase2Content.size > 0) {
            const mergedContent = new Map([...contentMap, ...phase2Content]);
            const updatedHotels = sorted
              .map((o: any) => transformOptionToHotel(o, cityName, currency, mergedContent.get(o.hotelCode)))
              .filter(h => !(/^Hotel \d+$/.test(h.name)) || !!h.image);

            const geoCenter2 = staticCityCenter ?? computeClusterCenter(updatedHotels);
            finalFiltered = geoCenter2
              ? updatedHotels.filter(h => {
                  const { lat, lng } = h.coordinates || {};
                  if (!lat || !lng) return true;
                  return haversineKm(geoCenter2.lat, geoCenter2.lng, lat, lng) <= GEO_RADIUS_KM;
                })
              : updatedHotels;
          }
        }

        // ── Only keep hotels with images ──────────────────────────
        const withImages = finalFiltered.filter(h => !!h.image);
        console.log(`[ImageFilter] ${filtered.length} → ${withImages.length} with images`);

        // ── Cache results ─────────────────────────────────────────
        setRawCache(rawCacheKey, { allHotels: withImages });
        const responseData = {
          data: withImages.slice(0, limit),
          totalCount: withImages.length,
          allMappable: withImages.map(h => ({
            id: h.hotelId, name: h.name, price: h.price, currency: h.currency,
            coordinates: h.coordinates, rating: h.rating, starRating: h.starRating,
            image: h.image, provider: 'OTV',
          })),
        };
        setCache(cacheKey, responseData);

        // Save to DB search cache (for cron pre-warming reads)
        if (cityName && withImages.length > 0) {
          const dbCacheKey = `${cityName.toLowerCase().trim()}|${checkin}|${checkout}|${adults}|${children}|${rooms}|${currency}|${nationality}`;
          const expiresAt  = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h TTL
          supabase.from('search_results_cache').upsert({
            cache_key: dbCacheKey, city_name: cityName, region_id: parseInt(destCodes[0]) || 0,
            checkin, checkout, adults, children, rooms, currency, nationality,
            hotels: withImages, total_count: withImages.length,
            cached_at: new Date().toISOString(), expires_at: expiresAt,
          }, { onConflict: 'cache_key' }).then(({ error }: any) => {
            if (error) console.error('[DB Cache] Save error:', error.message);
            else console.log(`[DB Cache] Saved ${withImages.length} hotels for "${cityName}"`);
          });
        }

        console.log(JSON.stringify({
          _event: 'otv_search_analytics',
          cityName, checkin, checkout, rooms, adults, children,
          hotelCount: withImages.length,
          regionId: destCodes[0],
          duration_ms: Date.now() - t0,
          timestamp: new Date().toISOString(),
        }));

        await send({
          type: 'done',
          totalCount: withImages.length,
          data: withImages,
          allMappable: withImages
            .filter((h: any) => h.coordinates?.lat && h.coordinates?.lng)
            .map((h: any) => ({ id: h.hotelId, name: h.name, price: h.price, currency: h.currency, coordinates: h.coordinates, rating: h.rating, image: h.image })),
        });

      } catch (e: any) {
        console.error('[Stream Error]', e.message);
        await send({ type: 'error', message: e.message });
      } finally {
        writer.close();
      }
    })();

    return streamResponse;

  } catch (error: any) {
    console.error('[OTV Search Error]', error.message);
    return new Response(JSON.stringify({ error: 'Search failed', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

// ── Single-hotel detail handler ───────────────────────────────────
async function handleSingleHotel(
  directHotelCode: string,
  _body: any,
  checkin: string,
  checkout: string,
  adults: number,
  children: number,
  childrenAges: number[],
  rooms: number,
  currency: string,
  nationality: string,
  supabase: any,
  endpoint: string,
  apiKey: string,
  client: string,
  testMode: boolean,
  etgKeyId: string,
  etgApiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const t1 = Date.now();
  const normalizedAges: number[] = Array.isArray(childrenAges) ? childrenAges : [];
  if (normalizedAges.length === 0 && children > 0) for (let i = 0; i < children; i++) normalizedAges.push(10);
  const occupancies = buildOccupancies(adults, children, normalizedAges, rooms);

  const otvRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Apikey ${apiKey}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: {
        criteriaSearch: { checkIn: checkin, checkOut: checkout, occupancies, currency, nationality, markets: [nationality], language: 'en', hotels: [directHotelCode] },
        settings: { client, context: OTV_CONTEXT, testMode, timeout: 15000, suppliers: [{ code: OTV_SUPPLIER, accesses: [{ accessId: OTV_ACCESS_CODE }] }] },
      },
    }),
  }).catch(() => null);

  const options: any[] = (otvRes?.ok ? (await otvRes.json()) : {})?.data?.hotelX?.search?.options ?? [];
  console.log(`[OTV Detail] hotelCode=${directHotelCode} → ${options.length} options in ${Date.now() - t1}ms`);

  const hotelCodeToEtgHid = new Map([[directHotelCode, directHotelCode]]);
  const contentMap = await fetchHotelContent(
    supabase, endpoint, apiKey, OTV_ACCESS_CODE,
    [directHotelCode], hotelCodeToEtgHid, etgKeyId, etgApiKey, 1
  );
  const content = contentMap.get(directHotelCode);

  if (options.length === 0) {
    return new Response(JSON.stringify({ data: content ? {
      hotelId: directHotelCode, name: content.name, images: content.images || [],
      thumbnailUrl: content.images?.[0] || '', description: content.description || '',
      latitude: content.lat, longitude: content.lng, starRating: content.starRating,
      address: content.address, city: content.city, country: content.country, roomTypes: [],
      checkInTime: content.checkInTime, checkOutTime: content.checkOutTime,
      reviewRating: content.reviewRating, reviewCount: content.reviewCount,
      amenityGroups: content.amenityGroups || [],
      hotelFacilities: (content.amenityGroups || []).flatMap((g: any) => g.amenities || []),
      hotelImportantInformation: content.importantInformation,
    } : null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const hotelMap  = groupByHotel(options);
  const best      = Array.from(hotelMap.values())[0] as any;
  const hotelBase = transformOptionToHotel(best, '', currency, content);

  const roomGroups = content?.roomGroups || [];
  const hotelImgs  = content?.images || [];

  const roomTypes = options.map((opt: any, roomIdx: number) => {
    const tgxName  = (opt.rooms?.[0]?.description || '').toLowerCase();
    const matched  = roomGroups.find(g => {
      const gn = g.name.toLowerCase();
      return tgxName && gn && (tgxName.includes(gn.split(' ')[0]) || gn.includes(tgxName.split(' ')[0]));
    });
    const roomPhotos = matched?.images?.length
      ? matched.images.slice(0, 3)
      : hotelImgs.slice((roomIdx % Math.max(1, Math.floor(hotelImgs.length / 3))) * 3,
                        (roomIdx % Math.max(1, Math.floor(hotelImgs.length / 3))) * 3 + 3);
    return {
      offerId:    `TGX:${opt.id}`,
      roomName:   opt.rooms?.[0]?.description || 'Standard Room',
      roomPhotos: roomPhotos.length ? roomPhotos : hotelImgs.slice(0, 3),
      rates: [{
        name:          opt.rooms?.[0]?.description || 'Standard Room',
        boardType:     opt.boardCode || '',
        refundableTag: opt.cancelPolicy?.refundable ? 'RFN' : 'NRFN',
        retailRate:    { total: [{ amount: opt.price?.gross || opt.price?.net || 0, currency: opt.price?.currency || currency }] },
        cancelPolicy:  opt.cancelPolicy,
        _tgx:          { optionId: opt.id, accessCode: opt.accessCode, supplierCode: opt.supplierCode, boardCode: opt.boardCode },
      }],
    };
  });

  const firstOpt  = options[0];
  const cancelPolicy = firstOpt?.cancelPolicy;
  const cancellationPolicies = cancelPolicy ? {
    refundableTag: cancelPolicy.refundable ? 'RFN' : 'NRFN',
    cancelPolicyInfos: (cancelPolicy.cancelPenalties || []).map((p: any) => ({
      type: p.type || 'PENALTY', amount: p.value || 0, currency: p.currency || currency,
    })),
  } : undefined;

  const hotelDetail = {
    ...hotelBase,
    hotelId: directHotelCode,
    roomTypes,
    latitude:  content?.lat  || hotelBase.coordinates?.lat  || 0,
    longitude: content?.lng  || hotelBase.coordinates?.lng  || 0,
    thumbnailUrl: content?.images?.[0] || '',
    images:    content?.images || [],
    description: content?.description || '',
    city: content?.city, country: content?.country, address: content?.address,
    starRating: content?.starRating || 0,
    checkInTime: content?.checkInTime, checkOutTime: content?.checkOutTime,
    reviewRating: content?.reviewRating, reviewCount: content?.reviewCount,
    amenityGroups: content?.amenityGroups || [],
    hotelFacilities: (content?.amenityGroups || []).flatMap((g: any) => g.amenities || []),
    hotelImportantInformation: content?.importantInformation,
    cancellationPolicies,
  };

  return new Response(JSON.stringify({ data: hotelDetail }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
