/**
 * Shared ETG room-group seeding logic.
 * Used by the daily cron AND the on-demand trigger in fetchTgxRoomCatalog.
 */

import { getSqlAdmin } from '@/lib/db/postgres';
import { etgRoomAmenityToLabel } from '@/lib/server/stays/travelgatex/amenityCodes';

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';

function etgToken(): string {
    const keyId  = process.env.RATEHAWK_KEY_ID  ?? process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.RATEHAWK_API_KEY ?? process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

function resolveImageUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    return url.replace(/\{size\}/g, '1024x768');
}

export interface RoomGroupEntry { name: string; images: string[]; amenities: string[] }

export function parseRoomGroups(rawGroups: any[]): RoomGroupEntry[] {
    return (rawGroups ?? [])
        .map((rg: any) => ({
            name: rg.name ?? '',
            images: (rg.images ?? [])
                .map((img: any) => resolveImageUrl(typeof img === 'string' ? img : (img?.url ?? img?.src)))
                .filter((u: string | null): u is string => u !== null)
                .slice(0, 10),
            amenities: Array.isArray(rg.room_amenities)
                ? rg.room_amenities.map((s: string) => etgRoomAmenityToLabel(s)).filter(Boolean)
                : [],
        }))
        .filter((rg: RoomGroupEntry) => rg.name);
}

export async function fetchEtgHotelInfo(hid: string): Promise<any | null> {
    const res = await fetch(`${ETG_BASE}/hotel/info/`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${etgToken()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: hid, language: 'en' }),
        signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`ETG HTTP ${res.status}`);
    const json = await res.json();
    return json?.data ?? null;
}

/**
 * Fetch ETG room groups for one hotel, write to hotel_content.room_groups, and return
 * the parsed groups so the caller can use them immediately on the same request.
 * Returns [] on any error — never throws.
 */
export async function seedHotelRoomGroupsById(hotelId: string): Promise<RoomGroupEntry[]> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql<{ ratehawk_hid: string }[]>`
            SELECT ratehawk_hid FROM hotel_content
            WHERE hotel_id = ${hotelId} AND ratehawk_hid IS NOT NULL AND ratehawk_hid != ''
            LIMIT 1
        `;
        const hid = rows[0]?.ratehawk_hid;
        if (!hid) return [];

        const data = await fetchEtgHotelInfo(hid);
        if (!data) return [];

        const groups = parseRoomGroups(data.room_groups ?? []);
        await sql`
            UPDATE hotel_content
            SET room_groups          = ${JSON.stringify(groups)}::jsonb,
                room_groups_seeded_at = NOW()
            WHERE hotel_id = ${hotelId}
        `;
        const photoCount = groups.filter(g => g.images.length > 0).length;
        console.log(`[etg-rooms] on-demand seed ${hid}: ${groups.length} groups (${photoCount} with photos)`);
        return groups;
    } catch (e: any) {
        console.warn(`[etg-rooms] on-demand seed failed for ${hotelId}:`, e.message?.slice(0, 80));
        return [];
    }
}
