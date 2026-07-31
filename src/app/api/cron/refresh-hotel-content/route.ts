/**
 * GET /api/cron/refresh-hotel-content
 *
 * Daily cron — downloads hotel static content from TGX Hotels Query and
 * stores it in hotel_content. Required by the RTX API agreement §2.1:
 * "CLIENT performs, on a daily basis, an update to CLIENT's System(s) of
 * any such content that has been modified in the Hotel Content Database."
 *
 * Strategy:
 *   1. Pull the top 30 most-searched cities from hotel_search_stats.
 *   2. For each city, use its TGX destination code (from tgx_destination_cache)
 *      to call the TGX Hotels Query with pagination (500/page).
 *   3. Upsert results into hotel_content — never overwrites richer existing data.
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';

const HOTELS_QUERY = `
query TgxHotelContent($criteria: HotelXHotelListInput!, $token: String) {
  hotelX {
    hotels(criteria: $criteria, token: $token) {
      token
      edges {
        node {
          hotelData {
            code
            hotelName
            categoryCode
            location {
              coordinates { latitude longitude }
              address
              city
              country
            }
            medias { url type }
            descriptions { type texts { language text } }
            allAmenities { edges { node { amenityData { code } } } }
          }
        }
      }
    }
  }
}`;

function extractDescription(descriptions: any[]): string | null {
    if (!descriptions?.length) return null;
    const gen = descriptions.find((d: any) => d.type === 'GENERAL');
    const any = descriptions[0];
    const texts: any[] = (gen ?? any)?.texts ?? [];
    const en = texts.find((t: any) => t.language === 'en') ?? texts[0];
    return en?.text ?? null;
}

function extractImage(medias: any[]): string[] {
    if (!medias?.length) return [];
    return medias
        .filter((m: any) => m.url && (!m.type || m.type === 'photo' || m.type === 'PHOTO'))
        .map((m: any) => m.url as string)
        .slice(0, 10);
}

async function fetchAndUpsertCity(
    sql: ReturnType<typeof getSqlAdmin>,
    cfg: ReturnType<typeof getTgxConfig>,
    cityKey: string,
    destCode: string | null,
    countryCode: string | null,
): Promise<number> {
    const PAGE_SIZE = 500;
    let token: string | null = null;
    let totalSaved = 0;
    let page = 0;
    const MAX_PAGES = 4;

    do {
        const criteria: Record<string, unknown> = {
            access: cfg.accessCode,
            maxSize: PAGE_SIZE,
        };
        if (destCode) criteria.destinationCodes = [destCode];
        else if (countryCode) criteria.countries = [countryCode.toUpperCase()];

        let result: any;
        try {
            result = await tgxGraphQL(HOTELS_QUERY, {
                criteria,
                ...(token ? { token } : {}),
            });
        } catch (e: any) {
            console.warn(`[refresh-hotel-content] TGX query failed for "${cityKey}": ${e.message}`);
            break;
        }

        const hotelList = result?.data?.hotelX?.hotels ?? {};
        const edges: any[] = hotelList.edges ?? [];
        token = hotelList.token ?? null;
        page++;

        for (const edge of edges) {
            const hd = edge?.node?.hotelData;
            if (!hd?.code) continue;

            const lat = Number(hd.location?.coordinates?.latitude ?? 0);
            const lng = Number(hd.location?.coordinates?.longitude ?? 0);
            const images = extractImage(hd.medias ?? []);
            const description = extractDescription(hd.descriptions ?? []);
            const starRating = Number(hd.categoryCode?.replace(/[^0-9]/g, '') ?? 0);

            try {
                await sql`
                    INSERT INTO hotel_content
                        (hotel_id, name, images, lat, lng, address, city, country,
                         description, star_rating, amenities, content_source, fetched_at)
                    VALUES (
                        ${hd.code},
                        ${hd.hotelName ?? null},
                        ${sql.array(images)},
                        ${lat}, ${lng},
                        ${hd.location?.address ?? null},
                        ${hd.location?.city ?? null},
                        ${hd.location?.country ?? countryCode ?? null},
                        ${description},
                        ${starRating},
                        ${'[]'}::jsonb,
                        'tgx',
                        now()
                    )
                    ON CONFLICT (hotel_id) DO UPDATE SET
                        name        = CASE WHEN hotel_content.name IS NULL OR hotel_content.name = hotel_content.hotel_id
                                     THEN COALESCE(EXCLUDED.name, hotel_content.name) ELSE hotel_content.name END,
                        images      = CASE WHEN array_length(hotel_content.images, 1) > 0
                                     THEN hotel_content.images ELSE EXCLUDED.images END,
                        lat         = CASE WHEN EXCLUDED.lat != 0 THEN EXCLUDED.lat ELSE hotel_content.lat END,
                        lng         = CASE WHEN EXCLUDED.lng != 0 THEN EXCLUDED.lng ELSE hotel_content.lng END,
                        address     = COALESCE(hotel_content.address, EXCLUDED.address),
                        city        = COALESCE(hotel_content.city, EXCLUDED.city),
                        country     = COALESCE(hotel_content.country, EXCLUDED.country),
                        description = COALESCE(hotel_content.description, EXCLUDED.description),
                        star_rating = CASE WHEN hotel_content.star_rating != 0
                                     THEN hotel_content.star_rating ELSE EXCLUDED.star_rating END,
                        content_source = COALESCE(hotel_content.content_source, 'tgx'),
                        fetched_at  = now()
                `;
                totalSaved++;
            } catch { /* skip individual failures */ }
        }

        console.log(`[refresh-hotel-content] "${cityKey}" page ${page}: ${edges.length} hotels, running total ${totalSaved}`);
    } while (token && page < MAX_PAGES);

    return totalSaved;
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const cfg = getTgxConfig();
    const t0 = Date.now();

    // Top 30 most-searched cities with their TGX destination codes
    const cities = await sql<{ city_key: string; country_code: string }[]>`
        SELECT city_key, country_code FROM hotel_search_stats
        ORDER BY search_count DESC
        LIMIT 30
    `;

    if (cities.length === 0) {
        return NextResponse.json({ ok: true, message: 'No cities in hotel_search_stats yet', updated: 0 });
    }

    // Load cached destination codes
    const cityKeys = cities.map(r => r.city_key);
    const destRows = await sql<{ city_key: string; destination_code: string }[]>`
        SELECT city_key, destination_code FROM tgx_destination_cache
        WHERE city_key = ANY(${cityKeys})
    `;
    const destCodeMap = new Map(destRows.map(r => [r.city_key, r.destination_code]));

    const results: Record<string, number> = {};

    for (const { city_key, country_code } of cities) {
        const destCode = destCodeMap.get(city_key) ?? null;
        console.log(`[refresh-hotel-content] Seeding "${city_key}" destCode=${destCode ?? 'none'} country=${country_code}`);
        try {
            const saved = await fetchAndUpsertCity(sql, cfg, city_key, destCode, country_code);
            results[city_key] = saved;
        } catch (e: any) {
            console.warn(`[refresh-hotel-content] Failed for "${city_key}": ${e.message}`);
            results[city_key] = 0;
        }
        // Small delay between cities to avoid hammering TGX
        await new Promise(r => setTimeout(r, 500));
    }

    const totalUpdated = Object.values(results).reduce((a, b) => a + b, 0);
    const elapsed = Date.now() - t0;
    console.log(`[refresh-hotel-content] Done: ${totalUpdated} hotels across ${cities.length} cities in ${elapsed}ms`);

    return NextResponse.json({ ok: true, updated: totalUpdated, cities: results, elapsedMs: elapsed });
}
