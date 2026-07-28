/**
 * GET /api/cron/refresh-hotel-content
 *
 * Daily cron — satisfies RateHawk API Addendum §10(c): "Update the static
 * information once a day."
 *
 * Strategy:
 *   1. Pull the top 50 most-searched cities from hotel_search_stats.
 *   2. For each city, find hotel_content rows older than 20 hours.
 *   3. Re-fetch from ETG hotel/info and upsert metapolicy + static fields.
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';

function etgHeaders(): HeadersInit {
    const keyId  = process.env.ETG_KEY_ID!;
    const apiKey = process.env.ETG_API_KEY!;
    const token  = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    return { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' };
}

async function fetchHotelInfo(id: string): Promise<any | null> {
    try {
        const res = await fetch(`${ETG_BASE}/hotel/info/`, {
            method: 'POST',
            headers: etgHeaders(),
            body: JSON.stringify({ id, language: 'en' }),
            signal: AbortSignal.timeout(6_000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data ?? null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const authHeader  = req.headers.get('authorization');
    const cronSecret  = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const t0  = Date.now();

    // Top 50 most-searched cities
    const cities = await sql<{ city_key: string }[]>`
        SELECT city_key FROM hotel_search_stats
        ORDER BY search_count DESC
        LIMIT 50
    `;

    if (cities.length === 0) {
        return NextResponse.json({ ok: true, message: 'No cities in hotel_search_stats yet', updated: 0 });
    }

    const cityKeys = cities.map(r => r.city_key);

    // Hotels in those cities that haven't been refreshed in the last 20 hours
    const stale = await sql<{ hotel_id: string }[]>`
        SELECT hotel_id FROM hotel_content
        WHERE city ILIKE ANY(${sql.array(cityKeys.map(c => `%${c}%`))})
          AND (fetched_at IS NULL OR fetched_at < now() - interval '20 hours')
        LIMIT 500
    `;

    console.log(`[refresh-hotel-content] ${stale.length} stale hotels across ${cityKeys.length} cities`);

    let updated = 0;
    const BATCH = 10;

    for (let i = 0; i < stale.length; i += BATCH) {
        const batch = stale.slice(i, i + BATCH);
        const infos = await Promise.allSettled(batch.map(r => fetchHotelInfo(r.hotel_id)));

        for (let j = 0; j < batch.length; j++) {
            const r = infos[j];
            if (r.status !== 'fulfilled' || !r.value) continue;
            const info = r.value;

            const images: string[] = (info.images ?? [])
                .map((url: string) => (typeof url === 'string' ? url.replace('{size}', '640x400') : ''))
                .filter(Boolean)
                .slice(0, 10);

            const metapolicyStruct    = info.metapolicy_struct     ?? null;
            const metapolicyExtraInfo = info.metapolicy_extra_info ?? null;

            try {
                await sql`
                    INSERT INTO hotel_content
                        (hotel_id, name, images, lat, lng, address, city, country,
                         description, star_rating, amenities, content_source, fetched_at,
                         check_in_time, check_out_time, metapolicy_struct, metapolicy_extra_info)
                    VALUES (
                        ${info.id}, ${info.name ?? null}, ${sql.array(images)},
                        ${info.latitude ?? 0}, ${info.longitude ?? 0},
                        ${info.address ?? null},
                        ${info.region?.name ?? null},
                        ${info.region?.country_code ?? null},
                        ${info.description ?? null}, ${info.star_rating ?? 0}, ${'[]'}::jsonb,
                        'etg', now(),
                        ${info.check_in_time ?? null}, ${info.check_out_time ?? null},
                        ${metapolicyStruct ? sql.json(metapolicyStruct) : null},
                        ${metapolicyExtraInfo}
                    )
                    ON CONFLICT (hotel_id) DO UPDATE SET
                        name                  = COALESCE(EXCLUDED.name, hotel_content.name),
                        images                = CASE WHEN array_length(EXCLUDED.images, 1) > 0
                                               THEN EXCLUDED.images ELSE hotel_content.images END,
                        lat                   = CASE WHEN EXCLUDED.lat != 0 THEN EXCLUDED.lat ELSE hotel_content.lat END,
                        lng                   = CASE WHEN EXCLUDED.lng != 0 THEN EXCLUDED.lng ELSE hotel_content.lng END,
                        address               = COALESCE(EXCLUDED.address, hotel_content.address),
                        description           = COALESCE(EXCLUDED.description, hotel_content.description),
                        star_rating           = CASE WHEN EXCLUDED.star_rating != 0 THEN EXCLUDED.star_rating ELSE hotel_content.star_rating END,
                        check_in_time         = COALESCE(EXCLUDED.check_in_time, hotel_content.check_in_time),
                        check_out_time        = COALESCE(EXCLUDED.check_out_time, hotel_content.check_out_time),
                        metapolicy_struct     = COALESCE(EXCLUDED.metapolicy_struct, hotel_content.metapolicy_struct),
                        metapolicy_extra_info = COALESCE(EXCLUDED.metapolicy_extra_info, hotel_content.metapolicy_extra_info),
                        fetched_at            = now()
                `;
                updated++;
            } catch { /* skip individual failures */ }
        }

        // Respect ETG rate limits
        if (i + BATCH < stale.length) await new Promise(r => setTimeout(r, 1_000));
    }

    const elapsed = Date.now() - t0;
    console.log(`[refresh-hotel-content] Done: ${updated}/${stale.length} updated in ${elapsed}ms`);

    return NextResponse.json({ ok: true, updated, stale: stale.length, cities: cityKeys.length, elapsedMs: elapsed });
}
