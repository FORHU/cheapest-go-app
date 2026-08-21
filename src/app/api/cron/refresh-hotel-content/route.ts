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
import { otvCodeToLabel } from '@/lib/server/stays/travelgatex/amenityCodes';

export const dynamic = 'force-dynamic';

// Full field set — matches HOTEL_DATA_FIELDS in search.ts
const HOTELS_QUERY = `
query TgxHotelContent($criteria: HotelXHotelListInput!, $token: String) {
  hotelX {
    hotels(criteria: $criteria, token: $token) {
      token
      edges {
        node {
          hotelData {
            code hotelName categoryCode chainCode
            descriptions { type texts { language text } }
            medias { url type order }
            location {
              coordinates { latitude longitude }
              address city country zipCode
            }
            contact { email telephone fax web }
            allAmenities { edges { node { amenityData { amenityCode type } } } }
            checkIn  { schedule { startTime endTime } minAge instructions { language text } specialInstructions { language text } }
            checkOut { schedule { startTime endTime } minAge instructions { language text } specialInstructions { language text } }
            giataData { id }
          }
        }
      }
    }
  }
}`;

// ─── Field parsers (mirror parseTgxHotelData in search.ts) ───────────────────

function extractDescription(descriptions: any[]): { description: string | null; importantInfo: string | null } {
    if (!descriptions?.length) return { description: null, importantInfo: null };
    let description: string | null = null;
    const extra: string[] = [];
    for (const d of descriptions) {
        const en = (d.texts ?? []).find((t: any) => t.language?.toLowerCase().startsWith('en'));
        const text: string | null = en?.text ?? d.texts?.[0]?.text ?? null;
        if (!text) continue;
        if (d.type === 'GENERAL' && !description) description = text;
        else if (text) extra.push(text);
    }
    if (!description && extra.length) description = extra.shift() ?? null;
    return { description, importantInfo: extra.length ? extra.join('\n\n') : null };
}

function extractImages(medias: any[]): string[] {
    return (medias ?? [])
        .sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99))
        .filter((m: any) => m.url)
        .map((m: any) => m.url as string)
        .slice(0, 10);
}

function extractAmenities(allAmenities: any): { codes: string[]; groups: any[] } {
    const edges: any[] = allAmenities?.edges ?? [];
    const codes = edges
        .map((e: any) => otvCodeToLabel(e?.node?.amenityData?.amenityCode ?? ''))
        .filter(Boolean);
    const groups = edges
        .map((e: any) => ({ code: e?.node?.amenityData?.amenityCode, type: e?.node?.amenityData?.type }))
        .filter((g: any) => g.code);
    return { codes, groups };
}

function extractCheckTime(info: any, useStart = true): string | null {
    if (!info) return null;
    const schedule = info.schedule;
    const fromSchedule = useStart ? schedule?.startTime : (schedule?.endTime ?? schedule?.startTime);
    if (fromSchedule) return fromSchedule;
    const instructions: any[] = info.instructions ?? [];
    const en = instructions.find((t: any) => t.language?.toLowerCase().startsWith('en'));
    return en?.text ?? instructions[0]?.text ?? null;
}

function extractContact(contact: any): { email?: string; phone?: string; fax?: string; web?: string } | null {
    if (!contact) return null;
    const { email, telephone, fax, web } = contact;
    if (!email && !telephone && !fax && !web) return null;
    return {
        ...(email     ? { email }           : {}),
        ...(telephone ? { phone: telephone } : {}),
        ...(fax       ? { fax }             : {}),
        ...(web       ? { web }             : {}),
    };
}

