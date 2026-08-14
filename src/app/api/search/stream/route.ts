import { NextRequest } from 'next/server';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';
import { CITY_ALIASES, resolveHotelDbCity } from '@/lib/constants/cityAliases';

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
    'indonesia': 'ID', 'france': 'FR', 'italy': 'IT', 'spain': 'ES', 'germany': 'DE',
    'japan': 'JP', 'thailand': 'TH', 'greece': 'GR', 'united states': 'US', 'usa': 'US',
    'australia': 'AU', 'philippines': 'PH', 'south korea': 'KR', 'korea': 'KR',
    'vietnam': 'VN', 'cambodia': 'KH', 'singapore': 'SG', 'malaysia': 'MY',
    'india': 'IN', 'china': 'CN', 'hong kong': 'HK', 'taiwan': 'TW',
    'peru': 'PE', 'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR',
    'egypt': 'EG', 'tanzania': 'TZ', 'south africa': 'ZA', 'kenya': 'KE',
    'iceland': 'IS', 'norway': 'NO', 'sweden': 'SE', 'denmark': 'DK',
    'portugal': 'PT', 'netherlands': 'NL', 'switzerland': 'CH', 'austria': 'AT',
    'united kingdom': 'GB', 'uk': 'GB', 'maldives': 'MV', 'sri lanka': 'LK',
    'nepal': 'NP', 'uae': 'AE', 'united arab emirates': 'AE', 'turkey': 'TR',
    'morocco': 'MA', 'jordan': 'JO', 'new zealand': 'NZ', 'canada': 'CA',
};

// ── Hotel image enrichment (TGX Hotels Query, runs in parallel with Phase 2) ──

const HOTEL_CONTENT_QUERY = `
query TgxHotelContent($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            code
            hotelName
            location {
              coordinates { latitude longitude }
            }
            medias { url type }
          }
        }
      }
    }
  }
}`;

function isSlugName(name: string | null | undefined): boolean {
    if (!name) return false;
    return /^[a-z][a-z0-9_]+$/.test(name) && name.includes('_');
}

interface HotelContentPatch { images?: string[]; name?: string; lat?: number; lng?: number }

async function fetchHotelContentPatches(hotelIds: string[], timeoutMs = 30_000): Promise<Map<string, HotelContentPatch>> {
    if (!hotelIds.length) return new Map();
    try {
        const cfg = getTgxConfig();
        const result = await tgxGraphQL(HOTEL_CONTENT_QUERY, {
            criteria: {
                access: cfg.accessCode,
                hotelCodes: hotelIds.slice(0, 500),
                maxSize: Math.min(500, hotelIds.length),
            },
        }, timeoutMs);
        const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
        const patchMap = new Map<string, HotelContentPatch>();
        if (edges.length > 0) {
            const sample = edges.slice(0, 3).map((e: any) => {
                const hd = e?.node?.hotelData;
                return `code=${hd?.code} img0=${hd?.medias?.[0]?.url?.slice(0, 60)}`;
            });
            console.log(`[content-api] queried=${hotelIds.length} returned=${edges.length} samples: ${sample.join(' | ')}`);
        }
        for (const edge of edges) {
            const hd = edge?.node?.hotelData;
            if (!hd?.code) continue;
            const patch: HotelContentPatch = {};
            // Accept any media URL regardless of type — TGX uses various type values
            // (photo, PHOTO, image, IMAGE, etc.) and null for untyped images.
            const VIDEO_TYPES = new Set(['video', 'VIDEO', 'panoramic', 'PANORAMIC', 'virtual_tour']);
            const images: string[] = (hd.medias ?? [])
                .filter((m: any) => m.url && !VIDEO_TYPES.has(m.type))
                .map((m: any) => m.url as string)
                .slice(0, 5);
            if (images.length) patch.images = images;
            // Patch name only when TGX has a non-slug, non-empty name
            if (hd.hotelName && !isSlugName(hd.hotelName)) patch.name = hd.hotelName;
            const lat = Number(hd.location?.coordinates?.latitude ?? 0);
            const lng = Number(hd.location?.coordinates?.longitude ?? 0);
            if (lat && lng) { patch.lat = lat; patch.lng = lng; }
            if (patch.images || patch.name || patch.lat) patchMap.set(hd.code, patch);
        }
        return patchMap;
    } catch (e: any) {
        console.warn('[stream] hotel content fetch failed:', e.message?.slice(0, 100));
        return new Map();
    }
}

