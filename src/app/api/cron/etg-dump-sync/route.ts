/**
 * GET /api/cron/etg-dump-sync
 *
 * Streams the ETG hotel content dump and upserts room_groups + ratehawk_hid
 * into hotel_content for every hotel whose numeric hid matches a row we have.
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

interface BatchRow { hid: string; slug: string; roomGroupsJson: string }
interface Stats { linesRead: number; matched: number; withGroups: number; written: number; skipped: number; errors: number }

async function flushBatch(sql: ReturnType<typeof getSqlAdmin>, batch: BatchRow[], stats: Stats) {
    if (!batch.length) return;
    try {
        await sql`
            UPDATE hotel_content AS hc
            SET room_groups           = d.rg::jsonb,
                ratehawk_hid          = COALESCE(hc.ratehawk_hid, d.slug),
                room_groups_seeded_at = NOW()
            FROM unnest(
                ${sql.array(batch.map(r => r.hid))}::text[],
                ${sql.array(batch.map(r => r.slug))}::text[],
                ${sql.array(batch.map(r => r.roomGroupsJson))}::text[]
            ) AS d(hotel_id, slug, rg)
            WHERE hc.hotel_id = d.hotel_id
        `;
        stats.written += batch.length;
    } catch (e: any) {
        for (const r of batch) {
            try {
                await sql`
                    UPDATE hotel_content
                    SET room_groups           = ${r.roomGroupsJson}::jsonb,
                        ratehawk_hid          = COALESCE(ratehawk_hid, ${r.slug}),
                        room_groups_seeded_at = NOW()
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
                batch.push({ hid, slug, roomGroupsJson: JSON.stringify(groups) });
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
