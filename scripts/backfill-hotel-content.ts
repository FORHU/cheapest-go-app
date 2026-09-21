/**
 * Give photos and descriptions to hotels that arrived with neither.
 *
 * The portfolio sync deliberately asks only for Supplier-Owned Fields, because media and
 * descriptions cost three to four times as much per hotel. That leaves every newly listed
 * hotel on the map as a card with no picture. This fills them in afterwards, asking only about
 * the hotels that have nothing — which is what makes it cheap.
 *
 * Measured 2026-09-21 against access 38327: about 2,380 hotels a minute, and 94% of them had
 * photos to give.
 *
 * The backlog is far larger than it first appears. It is not the 97,737 hotels the 2026-09-20
 * dump introduced: most of the 1.14M rows that predate it have no images either, so the first
 * run faces 1,024,602 hotels and would need around seven hours — past the six-hour ceiling
 * the workflow allows, and past the point where one long job is a sensible thing to run.
 *
 * So a run is bounded, and the backlog is cleared over several nights. At the default limit
 * that is roughly two hours a night and about a week to catch up, after which each night has
 * only that day's new hotels to do and finishes in seconds. Hotels are taken in hotel_id
 * order, so successive runs continue rather than re-tread: a hotel asked about today carries
 * last_attempt_at and drops out of tomorrow's query whether or not it had a photograph.
 *
 * `refresh-hotel-content` remains the richer job: amenities, contact details, check-in
 * schedules, for the thirty most-searched cities. This one is deliberately shallower and
 * covers everywhere, because a hotel nobody has searched yet still has to look like something
 * on a map.
 *
 * Usage:
 *   npx tsx scripts/backfill-hotel-content.ts [--limit N] [--dry-run]
 */

import 'dotenv/config';
import postgres from 'postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

/**
 * Hotels per run, when no limit is given.
 *
 * 250,000 is about 105 minutes at the measured rate, which sits comfortably inside the
 * six-hour workflow ceiling alongside the 42-minute portfolio sync that runs before it.
 */
const DEFAULT_LIMIT = 250_000;

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT   = (() => {
    const i = process.argv.indexOf('--limit');
    if (i >= 0) return Number(process.argv[i + 1]);
    return process.argv.includes('--all') ? Infinity : DEFAULT_LIMIT;
})();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

/** Codes per request. Roughly 8 KB a hotel with media and text, so ~1.6 MB a response. */
const BATCH = 200;

/**
 * How long before a hotel that had nothing is asked again.
 *
 * Three per cent of the portfolio has no photo at TGX at all. Without this they would be
 * re-requested every single night for ever, which is the kind of pointless repeat traffic a
 * supplier notices — and OTV notices.
 */
const RETRY_AFTER = '30 days';

const CONTENT_QUERY = `
query TgxHotelContent($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            code
            medias { url type order }
            descriptions { type texts { language text } }
          }
        }
      }
    }
  }
}`;

const sql = postgres(DATABASE_URL, { max: 2, idle_timeout: 30, connect_timeout: 30 });

function extractImages(medias: any[]): string[] {
    return (medias ?? [])
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        .map(m => m?.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0)
        .slice(0, 10);
}

/** English if TGX has it, otherwise whatever it does have — a description beats a blank. */
function extractDescription(descriptions: any[]): string | null {
    for (const d of descriptions ?? []) {
        const texts = d?.texts ?? [];
        const en = texts.find((t: any) => t?.language?.toLowerCase().startsWith('en'));
        const text = en?.text ?? texts[0]?.text;
        if (typeof text === 'string' && text.trim()) return text.trim();
    }
    return null;
}

async function main() {
    const cfg = getTgxConfig();
    const started = Date.now();

    // Only hotels still on offer: there is no point buying a photograph of a room nobody can
    // book. Delisted rows keep whatever content they already had, for past bookings to show.
    const pending = await sql<{ hotel_id: string }[]>`
        SELECT hotel_id
          FROM hotel_content
         WHERE content_source = 'tgx'
           AND delisted_at IS NULL
           AND coalesce(array_length(images, 1), 0) = 0
           AND (last_attempt_at IS NULL OR last_attempt_at < now() - ${RETRY_AFTER}::interval)
         ORDER BY hotel_id
    `;

    const codes = pending.map(r => r.hotel_id).slice(0, LIMIT === Infinity ? undefined : LIMIT);
    const held  = pending.length - codes.length;
    console.log(`[backfill] ${pending.length.toLocaleString()} hotels have no images; ` +
                `doing ${codes.length.toLocaleString()} this run` +
                `${held > 0 ? `, ${held.toLocaleString()} left for the next one` : ''}` +
                `${DRY_RUN ? ' (dry run — no writes)' : ''}`);
    if (codes.length === 0) { await sql.end(); return; }

    let asked = 0, withMedia = 0, updated = 0;

    for (let i = 0; i < codes.length; i += BATCH) {
        const batch = codes.slice(i, i + BATCH);
        asked += batch.length;

        const res: any = await tgxGraphQL(
            CONTENT_QUERY,
            { criteria: { access: cfg.accessCode, maxSize: BATCH, hotelCodes: batch } },
            120_000,
        ).catch((e: any) => {
            // One bad batch is not worth losing the run over; the rows keep their old
            // last_attempt_at and come round again next time.
            console.warn(`[backfill] batch at ${i} failed: ${String(e?.message).slice(0, 100)}`);
            return null;
        });

        const edges = res?.data?.hotelX?.hotels?.edges ?? [];
        const rows = edges.map((e: any) => {
            const d = e?.node?.hotelData;
            return {
                code:        String(d?.code ?? ''),
                images:      extractImages(d?.medias),
                description: extractDescription(d?.descriptions),
            };
        }).filter((r: any) => r.code);

        withMedia += rows.filter((r: any) => r.images.length > 0).length;

        if (!DRY_RUN && rows.length > 0) {
            // Enrichment only, and only where we have nothing. A hotel that gained images from
            // ETG between the query above and this write keeps them.
            for (const r of rows) {
                const done = await sql`
                    UPDATE hotel_content
                       SET images      = CASE WHEN coalesce(array_length(images, 1), 0) = 0
                                              THEN ${r.images}::text[] ELSE images END,
                           description = COALESCE(description, ${r.description}),
                           fetched_at  = now()
                     WHERE hotel_id = ${r.code}
                `;
                updated += done.count;
            }
        }

        if (!DRY_RUN) {
            // Every hotel we asked about, answered or not, so the 3% with nothing to give are
            // not asked again tomorrow.
            await sql`
                UPDATE hotel_content SET last_attempt_at = now()
                 WHERE hotel_id = ANY(${sql.array(batch)}::text[])
            `;
        }

        if ((i / BATCH) % 25 === 0 || i + BATCH >= codes.length) {
            const mins = ((Date.now() - started) / 60000).toFixed(1);
            console.log(`[backfill] ${asked.toLocaleString()}/${codes.length.toLocaleString()} asked, ` +
                        `${withMedia.toLocaleString()} had photos (${mins} min)`);
        }
    }

    console.log(`[backfill] updated ${updated.toLocaleString()} rows in ` +
                `${((Date.now() - started) / 60000).toFixed(1)} min`);
    await sql.end();
}

main().catch(async (e) => {
    console.error('[backfill] failed:', e?.message ?? e);
    await sql.end().catch(() => {});
    process.exit(1);
});
