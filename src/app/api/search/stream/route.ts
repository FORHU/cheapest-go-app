import { NextRequest } from 'next/server';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { searchDuffelStays } from '@/lib/server/stays/providers/duffel';
import { getSqlAdmin } from '@/lib/db/postgres';

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
        const pattern = `%${normalized}%`;

        // Resolve full country name ("Indonesia") or ISO-2 ("ID") to a 2-letter code for DB filtering
        const isoCode = resolveIsoCode(countryCode);

        // Require at least one image — hotels without images are either unseeded or wrong-location
        // false positives (e.g. the village of Bali in Crete showing up in a Bali, Indonesia search).
        const rows = isoCode
            ? await sql`
                SELECT hotel_id, name, images, star_rating, lat, lng, address, city, country,
                       description, amenities, review_rating, review_count
                FROM hotel_content
                WHERE city ILIKE ${pattern}
                  AND LOWER(country) = LOWER(${isoCode})
                  AND (hotel_id ~ '^\d+$' OR hotel_id ~ '^[A-Z]{2}\d+$')
                  AND images IS NOT NULL AND array_length(images, 1) > 0
                ORDER BY review_count DESC NULLS LAST
                LIMIT 300
              `
            : await sql`
                SELECT hotel_id, name, images, star_rating, lat, lng, address, city, country,
                       description, amenities, review_rating, review_count
                FROM hotel_content
                WHERE city ILIKE ${pattern}
                  AND (hotel_id ~ '^\d+$' OR hotel_id ~ '^[A-Z]{2}\d+$')
                  AND images IS NOT NULL AND array_length(images, 1) > 0
                ORDER BY review_count DESC NULLS LAST
                LIMIT 300
              `;

        return rows.map((r: any) => ({
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

    // Normalize city name: strip country suffix (e.g. "Tokyo, Japan" → "Tokyo")
    // Landing cards pass "Tokyo, Japan" but DB and TGX both expect just the city name.
    const rawCity: string = body.cityName ?? body.destination ?? '';
    const normalizedCity = rawCity.split(',')[0].trim();
    if (normalizedCity && normalizedCity !== rawCity) {
        body.cityName = normalizedCity;
        if (body.destination) body.destination = normalizedCity;
        // Resolve the country suffix to an ISO code so filterByCountryBbox can run.
        // Without this, "Paris, France" strips to "Paris" with no countryCode, and
        // OTV's wrong-country hotels (e.g. Wewoka OK tagged with the Paris dest-code)
        // slip through the bbox filter undetected.
        if (!body.countryCode) {
            const countrySuffix = rawCity.slice(normalizedCity.length).replace(/^,\s*/, '').trim();
            const resolved = resolveIsoCode(countrySuffix);
            if (resolved) body.countryCode = resolved;
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
            const send = (obj: unknown) => controller.enqueue(ndjsonLine(obj));
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

                // ── Phase 2: TGX availability + pricing (18-22s) ─────────────
                const p2Start = Date.now();
                console.log(`[stream] phase2 TGX starting for "${city}" at ${elapsed()}`);
                let tgxResult: any;
                try {
                    tgxResult = await runTgxSearch(body);
                } catch (tgxErr: any) {
                    const isTimeout = tgxErr?.name === 'TimeoutError' || tgxErr?.message?.includes('timeout') || tgxErr?.message?.includes('aborted');
                    console.warn(`[stream] phase2 TGX ${isTimeout ? 'timed out' : 'failed'} for "${city}": ${tgxErr.message}`);
                    tgxResult = { data: [], allMappable: [] };
                }
                const tgxHotels: any[] = Array.isArray(tgxResult.data) ? tgxResult.data : [];
                const tgxMappable: any[] = tgxResult.allMappable ?? [];
                console.log(`[stream] phase2 TGX done: ${tgxHotels.length} hotels in ${Date.now() - p2Start}ms (total ${elapsed()})`);

                if (catalogHotels.length > 0) {
                    // Catalog was already sent — patch prices onto existing cards.
                    const prices = tgxHotels.map((h: any) => ({
                        hotelId:       h.hotelId || h.id,
                        price:         h.price,
                        currency:      h.currency,
                        offerId:       h.offerId,
                        refundableTag: h.refundableTag,
                        boardCode:     h.boardCode,
                        _tgx:          h._tgx,
                    }));

                    const catalogIds = new Set(catalogHotels.map((h: any) => h.id));
                    const tgxHotelIds = new Set(tgxHotels.map((h: any) => h.hotelId || h.id));
                    const newHotels = tgxHotels.filter((h: any) => !catalogIds.has(h.hotelId || h.id));
                    const matchedCount = prices.filter(p => catalogIds.has(p.hotelId)).length;
                    const unavailableIds = catalogHotels
                        .filter((h: any) => !tgxHotelIds.has(h.id))
                        .map((h: any) => h.id);

                    console.log(`[stream] prices patch: ${matchedCount} matched catalog, ${newHotels.length} new from TGX, ${unavailableIds.length} catalog hotels unavailable (removing)`);

                    if (prices.length > 0) send({ type: 'prices', data: prices });
                    // Remove catalog hotels TGX found no availability for — only when TGX
                    // actually returned results so a TGX timeout doesn't wipe the catalog.
                    if (tgxHotels.length > 0 && unavailableIds.length > 0) send({ type: 'remove', ids: unavailableIds });

                    if (newHotels.length > 0) {
                        const newMappable = newHotels.filter((h: any) => h.lat && h.lng);
                        console.log(`[stream] sending ${newHotels.length} new TGX hotels not in catalog`);
                        send({ type: 'hotels', data: newHotels, allMappable: newMappable, totalCount: newHotels.length });
                    }
                } else {
                    // No catalog — send full TGX response as normal.
                    console.log(`[stream] no catalog, sending ${tgxHotels.length} TGX hotels directly`);
                    send({ type: 'hotels', data: tgxHotels, allMappable: tgxMappable, totalCount: tgxHotels.length });
                }

                const finalCount = tgxHotels.length > 0 ? tgxHotels.length : catalogHotels.length;
                console.log(`[stream] done — total ${finalCount} hotels, ${elapsed()} wall time`);
                send({ type: 'done', totalCount: finalCount, allMappable: tgxMappable.length > 0 ? tgxMappable : catalogHotels.filter((h: any) => h.lat && h.lng) });
                // ── END two-phase mode ────────────────────────────────────────

            } catch (e: any) {
                const isTimeout = e?.name === 'TimeoutError' || e?.message?.includes('timeout') || e?.message?.includes('aborted');
                console.error(`[stream] ${isTimeout ? 'timeout' : 'fatal error'} for "${city}" at ${elapsed()}:`, e.message);
                if (catalogHotels.length > 0) {
                    // Catalog already sent — just close cleanly; don't flash an error over real results
                    send({ type: 'done', totalCount: catalogHotels.length, allMappable: catalogHotels.filter((h: any) => h.lat && h.lng) });
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
