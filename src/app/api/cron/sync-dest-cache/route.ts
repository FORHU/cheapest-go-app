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
import { isRelatedName, selectDestination, type DestinationCandidate } from '@/lib/server/stays/destinationSelection';

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

    // Every destination the supplier lists, kept whole rather than reduced as it arrives.
    //
    // This used to collapse to one row per name on the way in, keeping a CITY over a ZONE and
    // otherwise whichever the supplier paged first. That threw away the siblings that say what
    // a name means: "Jeju" is a city code, "Jeju Island" is the zone above it, and "Jeju City"
    // names that zone as its parent. Reduced on arrival, only the first survives and the
    // hierarchy is gone before anything can read it.
    const all: DestinationCandidate[] = [];

    // Grouped by first word, so resolving a name does not scan the catalog. Relatedness only
    // extends a name rightwards ("jeju" to "jeju island"), so the first word is a sound
    // bucket: anything related to a key shares it.
    const byFirstWord = new Map<string, DestinationCandidate[]>();

    /** The country code in a "Country Name#CC" parent, when the parent takes that form. */
    const countryOf = (parent: string | null): string | null =>
        /#([A-Z]{2})$/.exec(parent ?? "")?.[1] ?? null;

    const firstWord = (name: string): string => name.toLowerCase().trim().split(/\s+/)[0] ?? "";

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
            const englishText = (dest.texts ?? []).find((t: any) => t.language === "en")?.text;
            if (!englishText) continue;

            const candidate: DestinationCandidate = {
                code:       String(dest.code),
                type:       String(dest.type ?? ""),
                name:       englishText,
                parentCode: (dest.parent as string | null) ?? null,
            };
            all.push(candidate);

            const w = firstWord(englishText);
            if (w) {
                const bucket = byFirstWord.get(w);
                if (bucket) bucket.push(candidate); else byFirstWord.set(w, [candidate]);
            }
        }
        console.log(
            `[sync-dest-cache] Page ${page}: ${edges.length} edges, ` +
            `collected: ${all.length}${token ? '' : ' (last page)'}`,
        );
    } while (token && page < MAX_PAGES);

    if (all.length === 0) {
        return NextResponse.json({
            ok: false,
            error: "No destinations returned from TGX — check access code or query schema",
            pages: page,
        }, { status: 502 });
    }

    /**
     * One row per name the catalog offers, each resolved by the rule the live resolver uses
     * (`lib/server/stays/destinationSelection.ts`).
     *
     * The two used to disagree on purpose — this one preferred CITY, the resolver preferred
     * ZONE — and since both write the same row with `ON CONFLICT DO UPDATE`, a destination
     * meant whichever had run last. That is what moved "Jeju" between the island and a
     * fraction of it with nothing changing in the code or the catalog.
     */
    const resolved = new Map<string, DestinationCandidate>();

    const consider = (key: string, pool: DestinationCandidate[]) => {
        if (resolved.has(key)) return;
        const picked = selectDestination(pool, key);
        if (picked) resolved.set(key, picked);
    };

    for (const c of all) {
        const key  = c.name.toLowerCase().trim();
        const pool = (byFirstWord.get(firstWord(c.name)) ?? []).filter((x) => isRelatedName(x.name, key));
        consider(key, pool);

        // The same name under its own country, so a name two countries share keeps both. A
        // search that knows its country reads `paris:fr` and gets the French code; the bare
        // key is left as it was, so an unscoped search is unaffected.
        const cc = countryOf(c.parentCode);
        if (cc) {
            const scoped = pool.filter((x) => countryOf(x.parentCode) === cc);
            consider(key + ":" + cc.toLowerCase(), scoped.length > 0 ? scoped : [c]);
        }
    }

    // Batch upsert
    const entries = [...resolved.entries()];
    let upserted = 0;
    const BATCH = 500;

    for (let i = 0; i < entries.length; i += BATCH) {
        const rows = entries.slice(i, i + BATCH).map(([city_key, c]) => ({
            city_key,
            destination_code: c.code,
            dest_type:        c.type,
            parent_code:      c.parentCode ?? null,
        }));
        try {
            await sql`
                INSERT INTO tgx_destination_cache ${sql(rows, "city_key", "destination_code", "dest_type", "parent_code")}
                ON CONFLICT (city_key) DO UPDATE SET
                    destination_code = EXCLUDED.destination_code,
                    dest_type        = EXCLUDED.dest_type,
                    parent_code      = EXCLUDED.parent_code,
                    source           = 'sync',
                    updated_at       = now()
                -- A fresh NONE Sentinel stands for its seven days; see the resolver.
                WHERE tgx_destination_cache.destination_code != 'NONE'
                -- A code a person put right is final. The Paris repair to 2734 was done by
                -- hand, and a sync that overwrites it silently undoes the fix and leaves no
                -- trace it ever happened. Machines may correct each other; they may not
                -- correct someone who has already looked.
                  AND coalesce(tgx_destination_cache.source, 'sync') <> 'manual'
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

    console.log(`[sync-dest-cache] Done: ${upserted}/${resolved.size} names from ${all.length} destinations in ${elapsed}ms`);

    return NextResponse.json({
        ok: true,
        pages: page,
        truncated,
        totalDestinations: all.length,
        totalMapped: resolved.size,
        upserted,
        elapsedMs: elapsed,
    });
}
