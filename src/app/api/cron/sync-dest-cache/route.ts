/**
 * GET /api/cron/sync-dest-cache
 *
 * Fetches the complete TGX destination list for our access code and populates
 * tgx_destination_cache so city-name → dest-code resolution never needs to hit
 * destinationSearcher at search time.
 *
 * Background: TGX support confirmed that hotelX.destinations is the correct
 * bulk endpoint for this — paginated (up to 10,000/page), token-based.
 * destinationSearcher is designed for autocomplete, not bulk pre-caching.
 *
 * Run weekly or after major TGX catalog updates.
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';

const DESTINATIONS_QUERY = `
query TgxListDestinations($criteria: HotelXDestinationListInput!, $token: String) {
  hotelX {
    destinations(criteria: $criteria, token: $token) {
      token
      edges {
        node {
          destinationData {
            code
            type
            texts { text language }
            parent
          }
        }
      }
    }
  }
}`;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const cfg = getTgxConfig();
    const t0 = Date.now();

    // city_key (lowercase english name) → {code, type, parent_code}
    // Built in memory so we can apply CITY > ZONE preference before writing to DB.
    const destMap = new Map<string, { code: string; type: string; parent_code: string | null }>();

    let token: string | null = null;
    let page = 0;
    // A stop, not a budget. The 2026-09-09 run ended on exactly 100 pages with TGX still
    // handing back a token, so the catalog was truncated at whatever page 100 happened to
    // reach and the run reported `ok: true` regardless — the one number that would have
    // revealed it, `pages`, sat in the response looking like a statistic. Destinations
    // beyond the cut simply never got a row, which is indistinguishable from TGX not
    // having them.
    //
    // Raised far above what the catalog needs so the loop ends when the token runs out,
    // which is the real terminating condition, and `truncated` is reported below so a run
    // that does hit the ceiling says so instead of being read as complete.
    const MAX_PAGES = 500;

    do {
        page++;
        let result: any;
        try {
            result = await tgxGraphQL(
                DESTINATIONS_QUERY,
                {
                    criteria: { access: cfg.accessCode },
                    ...(token ? { token } : {}),
                },
                60_000,
            );
        } catch (e: any) {
            console.warn(`[sync-dest-cache] Page ${page} failed: ${e.message?.slice(0, 200)}`);
            break;
        }

        const conn = result?.data?.hotelX?.destinations;
        if (!conn) {
            const errMsg = JSON.stringify(result?.errors ?? result).slice(0, 500);
            console.warn('[sync-dest-cache] Unexpected response:', errMsg);
            break;
        }

        const edges: any[] = conn.edges ?? [];
        token = conn.token ?? null;

        for (const edge of edges) {
            const dest = edge?.node?.destinationData;
            if (!dest?.code) continue;
            const englishText = (dest.texts ?? []).find((t: any) => t.language === 'en')?.text;
            if (!englishText) continue;
            const key = englishText.toLowerCase().trim();
            const existing = destMap.get(key);
            // CITY beats ZONE; first-seen wins on same type
            if (!existing || (existing.type !== 'CITY' && dest.type === 'CITY')) {
                destMap.set(key, {
                    code:        dest.code as string,
                    type:        dest.type as string,
                    parent_code: (dest.parent as string | null) ?? null,
                });
            }

            // The same name under its own country, so a name two countries share keeps both.
            //
            // The bare key above holds one row per name worldwide, and "first-seen wins" is
            // decided by TGX's paging order rather than by anything about the place. The
            // United States supplies 4,699 of these names — more than any other country — so
            // it wins most collisions: `paris` resolved to Paris, Texas, `rome` to Rome,
            // Georgia, `bali` to Bali in Crete. The French Paris was in the very same
            // response and was dropped on the floor; 2,282 other French cities were kept.
            //
            // A search that knows its country reads `paris:fr` and gets the real code from
            // TGX's own list. The bare key stays exactly as it was, so an unscoped search is
            // unaffected and no existing row changes meaning.
            const cc = /#([A-Z]{2})$/.exec((dest.parent as string | null) ?? '')?.[1];
            if (cc) {
                const scopedKey = `${key}:${cc.toLowerCase()}`;
                const scopedExisting = destMap.get(scopedKey);
                if (!scopedExisting || (scopedExisting.type !== 'CITY' && dest.type === 'CITY')) {
                    destMap.set(scopedKey, {
                        code:        dest.code as string,
                        type:        dest.type as string,
                        parent_code: (dest.parent as string | null) ?? null,
                    });
                }
            }
        }

        console.log(
            `[sync-dest-cache] Page ${page}: ${edges.length} edges, ` +
            `map size: ${destMap.size}${token ? '' : ' (last page)'}`,
        );
    } while (token && page < MAX_PAGES);

    if (destMap.size === 0) {
        return NextResponse.json({
            ok: false,
            error: 'No destinations returned from TGX — check access code or query schema',
            pages: page,
        }, { status: 502 });
    }

    // Batch upsert — always overwrite so stale/wrong codes get corrected
    const entries = [...destMap.entries()];
    let upserted = 0;
    const BATCH = 500;

    for (let i = 0; i < entries.length; i += BATCH) {
        const rows = entries.slice(i, i + BATCH).map(([city_key, { code, type, parent_code }]) => ({
            city_key,
            destination_code: code,
            dest_type:        type,
            parent_code:      parent_code ?? null,
        }));
        try {
            await sql`
                INSERT INTO tgx_destination_cache ${sql(rows, 'city_key', 'destination_code', 'dest_type', 'parent_code')}
                ON CONFLICT (city_key) DO UPDATE SET
                    destination_code = EXCLUDED.destination_code,
                    dest_type        = EXCLUDED.dest_type,
                    parent_code      = EXCLUDED.parent_code
                WHERE tgx_destination_cache.destination_code != 'NONE'
            `;
            upserted += rows.length;
        } catch (e: any) {
            console.warn(`[sync-dest-cache] Batch ${i}–${i + BATCH} upsert failed: ${e.message?.slice(0, 200)}`);
        }
    }

    const elapsed = Date.now() - t0;
    // TGX still had more to give when the page ceiling stopped us, so this run saw only
    // part of the catalog. Said out loud, because a truncated sync and a complete one are
    // otherwise identical from the outside: both return ok, both upsert thousands of rows,
    // and the destinations that were cut off look exactly like destinations TGX does not
    // carry — a city that resolves to nothing for a reason nobody can see.
    const truncated = Boolean(token) && page >= MAX_PAGES;
    if (truncated) {
        console.warn(
            `[sync-dest-cache] TRUNCATED at the ${MAX_PAGES}-page ceiling with a token still ` +
            `outstanding — the catalog is incomplete and destinations past this point have no row.`,
        );
    }

    console.log(`[sync-dest-cache] Done: ${upserted}/${destMap.size} upserted in ${elapsed}ms`);

    return NextResponse.json({
        ok: true,
        pages: page,
        truncated,
        totalMapped: destMap.size,
        upserted,
        elapsedMs: elapsed,
    });
}