function resolveIsoCode(raw: string): string | null {
    if (!raw) return null;
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    return COUNTRY_NAME_TO_ISO[raw.toLowerCase()] ?? null;
}

async function recordHotelSearchDemand(cityName: string, countryCode: string) {
    if (!cityName) return;
    try {
        const sql = getSqlAdmin();
        const key = cityName.toLowerCase().trim();
        await sql`
            INSERT INTO hotel_search_stats (city_key, country_code, search_count, last_searched_at)
            VALUES (${key}, ${countryCode.toUpperCase()}, 1, now())
            ON CONFLICT (city_key) DO UPDATE
                SET search_count     = hotel_search_stats.search_count + 1,
                    last_searched_at = now(),
                    country_code     = CASE
                        WHEN hotel_search_stats.country_code = '' THEN EXCLUDED.country_code
                        ELSE hotel_search_stats.country_code
                    END
        `;
    } catch (e: any) {
        console.error('[hotel-stats] Failed to record demand:', e.message);
    }
}

// ── Phase 1: instant hotel catalog from hotel_content (~10ms) ─────────────────

async function getInstantHotelCatalog(body: any): Promise<any[]> {
    const cityName: string = body.cityName ?? body.destination ?? '';
    const countryCode: string = body.countryCode ?? '';
    if (!cityName) return [];

    try {
        const sql = getSqlAdmin();
        // Strip country suffix (e.g. "Tokyo, Japan" → "Tokyo") so ILIKE matches DB city column
        const cityOnly = cityName.split(',')[0].trim();
        const normalized = cityOnly.replace(/-(si|do|gu|gun|eup)$/i, '').trim();

        // Resolve full country name ("Indonesia") or ISO-2 ("ID") to a 2-letter code for DB filtering
        const isoCode = resolveIsoCode(countryCode);
        // Resolve to DB city name — ETG seeds hotel_content with German-localized names
        // ("Rom", "Athen") that don't match the English canonical names we receive here.
        const dbCity = resolveHotelDbCity(normalized, isoCode ?? countryCode);
        const pattern = `%${dbCity}%`;

        const rows = isoCode
            ? await sql`
                SELECT hotel_id, name, images, star_rating, lat, lng, address, city, country,
                       description, amenities, review_rating, review_count
                FROM hotel_content
                WHERE city ILIKE ${pattern}
                  AND LOWER(country) = LOWER(${isoCode})
                  AND (hotel_id ~ '^[0-9]+$' OR hotel_id ~ '^[A-Z]{2}[0-9]+$')
                  AND (content_source IS NULL OR content_source != 'etg')
                ORDER BY review_count DESC NULLS LAST
                LIMIT 300
              `
            : await sql`
                SELECT hotel_id, name, images, star_rating, lat, lng, address, city, country,
                       description, amenities, review_rating, review_count
                FROM hotel_content
                WHERE city ILIKE ${pattern}
                  AND (hotel_id ~ '^[0-9]+$' OR hotel_id ~ '^[A-Z]{2}[0-9]+$')
                  AND (content_source IS NULL OR content_source != 'etg')
                ORDER BY review_count DESC NULLS LAST
                LIMIT 300
              `;

        return rows
            // Exclude hotels with slug-like OTV names (e.g. vx_the_fifty) from the
            // instant catalog — they'll be enriched via TGX Hotels Query in Phase 2.
            .filter((r: any) => !isSlugName(r.name))
            .map((r: any) => ({
            hotelId:      r.hotel_id,
            id:           r.hotel_id,
            name:         r.name || r.hotel_id,
            price:        0,
            currency:     'USD',
            images:       r.images ?? [],
            image:        (r.images as string[] | null)?.[0] ?? '',
            starRating:   r.star_rating ?? 0,
            reviewRating: Number(r.review_rating ?? 0),
            rating:       Number(r.review_rating ?? 0),
            reviewCount:  Number(r.review_count ?? 0),
            reviews:      Number(r.review_count ?? 0),
            lat:          Number(r.lat ?? 0),
            lng:          Number(r.lng ?? 0),
            coordinates:  { lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0) },
            address:      r.address ?? '',
            location:     r.address ?? '',
            city:         r.city ?? cityName,
            country:      r.country ?? '',
            description:  r.description ?? '',
            amenities:    r.amenities ?? [],
            type:         'hotel',
            boardTypes:   [],
            provider:     'travelgatex',
            priceLoading: true,
        }));
    } catch (e: any) {
        console.error('[instant-catalog] query failed:', e.message);
        return [];
    }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const enc = new TextEncoder();

