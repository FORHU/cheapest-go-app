import type { ContentEntry } from './types.ts';

const OTV_ACCESS_CODE  = '38327';
const ETG_API_BASE     = 'https://api.worldota.net';
const CONTENT_TTL_DAYS = 90;
// Short retry guard so failed fetches during debugging don't block retries long
const CONTENT_RETRY_MS = 10 * 60 * 1000;

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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
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
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
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

      const images: string[] = (d.medias || [])
        .filter((m: any) => m?.url)
        .sort((a: any, b: any) => (Number(a.order) || 999) - (Number(b.order) || 999))
        .map((m: any) => m.url as string);

      let description = '';
      for (const desc of (d.descriptions || [])) {
        const enText = (desc.texts || []).find((t: any) => t.language === 'en')?.text;
        if (enText) { description = enText; break; }
      }
      if (!description && d.descriptions?.[0]?.texts?.[0]?.text) {
        description = d.descriptions[0].texts[0].text;
      }

      const amenities: string[] = (d.allAmenities?.edges || [])
        .map((e: any) => e.node?.amenityData?.code)
        .filter(Boolean);

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

type ETGContent = {
  images: string[];
  starRating: number;
  name?: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  address?: string;
  description?: string;
  checkInTime?: string;
  checkOutTime?: string;
  reviewRating?: number;
  reviewCount?: number;
  amenityGroups?: Array<{ group: string; amenities: string[] }>;
  roomGroups?: Array<{ name: string; images: string[] }>;
  importantInformation?: string;
};

