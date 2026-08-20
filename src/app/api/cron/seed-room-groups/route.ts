/**
 * GET /api/cron/seed-room-groups
 *
 * Daily cron — fetches room-group photos from ETG (WorldOTA) for hotels
 * that have a ratehawk_hid mapping and stores them in hotel_content.room_groups.
 * These photos are used on the property page to show room-specific images instead
 * of cycling hotel-level photos.
 *
 * Process order:
 *   1. Hotels never seeded (room_groups = '[]' and ratehawk_hid set)
 *   2. Hotels with stale data (room_groups_seeded_at older than REFRESH_DAYS)
 *
 * Auth: Bearer <CRON_SECRET>
 *
 * Query params:
 *   ?batch=N   max hotels to process this run (default 150, max 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';
const DELAY_MS = 1000;       // ~1 req/sec to stay within ETG rate limits
const REFRESH_DAYS = 30;     // re-fetch room groups older than this many days

function etgToken(): string {
    const keyId  = process.env.RATEHAWK_KEY_ID  ?? process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.RATEHAWK_API_KEY ?? process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

function resolveImageUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    return url.replace(/\{size\}/g, '1024x768');
}

async function fetchEtgHotelInfo(hid: string): Promise<any | null> {
    const res = await fetch(`${ETG_BASE}/hotel/info/`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${etgToken()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: hid, language: 'en' }),
        signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
        const status = res.status;
        throw new Error(`HTTP ${status}`);
    }
    const json = await res.json();
    return json?.data ?? null;
}

interface RoomGroupEntry { name: string; images: string[] }

function parseRoomGroups(rawGroups: any[]): RoomGroupEntry[] {
    return (rawGroups ?? [])
        .map((rg: any) => ({
            name: rg.name ?? '',
            images: (rg.images ?? [])
                .map((img: any) => resolveImageUrl(typeof img === 'string' ? img : (img?.url ?? img?.src)))
                .filter((u: string | null): u is string => u !== null)
                .slice(0, 10),
        }))
        .filter((rg: RoomGroupEntry) => rg.name);
}

async function runSeed(batchSize: number): Promise<{ seeded: number; skipped: number; errors: number }> {
    const sql = getSqlAdmin();
    let seeded = 0, skipped = 0, errors = 0;

    // Priority 1: never seeded (room_groups is still the default [])
    // Priority 2: stale seeds older than REFRESH_DAYS
    const hotels = await sql<{ hotel_id: string; ratehawk_hid: string }[]>`
        SELECT hotel_id, ratehawk_hid
        FROM hotel_content
        WHERE ratehawk_hid IS NOT NULL AND ratehawk_hid != ''
          AND (
            room_groups = '[]'::jsonb
            OR room_groups_seeded_at < NOW() - INTERVAL '${sql.unsafe(String(REFRESH_DAYS))} days'
          )
        ORDER BY
            (room_groups = '[]'::jsonb) DESC,  -- unseen first
            room_groups_seeded_at ASC NULLS FIRST
        LIMIT ${batchSize}
    `;

    console.log(`[seed-room-groups] Processing ${hotels.length} hotels (batch=${batchSize})`);

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (const { hotel_id, ratehawk_hid } of hotels) {
        try {
            const data = await fetchEtgHotelInfo(ratehawk_hid);
            if (!data) { errors++; await delay(DELAY_MS); continue; }

            const groups = parseRoomGroups(data.room_groups ?? []);
            const hasPhotos = groups.some(g => g.images.length > 0);

            if (!hasPhotos) {
                // Mark as attempted so it isn't retried until REFRESH_DAYS pass
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
                console.log(`[seed-room-groups] ${ratehawk_hid}: ${groups.length} groups seeded`);
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
    const batchSize = Math.min(parseInt(url.searchParams.get('batch') ?? '150', 10), 500);

    // Respond immediately — work runs in background (process stays alive on EC2)
    runSeed(batchSize).catch(e =>
        console.error('[seed-room-groups] Background run failed:', e.message)
    );

    return NextResponse.json({ ok: true, message: `Room group seed started (batch=${batchSize})` });
}