function ndjsonLine(obj: unknown): Uint8Array {
    return enc.encode(JSON.stringify(obj) + '\n');
}

/**
 * POST /api/search/stream
 *
 * Uses a real ReadableStream so bytes reach the client as soon as each
 * provider resolves — Vercel does not buffer ReadableStream responses.
 *
 * NDJSON protocol (one JSON object per line):
 *   { "type": "hotels",  "data": [...], "allMappable": [...], "totalCount": N }
 *   { "type": "done",    "totalCount": N }
 *   { "type": "error",   "message": "..." }   ← on failure (status still 200)
 *
 * When Duffel Stays is re-enabled, fire it in parallel with TGX and stream
 * whichever resolves first by enqueueing from each Promise independently.
 * Uses a real ReadableStream so bytes reach the client as soon as each
 * provider resolves — Vercel does not buffer ReadableStream responses.
 *
 * NDJSON protocol (one JSON object per line):
 *   { "type": "hotels",  "data": [...], "allMappable": [...], "totalCount": N }
 *   { "type": "done",    "totalCount": N }
 *   { "type": "error",   "message": "..." }   ← on failure (status still 200)
 *
 * When Duffel Stays is re-enabled, fire it in parallel with TGX and stream
 * whichever resolves first by enqueueing from each Promise independently.
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));

    // When canonicalCity differs from destination, the destinationCode was resolved
    // for the district/alias (e.g. "Ottavia" → code 183294) not the parent city ("Rome").
    // Clear it before normalization so TGX falls back to city-name lookup.
    if (
        body.destinationCode &&
        body.canonicalCity &&
        body.destination &&
        body.destination.toLowerCase() !== body.canonicalCity.toLowerCase()
    ) {
        console.log(`[stream] clearing stale destinationCode ${body.destinationCode} (resolved for "${body.destination}", canonical is "${body.canonicalCity}")`);
        delete body.destinationCode;
    }

    // Normalize city name: strip country suffix (e.g. "Tokyo, Japan" → "Tokyo")
    // Landing cards pass "Tokyo, Japan" but DB and TGX both expect just the city name.
    const rawCity: string = body.cityName ?? body.destination ?? '';
    const normalizedCity = rawCity.split(',')[0].trim();
    // Always set cityName from the normalized city — not just when a suffix was stripped.
    // Without this, a clean destination like "Phuket" leaves body.cityName undefined,
    // which makes buildHotelCacheKey generate "city:" and runTgxSearch skip city filtering.
    if (normalizedCity) {
        body.cityName = normalizedCity;
        if (body.destination) body.destination = normalizedCity;
        if (normalizedCity !== rawCity && !body.countryCode) {
            // Resolve the country suffix to an ISO code so filterByCountryBbox can run.
            // Without this, "Paris, France" strips to "Paris" with no countryCode, and
            // OTV's wrong-country hotels (e.g. Wewoka OK tagged with the Paris dest-code)
            // slip through the bbox filter undetected.
            const countrySuffix = rawCity.slice(normalizedCity.length).replace(/^,\s*/, '').trim();
            const resolved = resolveIsoCode(countrySuffix);
            if (resolved) body.countryCode = resolved;
        }
    }

    // Resolve full country name → ISO-2 ("France" → "FR", "Indonesia" → "ID").
    // Landing cards pass the display name; bbox filters and TGX criteria need ISO-2.
    if (body.countryCode && body.countryCode.length > 2) {
        const resolved = resolveIsoCode(body.countryCode);
        if (resolved) body.countryCode = resolved;
    }

    // Province rungs are never directly resolvable by TGX — strip common admin
    // suffixes and force a city-level lookup so runCityFallback gets a clean name.
    // "Jeju-do" → "Jeju", "Osaka Prefecture" → "Osaka", "Kanagawa-ken" → "Kanagawa".
    if (body.rung === 'province' && body.cityName) {
        const stripped = body.cityName
            .replace(/-(si|do|gu|gun|eup|myeon)$/i, '')  // Korean
            .replace(/-(ken|to|fu)$/i, '')                 // Japanese
            .replace(/\s+(Province|Prefecture|County|Region|State|Oblast|Krai|Rayon|Governorate|Emirate|Canton|Department|Distrito|Wilaya|Commune|Voivodeship)$/i, '') // English/global
            .trim();
        if (stripped !== body.cityName) {
            console.log(`[stream] stripped admin suffix: "${body.cityName}" → "${stripped}"`);
            body.cityName = stripped;
            if (body.destination) body.destination = stripped;
        }
        body.rung = 'city';
        delete body.destinationCode;
    }

    // City alias resolution: map district/borough/neighbourhood names to the
    // canonical city TGX can resolve. Rung is upgraded to 'city' so the district
    // early-return in _runTgxSearch doesn't kill the search.
    if (body.cityName) {
        const nameLower = body.cityName.toLowerCase();
        if (body.countryCode) {
            // Fast path: country is known, check only that country's aliases.
            const alias = CITY_ALIASES[body.countryCode]?.[nameLower];
            if (alias) {
                console.log(`[stream] city alias: "${body.cityName}" (rung: ${body.rung}) → "${alias}" (rung: city)`);
                body.cityName = alias;
                if (body.destination) body.destination = alias;
                body.rung = 'city';
                // The destinationCode was resolved from the district name — it's wrong
                // for the canonical city. Clear it so TGX falls back to city-name lookup.
                delete body.destinationCode;
            }
        } else {
            // No country code (user typed and searched without selecting a suggestion).
            // Scan all country alias maps and take the first match.
            for (const [cc, aliases] of Object.entries(CITY_ALIASES)) {
                const alias = aliases[nameLower];
                if (alias) {
                    console.log(`[stream] city alias (no CC): "${body.cityName}" → "${alias}" (${cc})`);
                    body.cityName = alias;
                    if (body.destination) body.destination = alias;
                    body.countryCode = cc;
                    body.rung = 'city';
                    delete body.destinationCode;
                    break;
                }
            }
        }
    }

    const city = rawCity || '(unknown)';

    // Granularity ladder: URL params arrive as strings — coerce the geo fields so
    // runTgxSearch can dispatch point rungs (district/landmark) to ETG serp/geo.
    if (body.lat != null && body.lat !== '') body.lat = Number(body.lat);
    if (body.lng != null && body.lng !== '') body.lng = Number(body.lng);
    if (typeof body.bbox === 'string' && body.bbox.includes(',')) {
        const parts = body.bbox.split(',').map(Number);
        body.bbox = parts.length === 4 && parts.every((n: number) => Number.isFinite(n)) ? parts : undefined;
    }

    // Default dates when not provided (e.g. landing card clicks).
    // Use next Friday → Sunday so results match the prewarm cache and OTV has inventory.
    // Same-day / next-day defaults have near-zero OTV coverage.
    if (!body.checkin && !body.checkIn) {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
        const daysUntilFriday = ((5 - dayOfWeek + 7) % 7) || 7; // at least 1 day ahead
        const checkin  = new Date(now);
        checkin.setDate(now.getDate() + daysUntilFriday);
        const checkout = new Date(checkin);
        checkout.setDate(checkin.getDate() + 2); // Fri → Sun
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        body.checkin  = fmt(checkin);
        body.checkout = fmt(checkout);
    }

    const stream = new ReadableStream({
        async start(controller) {
            const send = (obj: unknown) => { try { controller.enqueue(ndjsonLine(obj)); } catch { /* client disconnected */ } };
            const t0 = Date.now();
            const elapsed = () => `${Date.now() - t0}ms`;

            let catalogHotels: any[] = [];
            try {
                // ── Phase 1: instant catalog (hotel_content, ~10ms) ───────────
                const p1Start = Date.now();
                catalogHotels = await getInstantHotelCatalog(body);
                console.log(`[stream] phase1 catalog: ${catalogHotels.length} hotels for "${city}" in ${Date.now() - p1Start}ms`);

                // Record demand regardless of catalog result — even cities not yet
                // in hotel_content should appear in stats so the cron can seed them.
                recordHotelSearchDemand(city, body.countryCode ?? '').catch(() => {});

                if (catalogHotels.length > 0) {
                    const mappable = catalogHotels.filter((h: any) => h.lat && h.lng);
                    console.log(`[stream] phase1 sending: ${catalogHotels.length} hotels (${mappable.length} mappable) at ${elapsed()}`);
                    send({ type: 'hotels', data: catalogHotels, allMappable: mappable, totalCount: catalogHotels.length, source: 'catalog' });

                    // Infer countryCode from catalog when not provided by the client.
                    // Searching "Phuket" (no country suffix) leaves body.countryCode empty,
                    // which makes filterByCountryBbox a no-op and lets wrong-country hotels through.
                    if (!body.countryCode) {
                        const freq: Record<string, number> = {};
                        for (const h of catalogHotels) {
                            const c = (h.country as string | undefined)?.toUpperCase().slice(0, 2);
                            if (c && c.length === 2) freq[c] = (freq[c] || 0) + 1;
                        }
                        const dominant = Object.entries(freq).sort(([, a], [, b]) => b - a)[0]?.[0];
                        if (dominant) {
                            body.countryCode = dominant;
                            console.log(`[stream] inferred countryCode "${dominant}" for "${city}" from catalog`);
                        }
                    }
                } else {
                    console.log(`[stream] phase1 empty — hotel_content has no hotels for "${city}" (countryCode: ${body.countryCode ?? 'none'})`);
                }

                // ── PARALLEL MODE (uncomment when Duffel Stays is re-enabled) ─
                // Fires TGX and Duffel simultaneously. Each provider streams its
                // results to the client the moment it resolves — no waiting for
                // the slower one. Remove the sequential TGX-only block below and
                // uncomment this entire section.
                //
                // const cityName: string = body.cityName ?? body.destination ?? '';
                // const duffelParams = {
                //     checkin:           body.checkin  ?? body.checkIn  ?? '',
                //     checkout:          body.checkout ?? body.checkOut ?? '',
                //     adults:            Number(body.adults)   || 2,
                //     children:          Number(body.children) || 0,
                //     rooms:             Number(body.rooms)    || 1,
                //     guest_nationality: body.guest_nationality ?? 'KR',
                //     currency:          body.currency ?? 'KRW',
                //     cityName,
                //     countryCode:       body.countryCode ?? '',
                //     query:             cityName,
                // };
                //
                // const tgxPromise    = runTgxSearch(body) as Promise<any>;
                // const duffelPromise = (!body.hotelCode && cityName)
                //     ? searchDuffelStays(duffelParams)
                //     : Promise.resolve([]);
                //
                // // Stream each provider's results as soon as it resolves.
                // let totalCount = 0;
                // let allMappable: any[] = [];
                //
                // const [tgxSettled, duffelSettled] = await Promise.allSettled([
                //     tgxPromise.then(r => {
                //         const hotels: any[] = Array.isArray(r.data) ? r.data : [];
                //         const mappable: any[] = r.allMappable ?? [];
                //         if (hotels.length > 0) {
                //             totalCount  += hotels.length;
                //             allMappable  = [...allMappable, ...mappable];
                //             send({ type: 'hotels', data: hotels, allMappable: mappable, totalCount: hotels.length });
                //         }
                //         return hotels;
                //     }),
                //     duffelPromise.then(results => {
                //         if (results.length === 0) return [];
                //         const hotels = results.map((p: any) => ({
                //             hotelId:      p.id,
                //             id:           p.id,
                //             name:         p.name,
                //             price:        p.price,
                //             currency:     p.currency,
                //             lat:          p.coordinates?.lat ?? 0,
                //             lng:          p.coordinates?.lng ?? 0,
                //             images:       p.images ?? [],
                //             starRating:   p.rating ? Math.round(p.rating / 2) : 0,
                //             reviewRating: p.rating ?? 0,
                //             reviewCount:  p.reviews ?? 0,
                //             description:  p.description ?? '',
                //             address:      p.location ?? '',
                //             city:         p.city ?? cityName,
                //             country:      body.countryCode ?? '',
                //             amenities:    p.amenities ?? [],
                //             refundableTag: p.refundableTag ?? 'UNKNOWN',
                //             boardCode:    p.boardTypes?.[0] ?? 'RO',
                //             provider:     'duffel',
                //             rateId:       p.rateId,
                //             roomTypes:    [],
                //         }));
                //         const mappable = hotels.filter((h: any) => h.lat && h.lng);
                //         totalCount  += hotels.length;
                //         allMappable  = [...allMappable, ...mappable];
                //         send({ type: 'hotels', data: hotels, allMappable: mappable, totalCount: hotels.length });
                //         return hotels;
                //     }),
                // ]);
                //
                // if (tgxSettled.status === 'rejected')    console.error('[search/stream] TGX error:',    tgxSettled.reason?.message);
                // if (duffelSettled.status === 'rejected') console.error('[search/stream] Duffel error:', duffelSettled.reason?.message);
                // send({ type: 'done', totalCount, allMappable });
                // ── END PARALLEL MODE ──────────────────────────────────────────

                // ── Phase 2: TGX search + catalog content fetch (PARALLEL) ────
                // We already know catalog hotel IDs from Phase 1, so fetch their content
                // while TGX searches. After Phase 2 we immediately stream prices/hotels,
                // then send a type:'content' patch once both content fetches complete.
                const catalogIdSet = new Set(catalogHotels.map((h: any) => h.id as string));
                const catalogIdList = [...catalogIdSet];

                const p2Start = Date.now();
                console.log(`[stream] phase2 TGX + catalog content starting at ${elapsed()}`);

                // Catalog content: 50s budget, runs fully in parallel with Phase 2
                const catalogContentPromise: Promise<Map<string, HotelContentPatch>> =
                    catalogIdList.length > 0
                        ? fetchHotelContentPatches(catalogIdList, 50_000)
                        : Promise.resolve(new Map());

                let tgxFailed = false;
                const tgxResult = await runTgxSearch(body).catch((tgxErr: any) => {
                    tgxFailed = true;
                    const isTimeout = tgxErr?.name === 'TimeoutError' || tgxErr?.message?.includes('timeout') || tgxErr?.message?.includes('aborted');
                    console.warn(`[stream] phase2 TGX ${isTimeout ? 'timed out' : 'failed'} for "${city}": ${tgxErr.message}`);
                    return { data: [] as any[], allMappable: [] as any[] };
                });

                const tgxHotels: any[] = Array.isArray(tgxResult.data) ? tgxResult.data : [];
                const tgxMappable: any[] = tgxResult.allMappable ?? [];
                console.log(`[stream] phase2 TGX done: ${tgxHotels.length} hotels in ${Date.now() - p2Start}ms (total ${elapsed()})`);

                // ── Stream prices/remove/new-hotels IMMEDIATELY after Phase 2 ─────────────
                // Users see prices + hotel list appear without waiting for the content API.
                // Images arrive seconds later via the type:'content' message below.
                const tgxHotelIdSet = new Set(tgxHotels.map((h: any) => h.hotelId || h.id));
                const newTgxHotels = tgxHotels.filter((h: any) => !catalogIdSet.has(h.hotelId || h.id));

                if (catalogHotels.length > 0) {
                    const prices = tgxHotels.map((h: any) => ({
                        hotelId:       h.hotelId || h.id,
                        price:         h.price,
                        currency:      h.currency,
                        offerId:       h.offerId,
                        refundableTag: h.refundableTag,
                        boardCode:     h.boardCode,
                        boardTypes:    h.boardCode ? [h.boardCode] : [],
                        _tgx:          h._tgx,
                    }));
                    const unavailableIds = catalogHotels
                        .filter((h: any) => !tgxHotelIdSet.has(h.id))
                        .map((h: any) => h.id);

                    const matchedCount = prices.filter((p: any) => catalogIdSet.has(p.hotelId)).length;
                    console.log(`[stream] prices: ${matchedCount} matched catalog, ${newTgxHotels.length} new, ${unavailableIds.length} unavailable`);

                    if (prices.length > 0) send({ type: 'prices', data: prices });
                    // Remove unavailable catalog hotels so priceLoading:true clears.
                    // When TGX errors/times out (tgxFailed), keep catalog visible — better than
                    // an empty page from a transient failure. When TGX returns legitimately 0
                    // options, remove the skeletons so the page doesn't load forever.
                    if (!tgxFailed && unavailableIds.length > 0) send({ type: 'remove', ids: unavailableIds });
                    if (newTgxHotels.length > 0) {
                        const newMappable = newTgxHotels.filter((h: any) => h.lat && h.lng);
                        console.log(`[stream] sending ${newTgxHotels.length} new TGX hotels`);
                        send({ type: 'hotels', data: newTgxHotels, allMappable: newMappable, totalCount: newTgxHotels.length });
                    }
                } else {
                    // No catalog — send raw TGX hotels now; images patched via type:'content' below
                    if (tgxHotels.length > 0) {
                        console.log(`[stream] no catalog, sending ${tgxHotels.length} TGX hotels`);
                        send({ type: 'hotels', data: tgxHotels, allMappable: tgxMappable, totalCount: tgxHotels.length });
                    }
                }

                // ── Content patches (two-phase to unblock the client quickly) ────────────
                // Phase A: catalog content — was started in parallel with TGX, likely done.
                //          Send immediately so catalog hotel images appear, then send done.
                // Phase B: new TGX content — fetched AFTER done so the client doesn't wait.
                //          Images arrive via a second type:'content' message; client keeps
                //          reading until the stream closes (reader.read() done:true).
                const newTgxIds = newTgxHotels.map((h: any) => h.hotelId || h.id as string);

                const catalogPatches = await catalogContentPromise;
                if (catalogPatches.size > 0) {
                    const catalogContentData: Record<string, { images?: string[]; name?: string }> = {};
                    for (const [id, patch] of catalogPatches) {
                        if (patch.images?.length || patch.name) catalogContentData[id] = patch;
                    }
                    if (Object.keys(catalogContentData).length > 0) {
                        console.log(`[stream] content: catalog=${Object.keys(catalogContentData).length} patches at ${elapsed()}`);
                        send({ type: 'content', data: catalogContentData });
                    }
                }

                // Send done — client can render immediately without waiting for TGX images.
                const finalCount = tgxHotels.length > 0 ? tgxHotels.length : catalogHotels.length;
                console.log(`[stream] done — total ${finalCount} hotels, ${elapsed()} wall time`);
                send({ type: 'done', totalCount: finalCount, tgxCount: tgxHotels.length, tgxFailed, allMappable: tgxMappable.length > 0 ? tgxMappable : catalogHotels.filter((h: any) => h.lat && h.lng) });

                // Phase B: fetch images for new TGX hotels (not in catalog) — post-done.
                // Client processes this type:'content' message to add images to visible cards.
                const remainingBudget = Math.max(8_000, 50_000 - (Date.now() - t0));
                const newHotelPatches: Map<string, HotelContentPatch> = newTgxIds.length > 0
                    ? await fetchHotelContentPatches(newTgxIds, remainingBudget)
                    : new Map();

                if (newHotelPatches.size > 0) {
                    const newContentData: Record<string, { images?: string[]; name?: string }> = {};
                    for (const [id, patch] of newHotelPatches) {
                        if (patch.images?.length || patch.name) newContentData[id] = patch;
                    }
                    if (Object.keys(newContentData).length > 0) {
                        console.log(`[stream] content: newTgx=${Object.keys(newContentData).length} patches (post-done, total ${elapsed()})`);
                        send({ type: 'content', data: newContentData });
                    }
                }

                // Background: persist fresh images/coords to hotel_content for future searches
                const allPatches = new Map<string, HotelContentPatch>([...catalogPatches, ...newHotelPatches]);
                if (allPatches.size > 0) {
                    const sqlBg = getSqlAdmin();
                    for (const [hotelId, patch] of allPatches) {
                        if (patch.images?.length) {
                            sqlBg`UPDATE hotel_content SET images = ${sqlBg.array(patch.images)}, fetched_at = now()
                                  WHERE hotel_id = ${hotelId} AND (images IS NULL OR cardinality(images) = 0)`
                                .catch((e: any) => console.warn('[stream] img-update failed:', hotelId, e.message?.slice(0, 60)));
                        }
                        if (patch.name) {
                            sqlBg`UPDATE hotel_content SET name = ${patch.name}, fetched_at = now()
                                  WHERE hotel_id = ${hotelId} AND (name IS NULL OR name = hotel_id OR name ~ '^[a-z][a-z0-9_]+$')`
                                .catch(() => {});
                        }
                        if (patch.lat && patch.lng) {
                            sqlBg`UPDATE hotel_content SET lat = ${patch.lat}, lng = ${patch.lng}, fetched_at = now()
                                  WHERE hotel_id = ${hotelId} AND (lat IS NULL OR lat = 0) AND (lng IS NULL OR lng = 0)`
                                .catch(() => {});
                        }
                    }
                }
                // ── END two-phase mode ────────────────────────────────────────

            } catch (e: any) {
                const isTimeout = e?.name === 'TimeoutError' || e?.message?.includes('timeout') || e?.message?.includes('aborted');
                console.error(`[stream] ${isTimeout ? 'timeout' : 'fatal error'} for "${city}" at ${elapsed()}:`, e.message);
                if (catalogHotels.length > 0) {
                    // Catalog already sent — just close cleanly; don't flash an error over real results
                    send({ type: 'done', totalCount: catalogHotels.length, tgxCount: 0, allMappable: catalogHotels.filter((h: any) => h.lat && h.lng) });
                } else if (!isTimeout) {
                    // Only surface non-timeout errors to the client
                    send({ type: 'error', message: e.message });
                } else {
                    send({ type: 'done', totalCount: 0, allMappable: [] });
                }
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type':      'application/x-ndjson',
            'X-Accel-Buffering': 'no',   // disable nginx/Vercel proxy buffering
            'Cache-Control':     'no-cache, no-store',
            'Connection':        'keep-alive',
        },
    });
}
