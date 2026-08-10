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
    const MAX_PAGES = 100; // 100 pages × 10,000 = 1M max

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
    console.log(`[sync-dest-cache] Done: ${upserted}/${destMap.size} upserted in ${elapsed}ms`);

    return NextResponse.json({
        ok: true,
        pages: page,
        totalMapped: destMap.size,
        upserted,
        elapsedMs: elapsed,
    });
}
