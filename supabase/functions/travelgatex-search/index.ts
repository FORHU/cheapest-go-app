import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCacheKey, getFromCache, setCache, getRawCache, setRawCache } from './cache.ts';
import { resolveDestinationWithFallbacks } from './destinations.ts';
import { CITY_CENTERS_STATIC, computeClusterCenter, haversineKm } from './geo.ts';
import { fetchHotelContent } from './content.ts';
import { SEARCH_QUERY, buildOccupancies, groupByHotel, extractEtgHid } from './search.ts';
import { transformOptionToHotel, transformETGHotel } from './transform.ts';
import { streamETGByGeo, type ETGSearchParams } from './etg-search.ts';

declare const Deno: any;
declare const EdgeRuntime: { waitUntil(promise: Promise<any>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENDPOINT      = Deno.env.get('TRAVELGATEX_ENDPOINT_URL') || 'https://api.travelgate.com';
const TGX_URL       = ENDPOINT;
const GEO_RADIUS_KM = 30;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Internal function to stream debug messages
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();
  const send = async (obj: object) => {
    try { await writer.write(encoder.encode(JSON.stringify(obj) + '\n')); } catch {}
  };

  const TRAVELGATEX_API_KEY     = Deno.env.get('TRAVELGATEX_API_KEY');
  // Fix 1: Default to OTV access code 38327 (was 37606 for FASTX)
  const TRAVELGATEX_ACCESS_CODE = Deno.env.get('TRAVELGATEX_CODE') || '38327';
  const TRAVELGATEX_SUPPLIER    = Deno.env.get('TRAVELGATEX_SUPPLIER') || 'OTV';
  
  await send({ 
    type: 'debug', 
    source: 'env_check', 
    data: { 
      hasTgxKey: !!TRAVELGATEX_API_KEY, 
      hasEtgKey: !!(Deno.env.get('RATEHAWK_API_KEY') || Deno.env.get('ETG_API_KEY')),
      supplier: TRAVELGATEX_SUPPLIER,
      access: TRAVELGATEX_ACCESS_CODE
    } 
  });
  // Fix: Handle the typo RAVELGATEX_CONTEXT in .env as fallback
  const TRAVELGATEX_CONTEXT     = Deno.env.get('TRAVELGATEX_CONTEXT') || Deno.env.get('RAVELGATEX_CONTEXT') || 'OTV';
  const TRAVELGATEX_TEST_MODE   = Deno.env.get('TRAVELGATEX_TEST_MODE') === 'true';
  const TRAVELGATEX_CLIENT      = Deno.env.get('TRAVELGATEX_CLIENT') || 'forhuinc';
  const ETG_KEY_ID  = Deno.env.get('ETG_KEY_ID')  || Deno.env.get('RATEHAWK_KEY_ID')  || '';
  const ETG_API_KEY = Deno.env.get('ETG_API_KEY') || Deno.env.get('RATEHAWK_API_KEY') || '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const t0   = Date.now();
    const body = await req.json();
    console.log('===== TRAVELGATEX SEARCH REQUEST =====', JSON.stringify(body).substring(0, 300));

    // ── Response cache ────────────────────────────────────────────
    const cacheKey = getCacheKey(body);
    const cached   = getFromCache(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${Date.now() - t0}ms`);
      // Return NDJSON so the streaming client can parse it the same way as a MISS
      const ndjson = [
        JSON.stringify({ type: 'hotels', source: 'cache', data: cached.data || [], allMappable: cached.allMappable || [], totalCount: cached.totalCount || 0 }),
        JSON.stringify({ type: 'done', totalCount: cached.totalCount || 0 }),
      ].join('\n') + '\n';
      return new Response(ndjson, {
        headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'X-Cache': 'HIT' },
      });
    }

    // Normalize camelCase URL params (checkIn/checkOut) to lowercase API convention
    const checkin  = body.checkin  || body.checkIn;
    const checkout = body.checkout || body.checkOut;
    const {
      adults = 2, children = 0, childrenAges = [], rooms = 1,
      currency = 'USD', guest_nationality: nationality = 'PH',
      countryCode = '',
      destinationCode,
    } = body;
    // Accept both "cityName" (API convention) and "destination" (URL param convention)
    const cityName: string = body.cityName || body.destination || '';

    const offset = typeof body.offset === 'number' ? body.offset : 0;
    const limit  = typeof body.limit  === 'number' ? body.limit  : 15;
    const { offset: _o, limit: _l, ...bodyWithoutPagination } = body;
    const rawCacheKey = getCacheKey(bodyWithoutPagination);

    // ── Load More fast path (pre-transformed, just slice) ─────────
    const cachedRaw = getRawCache(rawCacheKey);
    if (cachedRaw && offset > 0) {
      const { allHotels } = cachedRaw;
      const pageHotels    = allHotels.slice(offset, offset + limit);
      console.log(`[RawCache HIT] offset=${offset} → ${pageHotels.length}/${allHotels.length} in ${Date.now() - t0}ms`);
      return new Response(JSON.stringify({ data: pageHotels, totalCount: allHotels.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'RAW-HIT' },
      });
    }

    if (!checkin || !checkout) throw new Error('checkin and checkout are required');

    // ── Single-hotel detail mode (property page) ──────────────────
    // Returns plain JSON — NOT NDJSON streaming.
    // Triggered when body.hotelCode is set and no city/destination is given.
    const directHotelCode = body.hotelCode as string | undefined;
    if (directHotelCode) {
      const t1 = Date.now();
      const normalizedAgesD: number[] = Array.isArray(body.childrenAges) ? body.childrenAges : [];
      if (normalizedAgesD.length === 0 && children > 0) for (let i = 0; i < children; i++) normalizedAgesD.push(10);
      const occupanciesD = buildOccupancies(adults, children, normalizedAgesD, rooms);

      // Build supplier entry for detail mode
      const detailSupplierEntry: any = { code: TRAVELGATEX_SUPPLIER, accesses: [{ accessId: TRAVELGATEX_ACCESS_CODE }] };

      const tgxResD = await fetch(TGX_URL, {
        method: 'POST',
        headers: { 'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
        body: JSON.stringify({
          query: SEARCH_QUERY,
          variables: {
            criteriaSearch: { checkIn: checkin, checkOut: checkout, occupancies: occupanciesD, currency, nationality, markets: [nationality], language: 'en', hotels: [directHotelCode] },
            settings: { client: TRAVELGATEX_CLIENT, context: TRAVELGATEX_CONTEXT, testMode: TRAVELGATEX_TEST_MODE, timeout: 12000, suppliers: [detailSupplierEntry] },
          },
        }),
      }).catch(() => null);

      const options: any[] = (tgxResD?.ok ? (await tgxResD.json()) : {})?.data?.hotelX?.search?.options ?? [];
      console.log(`[TGX Detail] hotelCode=${directHotelCode} → ${options.length} options in ${Date.now() - t1}ms`);

      const contentMap = await fetchHotelContent(
        supabase, ENDPOINT, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE,
        [directHotelCode], new Map(), ETG_KEY_ID, ETG_API_KEY, 0
      );
      const content = contentMap.get(directHotelCode);

      if (options.length === 0) {
        // Return static content only (no live pricing)
        return new Response(JSON.stringify({ data: content ? {
          hotelId: directHotelCode, name: content.name, images: content.images || [],
          thumbnailUrl: content.images?.[0] || '', description: content.description || '',
          latitude: content.lat, longitude: content.lng, starRating: content.starRating,
          address: content.address, city: content.city, country: content.country, roomTypes: [],
          checkInTime:               content.checkInTime,
          checkOutTime:              content.checkOutTime,
          reviewRating:              content.reviewRating,
          reviewCount:               content.reviewCount,
          amenityGroups:             content.amenityGroups || [],
          hotelFacilities:           (content.amenityGroups || []).flatMap((g: any) => g.amenities || []),
          hotelImportantInformation: content.importantInformation,
        } : null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const hotelMap  = groupByHotel(options);
      const best      = Array.from(hotelMap.values())[0] as any;
      const hotelBase = transformOptionToHotel(best, '', currency, content);

      // Build room-type-compatible array from all distinct TGX options
      // Try to match ETG room_groups by name for per-room images; fall back to rotating hotel images
      const roomTypes = options.map((opt: any, roomIdx: number) => {
        const tgxName    = (opt.rooms?.[0]?.description || '').toLowerCase();
        const roomGroups = content?.roomGroups || [];
        const matched    = roomGroups.find(g => {
          const gn = g.name.toLowerCase();
          return tgxName && gn && (tgxName.includes(gn.split(' ')[0]) || gn.includes(tgxName.split(' ')[0]));
        });
        const hotelImgs  = content?.images || [];
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

      // Build cancellation policy from the first available TGX option
      const firstOption  = options[0];
      const cancelPolicy = firstOption?.cancelPolicy;
      const cancellationPolicies = cancelPolicy ? {
        refundableTag: cancelPolicy.refundable ? 'RFN' : 'NRFN',
        cancelPolicyInfos: (cancelPolicy.cancelPenalties || []).map((p: any) => ({
          type:     p.type     || 'PENALTY',
          amount:   p.value    || 0,
          currency: p.currency || currency,
        })),
      } : undefined;

      const hotelDetail = {
        ...hotelBase,
        hotelId:                    directHotelCode,
        roomTypes,
        latitude:                   content?.lat    || hotelBase.coordinates?.lat    || 0,
        longitude:                  content?.lng    || hotelBase.coordinates?.lng    || 0,
        thumbnailUrl:               content?.images?.[0] || '',
        images:                     content?.images || [],
        description:                content?.description || '',
        city:                       content?.city,
        country:                    content?.country,
        address:                    content?.address,
        starRating:                 content?.starRating || 0,
        checkInTime:                content?.checkInTime,
        checkOutTime:               content?.checkOutTime,
        reviewRating:               content?.reviewRating,
        reviewCount:                content?.reviewCount,
        amenityGroups:              content?.amenityGroups || [],
        hotelFacilities:            (content?.amenityGroups || []).flatMap((g: any) => g.amenities || []),
        hotelImportantInformation:  content?.importantInformation,
        cancellationPolicies,
      };

      return new Response(JSON.stringify({ data: hotelDetail }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── TGX destination resolution ────────────────────────────────
    // Blocking await — this is intentional. TGX's destinationSearcher call "pre-warms"
    // TGX's backend so the subsequent hotel search returns in < 1s instead of ~11s.
    // An in-memory cache in destinations.ts makes this instant on second+ requests.
    let destCodes: string[]          = [];
    let fallbackHotelCodes: string[] = [];

    if (destinationCode) {
      destCodes = [destinationCode];
    } else if (cityName) {
      const { destCodes: resolved, resolvedFrom, fallbackHotelCodes: hotelFallback } =
        await resolveDestinationWithFallbacks(TGX_URL, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE, cityName, countryCode, supabase);
      if (resolved.length > 0) {
        destCodes = resolved;
        console.log(`[TravelgateX] Resolved "${cityName}" via "${resolvedFrom}" → ${destCodes.length} codes: ${destCodes.slice(0,5).join(',')}`);
        await send({ type: 'debug', source: 'destination_resolution', data: { codes: destCodes, from: resolvedFrom } });
      } else {
        fallbackHotelCodes = hotelFallback;
        console.warn(`[TravelgateX] No dest codes for "${cityName}" — fallback hotel codes: ${fallbackHotelCodes.length}`);
        await send({ type: 'debug', source: 'destination_resolution_fallback', data: { hotelCodes: fallbackHotelCodes } });
      }
    }

    console.log(`[TGX Config] access=${TRAVELGATEX_ACCESS_CODE} supplier=${TRAVELGATEX_SUPPLIER || '(auto)'} context=${TRAVELGATEX_CONTEXT} client=${TRAVELGATEX_CLIENT} testMode=${TRAVELGATEX_TEST_MODE}`);
    console.log(`[TGX Resolve] destCodes=${destCodes.length} fallbackHotels=${fallbackHotelCodes.length} cityName=${cityName}`);

    // ── Build TGX search payload ──────────────────────────────────
    const normalizedAges: number[] = Array.isArray(childrenAges) ? childrenAges : [];
    if (normalizedAges.length === 0 && children > 0) {
      for (let i = 0; i < children; i++) normalizedAges.push(10);
    }
    const occupancies = buildOccupancies(adults, children, normalizedAges, rooms);

    const criteriaSearch: any = {
      checkIn: checkin, checkOut: checkout, occupancies,
      currency, nationality, markets: [nationality], language: 'en',
    };
    if (destCodes.length > 0) criteriaSearch.destinations = destCodes;
    else if (fallbackHotelCodes.length > 0) criteriaSearch.hotels = fallbackHotelCodes;

    // Build supplier entry
    const supplierEntry: any = { code: TRAVELGATEX_SUPPLIER, accesses: [{ accessId: TRAVELGATEX_ACCESS_CODE }] };

    const settings: any = {
      client: TRAVELGATEX_CLIENT, context: TRAVELGATEX_CONTEXT,
      testMode: TRAVELGATEX_TEST_MODE, timeout: 25000,
      suppliers: [supplierEntry],
      // ── MAPPING FIX: Always use the mapping plugin for OTV to translate TGX IDs ──
      ...(destCodes.length > 0 ? {
        plugins: [{
          step: 'REQUEST',
          pluginsType: { type: 'PRE_STEP', name: 'search_by_destination', parameters: [{ key: 'access', value: TRAVELGATEX_ACCESS_CODE }] },
        }],
      } : {}),
    };

    console.log(`[TGX Settings]`, JSON.stringify(settings).substring(0, 500));
    console.log(`[TGX Criteria]`, JSON.stringify(criteriaSearch).substring(0, 500));

    const etgParams: ETGSearchParams = {
      checkin, checkout, adults, children, childrenAges: normalizedAges,
      rooms, currency, nationality,
    };

    // Pre-compute city center so geo-based ETG search can run even with 0 TGX hotels
    const cityKey          = cityName.toLowerCase().trim();
    const staticCityCenter = CITY_CENTERS_STATIC[cityKey] ?? null;

    const streamResponse = new Response(readable, {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'X-Cache': 'MISS' },
    });

    // ── Main search logic runs concurrently with the response ─────
    (async () => {
      try {
        // ETG geo generator — starts immediately, in parallel with TGX
        const etgGeoGen = (staticCityCenter && ETG_KEY_ID && ETG_API_KEY)
          ? streamETGByGeo(staticCityCenter.lat, staticCityCenter.lng, etgParams, ETG_KEY_ID, ETG_API_KEY, new Set())
          : null;

        const allEtgHotels: any[]              = [];
        const allTgxHotels: any[]              = [];
        const hotelCodeToEtgHid                = new Map<string, string>();

        // ETG streaming task — yields batches as hotel/info content arrives.
        // 20s gives ETG enough time to surface hotels in outer districts (Shinagawa, Shinjuku, etc.)
        const ETG_TASK_DEADLINE_MS = 12000;
        const etgTask = async () => {
          if (!etgGeoGen) return;
          const etgDeadlineAt = Date.now() + ETG_TASK_DEADLINE_MS;
          for await (const batch of etgGeoGen) {
            const transformed = batch.map(h => transformETGHotel(h, cityName));
            const geoFiltered = staticCityCenter
              ? transformed.filter(h => {
                  const { lat, lng } = h.coordinates || {};
                  // Hotels with lat=0/lng=0 had content-fetch timeouts but came from the geo SERP
                  // which already filtered by radius — keep them rather than dropping them entirely.
                  if (!lat || !lng) return true;
                  return haversineKm(staticCityCenter.lat, staticCityCenter.lng, lat, lng) <= GEO_RADIUS_KM;
                })
              : transformed;
            if (geoFiltered.length > 0) {
              allEtgHotels.push(...geoFiltered);
              await send({
                type: 'hotels', source: 'etg',
                data: geoFiltered,
                allMappable: geoFiltered.map(h => ({
                  id: h.hotelId, name: h.name, price: h.price, currency: h.currency,
                  coordinates: h.coordinates, rating: h.rating, image: h.image,
                  provider: 'ETG',
                })),
              });
            }
            // Break out of for-await loop after deadline — this calls generator.return()
            // and causes etgTask to resolve promptly instead of blocking the stream.
            if (Date.now() >= etgDeadlineAt) {
              console.log('[ETG] Task deadline reached — stopping early');
              break;
            }
          }
        };

        // TGX task — fetches all options then sends one chunk.
        // criteriaSearch and settings are computed above from the blocking dest resolution.
        const tgxTask = async () => {
          if (destCodes.length === 0 && fallbackHotelCodes.length === 0) {
            console.warn('[TGX Task] No destCodes and no fallback hotel codes — attempting search without destination filter');
            // Still proceed: some suppliers (like OTV/ETG) can handle searches without destination codes
          }

          const t1 = Date.now();
          let tgxResult: any;

          // Promise.race timeout — AbortController may not interrupt in all runtimes.
          // Pre-warmed TGX (after blocking dest resolution) returns in < 1s.
          // Non-pre-warmed (second request with cached dest codes) takes ~11s.
          const tgxFetchPromise = fetch(TGX_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`,
              'Content-Type': 'application/json',
              'Accept-Encoding': 'gzip',
              'Connection': 'keep-alive',
            },
            body: JSON.stringify({ query: SEARCH_QUERY, variables: { criteriaSearch, settings: { ...settings, timeout: 15000 } } }),
          }).then(res => res.ok ? res.json() : (console.error(`[TGX] HTTP ${res.status}`), null))
            .catch((e: any) => { console.error('[TGX] fetch error:', e.message); return null; });

          const tgxTimeoutPromise = new Promise<null>(resolve =>
            setTimeout(() => { console.error('[TGX] 12s search timeout'); resolve(null); }, 12000)
          );

          tgxResult = await Promise.race([tgxFetchPromise, tgxTimeoutPromise]);
          console.log(`[TravelgateX] API: ${Date.now() - t1}ms`);

          if (!tgxResult) return; // timeout or error

          if (tgxResult.errors) {
            console.error('[TGX] GraphQL error:', JSON.stringify(tgxResult.errors));
            await send({ type: 'debug', source: 'tgx_error', data: tgxResult.errors });
          }
          const searchData = tgxResult.data?.hotelX?.search;
          console.log('[TravelgateX] Full searchData:', JSON.stringify(searchData).substring(0, 2000));
          await send({ type: 'debug', source: 'tgx_raw_search_data', data: searchData });
          
          if (searchData?.errors?.length) {
            console.warn('[TGX] Search Errors:', JSON.stringify(searchData.errors));
            await send({ type: 'debug', source: 'tgx_search_error', data: searchData.errors });
          }
          if (searchData?.warnings?.length) {
            console.warn('[TGX] Search Warnings:', JSON.stringify(searchData.warnings));
            await send({ type: 'debug', source: 'tgx_search_warning', data: searchData.warnings });
          }

          const options: any[] = searchData?.options || [];
          console.log(`[TravelgateX] options: ${options.length}`);
          if (options.length === 0) return;

          const hotelMap       = groupByHotel(options);
          const sortedTgxOptions = Array.from(hotelMap.values())
            .sort((a: any, b: any) => (a.price?.gross || a.price?.net || Infinity) - (b.price?.gross || b.price?.net || Infinity));

          for (const opt of sortedTgxOptions) {
            const hid = extractEtgHid(opt.id);
            if (hid && opt.hotelCode) hotelCodeToEtgHid.set(opt.hotelCode, hid);
          }
          console.log(`[HotelContent] ETG HID map: ${hotelCodeToEtgHid.size}/${sortedTgxOptions.length} have ETG HIDs`);

          const uniqueCodes = sortedTgxOptions.map((o: any) => o.hotelCode);

          // ── Fix 2: Hybrid content strategy ───────────────────────────────────
          // Step A: Try DB cache first (fast, ~100ms when warm)
          const t1db = Date.now();
          const cacheOnlyMap = await Promise.race([
            fetchHotelContent(
              supabase, TGX_URL, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE,
              uniqueCodes, hotelCodeToEtgHid, ETG_KEY_ID, ETG_API_KEY, 0, true // cacheOnly
            ),
            new Promise<Map<string, any>>(resolve => setTimeout(() => {
              console.log('[TGX Content] DB cold/slow — proceeding after 3s');
              resolve(new Map());
            }, 3000)),
          ]);
          console.log(`[TGX Content] DB cache: ${Date.now() - t1db}ms, hits=${cacheOnlyMap.size}/${uniqueCodes.length}`);

          // Step B: If many hotels missed cache (fresh OTV supplier), fetch top 10 synchronously
          // so this search already has images. Rest are fetched in background for next search.
          let contentMap = cacheOnlyMap;
          const cacheHitCodes  = new Set(Array.from(cacheOnlyMap.keys()).filter(k => (cacheOnlyMap.get(k)?.images?.length ?? 0) > 0));
          const cacheMissCodes = uniqueCodes.filter((c: string) => !cacheHitCodes.has(c));

          if (cacheMissCodes.length > 0) {
            const liveNow = cacheMissCodes.slice(0, 10); // sync fetch for top 10 missed
            console.log(`[TGX Content] Cache missed ${cacheMissCodes.length} hotels — live-fetching ${liveNow.length} now`);
            const liveMap = await Promise.race([
              fetchHotelContent(
                supabase, TGX_URL, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE,
                liveNow, hotelCodeToEtgHid, ETG_KEY_ID, ETG_API_KEY, 0 // 0 = no limit, fetch all in liveNow
              ),
              new Promise<Map<string, any>>(resolve => setTimeout(() => {
                console.log('[TGX Content] Live fetch timeout after 8s');
                resolve(new Map());
              }, 8000)),
            ]);
            contentMap = new Map([...cacheOnlyMap, ...liveMap]);
            console.log(`[TGX Content] After live fetch: ${contentMap.size} hotels have content`);
          }

          const tgxHotels = sortedTgxOptions
            .map((o: any) => transformOptionToHotel(o, cityName, currency, contentMap.get(o.hotelCode)));
            // Removed filtering that dropped hotels without images
          const tgxGeoFiltered = staticCityCenter
            ? tgxHotels.filter(h => {
                const { lat, lng } = h.coordinates || {};
                if (!lat || !lng) return true;
                return haversineKm(staticCityCenter.lat, staticCityCenter.lng, lat, lng) <= GEO_RADIUS_KM;
              })
            : tgxHotels;
          console.log(`[TGX GeoFilter] ${tgxHotels.length} → ${tgxGeoFiltered.length} within ${GEO_RADIUS_KM}km of ${cityName}`);
          allTgxHotels.push(...tgxGeoFiltered);

          // Step C: Background fetch for all remaining cache misses (populates DB for next search)
          const stillMissing = cacheMissCodes.filter((id: string) => !(contentMap.get(id)?.images?.length));
          if (stillMissing.length > 0) {
            const bgLimit = 40;
            console.log(`[TGX Content] Background-fetching top ${Math.min(stillMissing.length, bgLimit)} hotels`);
            EdgeRuntime.waitUntil(
              fetchHotelContent(
                supabase, TGX_URL, TRAVELGATEX_API_KEY, TRAVELGATEX_ACCESS_CODE,
                stillMissing, hotelCodeToEtgHid, ETG_KEY_ID, ETG_API_KEY, bgLimit
              )
            );
          }

          await send({
            type: 'hotels', source: 'tgx',
            data: tgxGeoFiltered,
            totalCount: tgxGeoFiltered.length,
            allMappable: tgxGeoFiltered
              .filter(h => h.coordinates?.lat && h.coordinates?.lng)
              .map(h => ({
                id: h.hotelId, name: h.name, price: h.price, currency: h.currency,
                coordinates: h.coordinates, rating: h.rating, image: h.image,
                provider: h._tgx?.supplierCode || 'TGX',
              })),
          });
        };

        // ETG and TGX run concurrently. ETG streams results in the first 10-14s.
        // TGX destination resolution can take up to 45s; the full TGX task up to 60s.
        // 90s safety deadline ensures the stream always closes even if something hangs.
        await Promise.race([
          Promise.all([tgxTask(), etgTask()]),
          new Promise<void>(resolve => setTimeout(resolve, 90000)),
        ]);
        console.log(`[Search] TGX=${allTgxHotels.length} ETG=${allEtgHotels.length} hotels after parallel phase`);

        // Build a name→image index from ETG results so TGX hotels that weren't
        // matched by proximity can still borrow images via normalized name lookup.
        const etgNameImageMap = new Map<string, string[]>();
        for (const eh of allEtgHotels) {
          if (eh.images?.length) {
            etgNameImageMap.set(eh.name.toLowerCase().replace(/\s+/g, ' ').trim(), eh.images);
          }
        }

        // ── Merge + geo-filter for rawCache (Load More) ───────────
        const allHotels = [...allTgxHotels, ...allEtgHotels]
          .sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

        const cityCenter = staticCityCenter ?? computeClusterCenter(allHotels);
        const filteredHotels: any[] = [];
        for (const hotel of allHotels) {
          if (cityCenter) {
            const { lat, lng } = hotel.coordinates || {};
            if (lat && lng) {
              const dist = haversineKm(cityCenter.lat, cityCenter.lng, lat, lng);
              if (dist > GEO_RADIUS_KM) {
                console.log(`[GeoFilter] Dropping ${hotel.name} — ${dist.toFixed(0)}km`);
                continue;
              }
            }
          }
          filteredHotels.push(hotel);
        }
        if (cityCenter) console.log(`[GeoFilter] ${allHotels.length} → ${filteredHotels.length} within ${GEO_RADIUS_KM}km`);

        // ── Deduplicate TGX + ETG: same physical hotel may appear from both sources.
        // Match by coordinate proximity (~200m). Always merge: TGX supplies pricing,
        // ETG supplies images. Never discard ETG images when TGX has none.
        const PROX_DEG = 0.002; // ~200m — accounts for different lat/lng sources
        const deduped: any[] = [];
        for (const hotel of filteredHotels) {
          const { lat, lng } = hotel.coordinates || {};
          if (!lat || !lng) { deduped.push(hotel); continue; }
          const existIdx = deduped.findIndex((d: any) => {
            const { lat: dl, lng: dg } = d.coordinates || {};
            return dl && dg && Math.abs(dl - lat) < PROX_DEG && Math.abs(dg - lng) < PROX_DEG;
          });
          if (existIdx === -1) { deduped.push(hotel); continue; }
          const existing = deduped[existIdx];
          const existIsTgx = Boolean(existing._tgx);
          const newIsTgx   = Boolean(hotel._tgx);
          if (newIsTgx && !existIsTgx) {
            // TGX arrives at an existing ETG slot: merge TGX pricing + ETG images
            deduped[existIdx] = {
              ...hotel,
              image:  hotel.image  || existing.image  || '',
              images: hotel.images?.length ? hotel.images : (existing.images || []),
            };
          } else if (!newIsTgx && existIsTgx) {
            // ETG arrives at an existing TGX slot: patch in images if TGX has none
            if (!existing.image && hotel.image) {
              deduped[existIdx] = { ...existing, image: hotel.image, images: hotel.images || [] };
            }
          } else if (!newIsTgx && !existIsTgx && hotel.price < existing.price) {
            deduped[existIdx] = hotel;
          }
        }
        console.log(`[Dedup] ${filteredHotels.length} → ${deduped.length} unique hotels`);

        // Name-based image fill: for TGX hotels still missing images after proximity dedup,
        // try exact normalized name match against ETG results.
        let nameFilled = 0;
        for (let i = 0; i < deduped.length; i++) {
          const h = deduped[i];
          if (!h.image && h._tgx) {
            const key    = h.name.toLowerCase().replace(/\s+/g, ' ').trim();
            const imgs   = etgNameImageMap.get(key);
            if (imgs?.length) {
              deduped[i] = { ...h, image: imgs[0], images: imgs };
              nameFilled++;
            }
          }
        }
        if (nameFilled > 0) console.log(`[NameFill] Filled images for ${nameFilled} TGX hotels via ETG name match`);

        // ── Fix 3: Don't drop hotels without images ───────────────────────────
        // OTV is a new supplier — hotel_content is cold on first search.
        // Content has been live-fetched and saved above for top 10, rest arrive via
        // background fetch. Include all hotels so users see results immediately.
        // Hotels without images will show a placeholder on the frontend.
        const withImages = deduped; // was: deduped.filter(h => !!h.image)
        const withImagesCount   = deduped.filter(h => !!h.image).length;
        const withoutImageCount = deduped.length - withImagesCount;
        console.log(`[ImageFilter] ${deduped.length} total — ${withImagesCount} with images, ${withoutImageCount} without (kept all for OTV)`);

        setRawCache(rawCacheKey, { allHotels: withImages });

        // Store response cache using full result
        const responseData = {
          data: withImages.slice(0, limit),
          totalCount: withImages.length,
          allMappable: withImages.map(h => ({
            id: h.hotelId, name: h.name, price: h.price, currency: h.currency,
            coordinates: h.coordinates, rating: h.rating, starRating: h.starRating,
            image: h.image, provider: h._tgx?.supplierCode || (h._etg ? 'ETG' : 'TGX'),
          })),
        };
        setCache(cacheKey, responseData);

        console.log(JSON.stringify({
          _event: 'travelgatex_search_analytics',
          cityName, countryCode, checkin, checkout, rooms, adults, children,
          tgxCount: allTgxHotels.length, etgCount: allEtgHotels.length,
          hotelCount: deduped.length,
          destCodeCount: destCodes.length, destCodes: destCodes.slice(0, 5),
          duration_ms: Date.now() - t0,
          testMode: false, timestamp: new Date().toISOString(),
        }));

        await send({
          type: 'done',
          totalCount: withImages.length,
          data: withImages,
          allMappable: withImages
            .filter((h: any) => h.coordinates?.lat && h.coordinates?.lng)
            .map((h: any) => ({
              id: h.hotelId, name: h.name, price: h.price, currency: h.currency,
              coordinates: h.coordinates, rating: h.rating, image: h.image,
            })),
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
    console.error('[TravelgateX Search Error]', error.message);
    return new Response(JSON.stringify({ error: 'Search failed', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