// ─── Core fetch + upsert for one city page ───────────────────────────────────

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
        const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: PAGE_SIZE };
        if (destCode)   criteria.destinationCodes = [destCode];
        else if (countryCode) criteria.countries  = [countryCode.toUpperCase()];

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

            const lat   = Number(hd.location?.coordinates?.latitude  ?? 0);
            const lng   = Number(hd.location?.coordinates?.longitude ?? 0);
            const images = extractImages(hd.medias ?? []);
            const { description, importantInfo } = extractDescription(hd.descriptions ?? []);
            const starRating = Number((hd.categoryCode ?? '').replace(/[^0-9]/g, '') || 0);
            const { codes: amenities, groups: amenityGroups } = extractAmenities(hd.allAmenities);
            const checkInTime  = extractCheckTime(hd.checkIn,  true);
            const checkOutTime = extractCheckTime(hd.checkOut, false);
            const contact      = extractContact(hd.contact);
            const rawCountry   = hd.location?.country;
            const country      = typeof rawCountry === 'string' ? rawCountry : (rawCountry?.code ?? countryCode ?? null);

            try {
                await sql`
                    INSERT INTO hotel_content
                        (hotel_id, name, images, lat, lng, address, city, country,
                         description, star_rating, amenities, amenity_groups,
                         check_in_time, check_out_time, important_information,
                         contact_info, chain_code, giata_id,
                         content_source, fetched_at)
                    VALUES (
                        ${hd.code},
                        ${hd.hotelName ?? null},
                        ${sql.array(images)},
                        ${lat}, ${lng},
                        ${hd.location?.address ?? null},
                        ${hd.location?.city ?? null},
                        ${country},
                        ${description},
                        ${starRating},
                        ${JSON.stringify(amenities)}::jsonb,
                        ${amenityGroups.length ? JSON.stringify(amenityGroups) : null}::jsonb,
                        ${checkInTime},
                        ${checkOutTime},
                        ${importantInfo},
                        ${contact ? JSON.stringify(contact) : null}::jsonb,
                        ${hd.chainCode ?? null},
                        ${hd.giataData?.id ?? null},
                        'tgx',
                        now()
                    )
                    ON CONFLICT (hotel_id) DO UPDATE SET
                        name          = CASE WHEN hotel_content.name IS NULL OR hotel_content.name = hotel_content.hotel_id
                                        THEN COALESCE(EXCLUDED.name, hotel_content.name) ELSE hotel_content.name END,
                        images        = CASE WHEN array_length(hotel_content.images, 1) > 0
                                        THEN hotel_content.images ELSE EXCLUDED.images END,
                        lat           = CASE WHEN EXCLUDED.lat != 0 THEN EXCLUDED.lat ELSE hotel_content.lat END,
                        lng           = CASE WHEN EXCLUDED.lng != 0 THEN EXCLUDED.lng ELSE hotel_content.lng END,
                        address       = COALESCE(hotel_content.address,     EXCLUDED.address),
                        city          = COALESCE(hotel_content.city,        EXCLUDED.city),
                        country       = COALESCE(hotel_content.country,     EXCLUDED.country),
                        description   = COALESCE(hotel_content.description, EXCLUDED.description),
                        star_rating   = CASE WHEN hotel_content.star_rating != 0
                                        THEN hotel_content.star_rating ELSE EXCLUDED.star_rating END,
                        amenities     = CASE WHEN (hotel_content.amenities IS NOT NULL
                                                   AND jsonb_typeof(hotel_content.amenities) = 'array'
                                                   AND jsonb_array_length(hotel_content.amenities) > 0)
                                        THEN hotel_content.amenities ELSE EXCLUDED.amenities END,
                        amenity_groups        = COALESCE(hotel_content.amenity_groups,        EXCLUDED.amenity_groups),
                        check_in_time         = COALESCE(hotel_content.check_in_time,         EXCLUDED.check_in_time),
                        check_out_time        = COALESCE(hotel_content.check_out_time,        EXCLUDED.check_out_time),
                        important_information = COALESCE(hotel_content.important_information, EXCLUDED.important_information),
                        contact_info          = COALESCE(hotel_content.contact_info,          EXCLUDED.contact_info),
                        chain_code            = COALESCE(hotel_content.chain_code,            EXCLUDED.chain_code),
                        giata_id              = COALESCE(hotel_content.giata_id,              EXCLUDED.giata_id),
                        content_source        = COALESCE(hotel_content.content_source, 'tgx'),
                        fetched_at            = now()
                `;
                totalSaved++;
            } catch { /* skip individual failures */ }
        }

        console.log(`[refresh-hotel-content] "${cityKey}" page ${page}: ${edges.length} hotels (token=${!!token})`);
    } while (token && page < MAX_PAGES);

    return totalSaved;
}

// ─── Background worker ─────────────────────────────────────────────────────

async function runRefresh(limit: number) {
    const sql = getSqlAdmin();
    const cfg = getTgxConfig();
    const t0  = Date.now();

    const cities = await sql<{ city_key: string; country_code: string }[]>`
        SELECT city_key, country_code FROM hotel_search_stats
        ORDER BY search_count DESC
        LIMIT ${limit}
    `;

    if (cities.length === 0) {
        console.log('[refresh-hotel-content] No cities in hotel_search_stats — skipping');
        return;
    }

    const cityKeys = cities.map(r => r.city_key);
    // Build lookup keys: prefer country-scoped keys (e.g. 'rome:it') over city-only ('rome')
    // so TGX name collisions (Rome, Georgia vs Rome, Italy) resolve to the right destination.
    const scopedKeys = cities
        .filter(r => r.country_code)
        .map(r => `${r.city_key}:${r.country_code.toLowerCase()}`);
    const allKeys = [...new Set([...scopedKeys, ...cityKeys])];
    const destRows = await sql<{ city_key: string; destination_code: string }[]>`
        SELECT city_key, destination_code FROM tgx_destination_cache
        WHERE city_key = ANY(${allKeys})
    `;
    const destCodeMap = new Map(destRows.map(r => [r.city_key, r.destination_code]));

    let totalUpdated = 0;
    for (const { city_key, country_code } of cities) {
        // Prefer scoped key (city:cc) over city-only to avoid wrong-country collisions
        const scopedKey = country_code ? `${city_key}:${country_code.toLowerCase()}` : null;
        const destCode = (scopedKey && destCodeMap.get(scopedKey)) || destCodeMap.get(city_key) || null;
        console.log(`[refresh-hotel-content] Seeding "${city_key}" destCode=${destCode ?? 'none'} (scopedKey=${scopedKey ?? 'none'}`);
        try {
            const saved = await fetchAndUpsertCity(sql, cfg, city_key, destCode, country_code);
            totalUpdated += saved;
        } catch (e: any) {
            console.warn(`[refresh-hotel-content] Failed for "${city_key}": ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 300));
    }

    const elapsed = Date.now() - t0;
    console.log(`[refresh-hotel-content] Done: ${totalUpdated} hotels across ${cities.length} cities in ${elapsed}ms`);
}

// ─── Route handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 100);

    // Respond immediately — Cloudflare times out at 100s but the actual work
    // takes several minutes. EC2 (non-serverless) keeps the process alive.
    runRefresh(limit).catch(e =>
        console.error('[refresh-hotel-content] Background run failed:', e.message)
    );

    return NextResponse.json({ ok: true, message: `Hotel content refresh started (limit=${limit})` });
}
