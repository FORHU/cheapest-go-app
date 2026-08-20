/**
 * GET /api/cron/seed-room-groups
 *
 * Daily cron — fetches room-group photos/amenities from ETG (WorldOTA) for hotels
 * that have a ratehawk_hid mapping and stores them in hotel_content.room_groups.
 *
 * Process order:
 *   1. Hotels never seeded (room_groups = '[]' and ratehawk_hid set)
 *   2. Hotels with stale data (room_groups_seeded_at older than REFRESH_DAYS)
 *
 * Auth: Bearer <CRON_SECRET>
 *
 * Query params:
 *   ?batch=N      max hotels to process this run (default 150, max 500)
 *   ?force=true   re-seed ALL hotels regardless of seeded_at age
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { fetchEtgHotelInfo, parseRoomGroups, seedHotelRoomGroupsById } from '@/lib/server/stays/etg/roomGroups';

export const dynamic = 'force-dynamic';

const DELAY_MS = 1000;
const REFRESH_DAYS = 30;

async function runSeed(batchSize: number, force = false): Promise<{ seeded: number; skipped: number; errors: number }> {
    const sql = getSqlAdmin();
    let seeded = 0, skipped = 0, errors = 0;

    const hotels = await sql<{ hotel_id: string; ratehawk_hid: string }[]>`
        SELECT hotel_id, ratehawk_hid
        FROM hotel_content
        WHERE ratehawk_hid IS NOT NULL AND ratehawk_hid != ''
          ${force ? sql`` : sql`AND (
            room_groups = '[]'::jsonb
            OR room_groups_seeded_at < NOW() - INTERVAL '${sql.unsafe(String(REFRESH_DAYS))} days'
          )`}
        ORDER BY
            (room_groups = '[]'::jsonb) DESC,
            room_groups_seeded_at ASC NULLS FIRST
        LIMIT ${batchSize}
    `;

    console.log(`[seed-room-groups] Processing ${hotels.length} hotels (batch=${batchSize}, force=${force})`);

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (const { hotel_id, ratehawk_hid } of hotels) {
        try {
            const data = await fetchEtgHotelInfo(ratehawk_hid);
            if (!data) { errors++; await delay(DELAY_MS); continue; }

            const groups = parseRoomGroups(data.room_groups ?? []);

            if (!groups.length) {
                await sql`
                    UPDATE hotel_content
                    SET room_groups_seeded_at = NOW()
                    WHERE hotel_id = ${hotel_id}
                `;
                skipped++;
            } else {
                await sql`
                    UPDATE hotel_content
                    SET room_groups          = ${JSON.stringify(groups)}::jsonb,
                        room_groups_seeded_at = NOW()
                    WHERE hotel_id = ${hotel_id}
                `;
                seeded++;
                const photoCount = groups.filter(g => g.images.length > 0).length;
                console.log(`[seed-room-groups] ${ratehawk_hid}: ${groups.length} groups (${photoCount} with photos)`);
            }
        } catch (e: any) {
            errors++;
            console.warn(`[seed-room-groups] ❌ ${ratehawk_hid}: ${e.message?.slice(0, 80)}`);
        }

        await delay(DELAY_MS);
    }

    console.log(`[seed-room-groups] Done — seeded=${seeded} skipped=${skipped} errors=${errors}`);
    return { seeded, skipped, errors };
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const hotelId = url.searchParams.get('hotel');

    // Single-hotel reset+reseed — clears ETG cache, re-fetches ETG, evicts search cache
    if (hotelId) {
        const sql = getSqlAdmin();
        await sql`UPDATE hotel_content SET room_groups = '[]'::jsonb, room_groups_seeded_at = NULL WHERE hotel_id = ${hotelId}`;
        const groups = await seedHotelRoomGroupsById(hotelId);
        // Evict all hotel_search_cache rows for this hotel so the next page load re-runs fetchTgxRoomCatalog
        const evicted = await sql`DELETE FROM hotel_search_cache WHERE cache_key LIKE ${'hotel:' + hotelId + '|%'}`;
        console.log(`[seed-room-groups] Evicted ${evicted.count} search cache rows for hotel ${hotelId}`);
        return NextResponse.json({ ok: true, hotel_id: hotelId, groups: groups.length, photos: groups.filter((g: { images: string[] }) => g.images.length > 0).length, cache_evicted: evicted.count });
    }

    const batchSize = Math.min(parseInt(url.searchParams.get('batch') ?? '150', 10), 500);
    const force = url.searchParams.get('force') === 'true';

    runSeed(batchSize, force).catch(e =>
        console.error('[seed-room-groups] Background run failed:', e.message)
    );

    return NextResponse.json({ ok: true, message: `Room group seed started (batch=${batchSize}, force=${force})` });
}