async function fetchFromETG(
  etgKeyId: string,
  etgApiKey: string,
  hotelCodeToEtgHid: Map<string, string>,
  fastMode = false
): Promise<Map<string, ETGContent>> {
  const result = new Map<string, ETGContent>();
  if (hotelCodeToEtgHid.size === 0) return result;

  const auth = btoa(`${etgKeyId}:${etgApiKey}`);

  const fetchOne = async (hotelCode: string, hid: string) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      let res: Response;
      try {
        res = await fetch(`${ETG_API_BASE}/api/b2b/v3/hotel/info/`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ hid: parseInt(hid, 10), language: 'en' }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[ETG${fastMode ? ' sync' : ' bg'}] ${res.status} for hid=${hid} (${hotelCode}): ${errText.substring(0, 150)}`);
        return;
      }

      const data  = await res.json();
      if (result.size === 0) console.log(`[ETG] Sample response for hid=${hid}:`, JSON.stringify(data).substring(0, 500));

      const hotel = data?.data;
      if (!hotel) return;

      // ETG uses images_ext (objects with url+category_slug) or plain images array
      const rawImages: any[] = hotel.images_ext || hotel.images || hotel.photos || [];
      const images = rawImages
        .map((img: any) => {
          const raw = img.src || img.url || (typeof img === 'string' ? img : null);
          if (!raw || typeof raw !== 'string') return null;
          return raw.replace(/\{size\}/g, '640x400');
        })
        .filter((u): u is string => !!u && u.startsWith('http'))
        .slice(0, 20);

      const starRating = Number(hotel.star_rating || hotel.stars || 0);

      // ETG uses description_struct (array of {paragraphs}) — plain description is a fallback
      let description: string | undefined;
      const descStruct = hotel.description_struct;
      const descRaw    = hotel.description || hotel.descriptions;
      if (Array.isArray(descStruct) && descStruct.length > 0) {
        description = descStruct.flatMap((s: any) => s.paragraphs || []).join(' ').trim() || undefined;
      } else if (typeof descRaw === 'object' && descRaw !== null) {
        description = (descRaw as any)?.en || (Object.values(descRaw)[0] as string) || undefined;
      } else if (typeof descRaw === 'string') {
        description = descRaw || undefined;
      }

      const checkInTime  = hotel.check_in_time  || hotel.checkin_time  || undefined;
      const checkOutTime = hotel.check_out_time || hotel.checkout_time || undefined;
      const reviewRating = hotel.review_rating != null ? Number(hotel.review_rating) : undefined;
      const reviewCount  = hotel.review_count  != null ? Number(hotel.review_count)  : undefined;

      const amenityGroups: Array<{ group: string; amenities: string[] }> =
        (hotel.amenity_groups || []).map((g: any) => ({
          group:     g.group_slug || g.group || '',
          amenities: Array.isArray(g.amenities) ? g.amenities : [],
        }));

      // Extract per-room images from ETG room_groups
      const roomGroups = (hotel.room_groups || []).map((g: any) => ({
        name: g.name || '',
        images: (Array.isArray(g.images) ? g.images : [])
          .map((img: any) => {
            const raw = typeof img === 'string' ? img : (img?.url || img?.src || null);
            if (!raw || typeof raw !== 'string') return null;
            return raw.replace(/\{size\}/g, '640x400');
          })
          .filter((u: string | null): u is string => !!u && u.startsWith('http')),
      })).filter((g: any) => g.images.length > 0);

      const importantInformation: string | undefined =
        hotel.important_information || hotel.hotel_important_information || undefined;

      const lat     = hotel.latitude  != null ? Number(hotel.latitude)  : undefined;
      const lng     = hotel.longitude != null ? Number(hotel.longitude) : undefined;
      const city    = hotel.region?.name         || hotel.city    || undefined;
      const country = hotel.region?.country_code || hotel.country || undefined;
      const address = hotel.address || undefined;
      const name    = hotel.name    || undefined;

      console.log(`[ETG${fastMode ? ' sync' : ' bg'}] ${hotelCode} (hid=${hid}) → ${images.length} imgs, star=${starRating}, lat=${lat ?? '?'}, city=${city ?? '?'}, rating=${reviewRating ?? '?'}`);
      result.set(hotelCode, { images, starRating, name, lat, lng, city, country, address, description, checkInTime, checkOutTime, reviewRating, reviewCount, amenityGroups, roomGroups, importantInformation });
    } catch (e) {
      console.error(`[ETG] Error for hid=${hid} (${hotelCode}):`, e);
    }
  };

  const BATCH_SIZE  = fastMode ? 20 : 3;
  const BATCH_DELAY = fastMode ? 0 : 6000;
  const entries     = Array.from(hotelCodeToEtgHid.entries());
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (i > 0 && BATCH_DELAY > 0) await new Promise(r => setTimeout(r, BATCH_DELAY));
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(([code, hid]) => fetchOne(code, hid)));
  }

  return result;
}

export async function enrichWithETGAndSave(
  supabase: any,
  etgSubMap: Map<string, string>,
  etgKeyId: string,
  etgApiKey: string,
  existingContent: Map<string, ContentEntry> = new Map()
): Promise<void> {
  if (etgSubMap.size === 0 || !etgKeyId || !etgApiKey) return;
  console.log(`[ETG BG] Starting background enrichment for ${etgSubMap.size} hotels...`);
  try {
    const etgResult    = await fetchFromETG(etgKeyId, etgApiKey, etgSubMap);
    const attemptedAt  = new Date().toISOString();
    const rows = Array.from(etgSubMap.keys()).map(hotel_id => {
      const etg = etgResult.get(hotel_id);
      const ex  = existingContent.get(hotel_id);
      return {
        hotel_id,
        name:            etg?.name    || ex?.name    || null,
        images:          etg?.images?.length ? etg.images : (ex?.images || []),
        star_rating:     etg?.starRating || ex?.starRating || 0,
        lat:             etg?.lat     ?? ex?.lat     ?? 0,
        lng:             etg?.lng     ?? ex?.lng     ?? 0,
        address:         etg?.address || ex?.address || null,
        city:            etg?.city    || ex?.city    || null,
        country:         etg?.country || ex?.country || null,
        description:            etg?.description            || ex?.description            || null,
        amenities:              ex?.amenities               || [],
        amenity_groups:         etg?.amenityGroups?.length  ? etg.amenityGroups  : (ex?.amenityGroups  || []),
        room_groups:            etg?.roomGroups?.length     ? etg.roomGroups     : (ex?.roomGroups     || []),
        check_in_time:          etg?.checkInTime            || ex?.checkInTime            || null,
        check_out_time:         etg?.checkOutTime           || ex?.checkOutTime           || null,
        review_rating:          etg?.reviewRating           ?? ex?.reviewRating           ?? null,
        review_count:           etg?.reviewCount            ?? ex?.reviewCount            ?? null,
        important_information:  etg?.importantInformation   || ex?.importantInformation   || null,
        content_source:         etg?.images?.length ? 'ETG' : (ex ? 'FastX' : null),
        fetched_at:             attemptedAt,
        last_attempt_at:        attemptedAt,
      };
    });
    const { error } = await supabase.from('hotel_content').upsert(rows, { onConflict: 'hotel_id' });
    if (error) console.error('[ETG BG] Upsert error:', error.message);
    else console.log(`[ETG BG] Saved ${etgResult.size}/${etgSubMap.size} enriched hotels to cache.`);
  } catch (e: any) {
    console.error('[ETG BG] Error:', e.message);
  }
}

export async function fetchHotelContent(
  supabase: any,
  tgxEndpoint: string,
  tgxApiKey: string,
  primaryAccessCode: string,
  hotelIds: string[],
  hotelCodeToEtgHid: Map<string, string> = new Map(),
  etgKeyId = '',
  etgApiKey = '',
  syncEtgMax = Infinity,
  cacheOnly = false   // when true: return DB-cached content only, skip live API calls
): Promise<Map<string, ContentEntry>> {
  const map = new Map<string, ContentEntry>();
  if (hotelIds.length === 0) return map;

  const now           = Date.now();
  const contentCutoff = new Date(now - CONTENT_TTL_DAYS * 86_400_000).toISOString();
  const retryCutoff   = new Date(now - CONTENT_RETRY_MS).toISOString();

  const { data: cached, error: cacheErr } = await supabase
    .from('hotel_content')
    .select('hotel_id, name, images, star_rating, lat, lng, address, city, country, description, amenities, amenity_groups, room_groups, check_in_time, check_out_time, review_rating, review_count, important_information, last_attempt_at')
    .in('hotel_id', hotelIds)
    .gt('fetched_at', contentCutoff);

  if (cacheErr) console.error('[HotelContent] Cache read error:', cacheErr.message);

  const cachedIds = new Set<string>();
  const skipIds   = new Set<string>();

  for (const row of (cached || []) as any[]) {
    const base = {
      name: row.name, lat: row.lat || 0, lng: row.lng || 0,
      starRating: row.star_rating || 0,
      address: row.address, city: row.city, country: row.country,
      description: row.description, amenities: row.amenities || [],
      amenityGroups:        row.amenity_groups         || [],
      roomGroups:           row.room_groups            || [],
      checkInTime:          row.check_in_time          || undefined,
      checkOutTime:         row.check_out_time         || undefined,
      reviewRating:         row.review_rating != null  ? Number(row.review_rating)  : undefined,
      reviewCount:          row.review_count  != null  ? Number(row.review_count)   : undefined,
      importantInformation: row.important_information  || undefined,
    };
    if (row.images && row.images.length > 0) {
      map.set(row.hotel_id, { ...base, images: row.images });
      // Only mark as fully cached when description AND room_groups are present.
      // Otherwise re-fetch from ETG to populate the missing fields.
      if (row.description && row.room_groups?.length > 0) {
        cachedIds.add(row.hotel_id);
      }
    } else if (row.last_attempt_at && row.last_attempt_at > retryCutoff) {
      skipIds.add(row.hotel_id);
      map.set(row.hotel_id, { ...base, name: base.name || `Hotel ${row.hotel_id}`, images: [] });
      cachedIds.add(row.hotel_id);
    }
  }

  const missing = hotelIds.filter(id => !cachedIds.has(id));
  console.log(`[HotelContent] Cache hit: ${cachedIds.size} (${skipIds.size} skipped retry), to-fetch: ${missing.length}${cacheOnly ? ' (cacheOnly — skipping live fetches)' : ''}`);

  // In cacheOnly mode fetch stale DB entries for name/coordinates only.
  // Prevents "Hotel JP1112" raw-code fallback names when cache is expired but DB row exists.
  if (cacheOnly && missing.length > 0) {
    const { data: stale } = await supabase
      .from('hotel_content')
      .select('hotel_id, name, lat, lng, star_rating, address, city, country')
      .in('hotel_id', missing);
    let staleHits = 0;
    for (const row of (stale || []) as any[]) {
      if (row.name) {
        map.set(row.hotel_id, {
          name: row.name, lat: row.lat || 0, lng: row.lng || 0,
          starRating: row.star_rating || 0,
          address: row.address, city: row.city, country: row.country,
          images: [], amenities: [], amenityGroups: [],
        });
        staleHits++;
      }
    }
    if (staleHits > 0) console.log(`[HotelContent] Stale name fallback: ${staleHits}/${missing.length} hotels rescued`);
  }

  if (missing.length > 0 && !cacheOnly) {
    const fastxResult  = await fetchFromTGX(tgxEndpoint, tgxApiKey, primaryAccessCode, missing);
    const stillMissing = missing.filter(id => !fastxResult.has(id));
    let otvResult      = new Map<string, ContentEntry>();
    if (stillMissing.length > 0) {
      console.log(`[HotelContent] FastX missed ${stillMissing.length} hotels, trying OTV...`);
      otvResult = await fetchFromTGX(tgxEndpoint, tgxApiKey, OTV_ACCESS_CODE, stillMissing);
    }

    const combined = new Map([...otvResult, ...fastxResult]);

    // For hotels still missing images with no embedded ETG HID, use ETG
    // multicomplete to find the HID by hotel name (works worldwide without a pre-built index).
    const noHidNoImage = missing.filter(id => !combined.get(id)?.images?.length && !hotelCodeToEtgHid.has(id));
    if (noHidNoImage.length > 0 && etgKeyId && etgApiKey) {
      const etgAuth = btoa(`${etgKeyId}:${etgApiKey}`);
      const lookups = noHidNoImage.map(id => {
        const entry = combined.get(id);
        return { id, name: (entry?.name || '').trim() };
      }).filter(l => l.name.length > 3);

      // Limit multicomplete lookups to avoid rate-limiting (30 req/min on this endpoint)
      const MAX_LOOKUPS = 20;
      for (const { id, name } of lookups.slice(0, MAX_LOOKUPS)) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const res = await fetch(`${ETG_API_BASE}/api/b2b/v3/search/multicomplete/`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${etgAuth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: name, language: 'en', limit: 3 }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            const json = await res.json();
            const hotels: any[] = json?.data?.hotels || [];
            if (hotels.length > 0) {
              hotelCodeToEtgHid.set(id, String(hotels[0].hid));
              console.log(`[ETGMulticomplete] Resolved ${id} ("${name}") → hid=${hotels[0].hid}`);
            }
          }
        } catch { /* skip on timeout/error */ }
      }
    }

    const noImageIds = missing.filter(id => !combined.get(id)?.images?.length && hotelCodeToEtgHid.has(id));
    const syncEtgIds = Number.isFinite(syncEtgMax) ? noImageIds.slice(0, syncEtgMax) : noImageIds;
    if (syncEtgIds.length > 0 && etgKeyId && etgApiKey) {
      const syncMap = new Map(syncEtgIds.map(id => [id, hotelCodeToEtgHid.get(id)!]));
      console.log(`[ETG sync] Fetching images for ${syncMap.size} hotels (fast-mode)...`);
      const etgResult = await fetchFromETG(etgKeyId, etgApiKey, syncMap, true);
      for (const [id, etgData] of etgResult) {
        const existing = combined.get(id);
        if (existing) {
          existing.images               = etgData.images;
          existing.name                 = existing.name                 || etgData.name;
          existing.lat                  = existing.lat                  || etgData.lat  || 0;
          existing.lng                  = existing.lng                  || etgData.lng  || 0;
          existing.city                 = existing.city                 || etgData.city;
          existing.country              = existing.country              || etgData.country;
          existing.address              = existing.address              || etgData.address;
          existing.starRating           = existing.starRating           || etgData.starRating;
          existing.description          = existing.description          || etgData.description;
          existing.checkInTime          = existing.checkInTime          || etgData.checkInTime;
          existing.checkOutTime         = existing.checkOutTime         || etgData.checkOutTime;
          existing.reviewRating         = existing.reviewRating         ?? etgData.reviewRating;
          existing.reviewCount          = existing.reviewCount          ?? etgData.reviewCount;
          existing.amenityGroups        = existing.amenityGroups?.length ? existing.amenityGroups : (etgData.amenityGroups || []);
          existing.roomGroups           = existing.roomGroups?.length   ? existing.roomGroups   : (etgData.roomGroups   || []);
          existing.importantInformation = existing.importantInformation || etgData.importantInformation;
        } else {
          combined.set(id, {
            name: etgData.name || `Hotel ${id}`,
            lat: etgData.lat ?? 0, lng: etgData.lng ?? 0,
            city: etgData.city, country: etgData.country, address: etgData.address,
            images: etgData.images, starRating: etgData.starRating,
            description: etgData.description, checkInTime: etgData.checkInTime,
            checkOutTime: etgData.checkOutTime, reviewRating: etgData.reviewRating,
            reviewCount: etgData.reviewCount, amenityGroups: etgData.amenityGroups,
            roomGroups: etgData.roomGroups, importantInformation: etgData.importantInformation,
            amenities: [],
          });
        }
      }
      console.log(`[ETG sync] Got images for ${etgResult.size}/${syncMap.size} hotels.`);
    }

    const attemptedAt = new Date().toISOString();
    const rows = missing.map(hotel_id => {
      const c      = combined.get(hotel_id);
      const source = syncEtgIds.includes(hotel_id) && (combined.get(hotel_id)?.images?.length ?? 0) > 0 ? 'ETG'
        : fastxResult.has(hotel_id) ? 'FastX'
        : otvResult.has(hotel_id) ? 'OTV'
        : null;
      return {
        hotel_id,
        name:                   c?.name || null,
        images:                 c?.images || [],
        star_rating:            c?.starRating || 0,
        lat:                    c?.lat || 0,
        lng:                    c?.lng || 0,
        address:                c?.address || null,
        city:                   c?.city || null,
        country:                c?.country || null,
        description:            c?.description || null,
        amenities:              c?.amenities || [],
        amenity_groups:         c?.amenityGroups || [],
        room_groups:            c?.roomGroups   || [],
        check_in_time:          c?.checkInTime || null,
        check_out_time:         c?.checkOutTime || null,
        review_rating:          c?.reviewRating ?? null,
        review_count:           c?.reviewCount  ?? null,
        important_information:  c?.importantInformation || null,
        content_source:         source,
        fetched_at:             attemptedAt,
        last_attempt_at:        attemptedAt,
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

  if (hotelIds.length > 0 && !cacheOnly) {
    const { data: reviews } = await supabase
      .from('hotel_reviews')
      .select('hotel_id, rating, reviews_count')
      .in('hotel_id', hotelIds);

    for (const row of (reviews || []) as any[]) {
      const existing = map.get(row.hotel_id);
      if (existing) {
        existing.rating  = row.rating ? Number(row.rating) : undefined;
        existing.reviews = row.reviews_count || 0;
      }
    }
  }

  return map;
}
