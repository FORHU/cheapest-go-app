/**
 * GET /api/cron/etg-dump-sync
 *
 * Streams the ETG hotel content dump and upserts hotel_content with all static
 * fields: room_groups, check_in/out_time, description, amenity_groups, images,
 * serp_filters, metapolicy_struct, metapolicy_extra_info, ratehawk_hid.
 *
 * ETG dump format: JSONL compressed with Zstandard (.jsonl.zst)
 * Each line: { id: string (slug), hid: number, room_groups: [...], images: [...], ... }
 *
 * Query params:
 *   ?type=full         use /hotel/info/dump/ (default) — full catalog
 *   ?type=incremental  use /hotel/info/incremental_dump/ — changes since last run
 *   ?force=true        overwrite even hotels already seeded
 *   ?dry_run=true      parse + count without writing to DB
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { Decompress } from 'fzstd';
import { getSqlAdmin } from '@/lib/db/postgres';
import { parseRoomGroups } from '@/lib/server/stays/etg/roomGroups';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300;

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';

function etgToken(): string {
    const keyId  = process.env.RATEHAWK_KEY_ID  ?? process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.RATEHAWK_API_KEY ?? process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

async function getDumpUrl(type: 'full' | 'incremental'): Promise<string> {
    const endpoint = type === 'incremental'
        ? `${ETG_BASE}/hotel/info/incremental_dump/`
        : `${ETG_BASE}/hotel/info/dump/`;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Basic ${etgToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'en' }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ETG dump endpoint ${res.status}`);
    const json = await res.json();
    const url: string | undefined = json?.data?.url;
    if (!url) throw new Error(`No dump URL in response: ${JSON.stringify(json).slice(0, 200)}`);
    return url;
}

function resolveImg(u: unknown): string | null {
    return typeof u === 'string' ? u.replace(/\{size\}/g, '1024x768') : null;
}

function parseDescription(descStruct: unknown): string | null {
    if (!Array.isArray(descStruct) || !descStruct.length) return null;
    return (descStruct as any[])
        .map((s: any) => s.paragraphs?.join(' ') ?? '')
        .filter(Boolean)
        .join('\n\n') || null;
}

function parseAmenityGroups(rawGroups: unknown): object[] {
    if (!Array.isArray(rawGroups)) return [];
    return (rawGroups as any[])
        .map((g: any) => ({
            group_name: g.group_name ?? '',
            amenities: Array.isArray(g.amenities) ? g.amenities : [],
            non_free_amenities: Array.isArray(g.non_free_amenities) ? g.non_free_amenities : [],
        }))
        .filter((g: any) => g.group_name);
}

function parseHotelImages(rawImages: unknown): string[] {
    if (!Array.isArray(rawImages)) return [];
    return (rawImages as unknown[]).map(resolveImg).filter((u): u is string => u !== null).slice(0, 20);
}

interface BatchRow { hid: string; slug: string; rg: string; x: string }
interface Stats { linesRead: number; matched: number; withGroups: number; written: number; skipped: number; errors: number }

async function flushBatch(sql: ReturnType<typeof getSqlAdmin>, batch: BatchRow[], stats: Stats) {
    if (!batch.length) return;
    try {
        await sql`
            UPDATE hotel_content AS hc
            SET room_groups           = d.rg::jsonb,
                ratehawk_hid          = COALESCE(hc.ratehawk_hid, d.slug),
                room_groups_seeded_at = NOW(),
                check_in_time         = COALESCE(NULLIF(d.x->>'ci', ''), hc.check_in_time),
                check_out_time        = COALESCE(NULLIF(d.x->>'co', ''), hc.check_out_time),
                description           = COALESCE(NULLIF(d.x->>'desc', ''), hc.description),
                amenity_groups        = CASE WHEN jsonb_array_length(d.x->'ag') > 0 THEN d.x->'ag' ELSE hc.amenity_groups END,
                images                = CASE WHEN jsonb_array_length(d.x->'imgs') > 0
                                             THEN ARRAY(SELECT jsonb_array_elements_text(d.x->'imgs'))
                                             ELSE hc.images END,
                serp_filters          = ARRAY(SELECT jsonb_array_elements_text(d.x->'sf')),
                metapolicy_struct     = CASE WHEN d.x->'mp' IS NOT NULL AND d.x->>'mp' != 'null' THEN d.x->'mp' ELSE hc.metapolicy_struct END,
                metapolicy_extra_info = COALESCE(NULLIF(d.x->>'mpe', ''), hc.metapolicy_extra_info)
            FROM unnest(
                ${sql.array(batch.map(r => r.hid))}::text[],
                ${sql.array(batch.map(r => r.slug))}::text[],
                ${sql.array(batch.map(r => r.rg))}::text[],
                ${sql.array(batch.map(r => r.x))}::jsonb[]
            ) AS d(hotel_id, slug, rg, x)
            WHERE hc.hotel_id = d.hotel_id
        `;
        stats.written += batch.length;
    } catch (e: any) {
        for (const r of batch) {
            try {
                await sql`
                    UPDATE hotel_content
                    SET room_groups           = ${r.rg}::jsonb,
                        ratehawk_hid          = COALESCE(ratehawk_hid, ${r.slug}),
                        room_groups_seeded_at = NOW(),
                        check_in_time         = COALESCE(NULLIF(${r.x}::jsonb->>'ci', ''), check_in_time),
                        check_out_time        = COALESCE(NULLIF(${r.x}::jsonb->>'co', ''), check_out_time),
                        description           = COALESCE(NULLIF(${r.x}::jsonb->>'desc', ''), description),
                        amenity_groups        = CASE WHEN jsonb_array_length(${r.x}::jsonb->'ag') > 0 THEN ${r.x}::jsonb->'ag' ELSE amenity_groups END,
                        images                = CASE WHEN jsonb_array_length(${r.x}::jsonb->'imgs') > 0
                                                     THEN ARRAY(SELECT jsonb_array_elements_text(${r.x}::jsonb->'imgs'))
                                                     ELSE images END,
                        serp_filters          = ARRAY(SELECT jsonb_array_elements_text(${r.x}::jsonb->'sf')),
                        metapolicy_struct     = CASE WHEN ${r.x}::jsonb->'mp' IS NOT NULL AND ${r.x}::jsonb->>'mp' != 'null' THEN ${r.x}::jsonb->'mp' ELSE metapolicy_struct END,
                        metapolicy_extra_info = COALESCE(NULLIF(${r.x}::jsonb->>'mpe', ''), metapolicy_extra_info)
                    WHERE hotel_id = ${r.hid}
                `;
                stats.written++;
            } catch { stats.errors++; }
        }
        console.warn('[etg-dump] Batch fallback:', e?.message?.slice(0, 100));
    }
    batch.length = 0;
}

async function processDump(dumpUrl: string, opts: { force: boolean; dryRun: boolean }): Promise<Stats> {
    const sql   = getSqlAdmin();
    const stats: Stats = { linesRead: 0, matched: 0, withGroups: 0, written: 0, skipped: 0, errors: 0 };

    const existingRows = await sql<{ hotel_id: string }[]>`
        SELECT hotel_id FROM hotel_content WHERE hotel_id ~ '^[0-9]+$'
    `;
    const knownIds = new Set(existingRows.map(r => String(r.hotel_id)));

    let seededIds = new Set<string>();
    if (!opts.force) {
        const seededRows = await sql<{ hotel_id: string }[]>`
            SELECT hotel_id FROM hotel_content
            WHERE room_groups_seeded_at IS NOT NULL AND hotel_id ~ '^[0-9]+$'
        `;
        seededIds = new Set(seededRows.map(r => String(r.hotel_id)));
    }

    console.log(`[etg-dump] ${knownIds.size} known, ${seededIds.size} already seeded`);

    const BATCH = 400;
    const batch: BatchRow[] = [];
    const dec  = new TextDecoder();
    let   tail = '';

    const decompressor = new Decompress((chunk: Uint8Array) => {
        tail += dec.decode(chunk, { stream: true });
    });

    const res = await fetch(dumpUrl, { signal: AbortSignal.timeout(250_000) });
    if (!res.ok || !res.body) throw new Error(`Dump download ${res.status}`);
    const reader = res.body.getReader();
    let done = false;

    while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) decompressor.push(value, done);

        let nl: number;
        while ((nl = tail.indexOf('\n')) !== -1) {
            const line = tail.slice(0, nl).trim();
            tail = tail.slice(nl + 1);
            if (!line) continue;

            stats.linesRead++;
            if (stats.linesRead % 50_000 === 0) {
                console.log(`[etg-dump] ${stats.linesRead} lines | matched=${stats.matched} written=${stats.written}`);
            }

            let hotel: any;
            try { hotel = JSON.parse(line); } catch { stats.errors++; continue; }

            const hid  = String(hotel.hid ?? '');
            const slug = String(hotel.id  ?? '');
            if (!hid || !knownIds.has(hid)) continue;
            stats.matched++;

            if (!opts.force && seededIds.has(hid)) { stats.skipped++; continue; }

            const groups = parseRoomGroups(hotel.room_groups ?? []);
            if (groups.length > 0) stats.withGroups++;

            if (!opts.dryRun) {
                const extra = {
                    ci:   hotel.check_in_time  ?? null,
                    co:   hotel.check_out_time ?? null,
                    desc: parseDescription(hotel.description_struct) ?? hotel.description ?? null,
                    ag:   parseAmenityGroups(hotel.amenity_groups),
                    imgs: parseHotelImages(hotel.images),
                    sf:   Array.isArray(hotel.serp_filters) ? hotel.serp_filters : [],
                    mp:   hotel.metapolicy_struct ?? null,
                    mpe:  hotel.metapolicy_extra_info ?? null,
                };
                batch.push({ hid, slug, rg: JSON.stringify(groups), x: JSON.stringify(extra) });
                if (batch.length >= BATCH) await flushBatch(sql, batch, stats);
            }
        }
    }

    if (!opts.dryRun) await flushBatch(sql, batch, stats);
    return stats;
}

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp     = new URL(req.url).searchParams;
    const type   = sp.get('type') === 'incremental' ? 'incremental' : 'full';
    const force  = sp.get('force')   === 'true';
    const dryRun = sp.get('dry_run') === 'true';

    try {
        console.log(`[etg-dump] Start ${type} (force=${force} dry_run=${dryRun})`);
        const dumpUrl = await getDumpUrl(type);
        const stats   = await processDump(dumpUrl, { force, dryRun });
        console.log(`[etg-dump] Done`, stats);
        return NextResponse.json({ ok: true, type, force, dry_run: dryRun, ...stats });
    } catch (e: any) {
        console.error('[etg-dump] Failed:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
