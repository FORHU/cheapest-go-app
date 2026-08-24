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

export interface RoomGroupEntry {
    name: string;
    images: string[];
    amenities: string[];
    /** Stable ETG integer id for this room group within the hotel. */
    roomGroupId?: number;
    /** Human-readable bedding type from ETG name_struct.bedding_type, e.g. "twin beds", "double bed". */
    beddingType?: string;
    /** Structured attribute codes from rg_ext — used for structured matching before fuzzy name fallback. */
    rgExt?: { bedding: number; capacity: number; quality: number; view: number; balcony: number };
}

export function parseRoomGroups(rawGroups: any[]): RoomGroupEntry[] {
    return (rawGroups ?? [])
        .map((rg: any) => {
            const entry: RoomGroupEntry = {
                name: rg.name ?? '',
                images: (rg.images ?? [])
                    .map((img: any) => resolveImageUrl(typeof img === 'string' ? img : (img?.url ?? img?.src)))
                    .filter((u: string | null): u is string => u !== null)
                    .slice(0, 10),
                amenities: Array.isArray(rg.room_amenities)
                    ? rg.room_amenities.map((s: string) => etgRoomAmenityToLabel(s)).filter(Boolean)
                    : [],
            };
            if (rg.room_group_id) entry.roomGroupId = rg.room_group_id;
            const bedding = rg.name_struct?.bedding_type;
            if (bedding) entry.beddingType = bedding;
            if (rg.rg_ext) entry.rgExt = {
                bedding:  rg.rg_ext.bedding  ?? 0,
                capacity: rg.rg_ext.capacity ?? 0,
                quality:  rg.rg_ext.quality  ?? 0,
                view:     rg.rg_ext.view     ?? 0,
                balcony:  rg.rg_ext.balcony  ?? 0,
            };
            return entry;
        })
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
