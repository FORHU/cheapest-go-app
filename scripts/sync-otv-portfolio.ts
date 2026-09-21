/**
 * Bring `hotel_content` into line with the OTV portfolio, from the TravelGateX Hotels API.
 *
 * Replaces the weekly ritual of a person downloading a 187 MB CSV from the TGX dashboard and
 * running an importer against each database in turn. Measured 2026-09-21 against access 38327:
 * 500 hotels a page, 2.24 ms a hotel, so the whole 1.24M portfolio lands in about 46 minutes —
 * comfortably inside the 6-hour budget the ETG dump workflow already uses.
 *
 * Three things happen, in this order:
 *
 *   1. every hotel OTV lists is inserted if new, and refreshed if known
 *   2. coordinates degraded by Nominatim are repaired from the supplier
 *   3. hotels OTV no longer lists are marked, and any that reappeared are unmarked
 *
 * What it will not do is overwrite Enrichment. Images, descriptions, amenities, review scores,
 * room groups and policies are collected from other sources over time and no supplier refresh
 * may destroy them; the update list below is an allowlist of Supplier-Owned Fields, not
 * "everything in the response". See CONTEXT.md for both terms.
 *
 * Usage:
 *   npx tsx scripts/sync-otv-portfolio.ts [--dry-run] [--max-pages N]
 *
 * Reads DATABASE_URL, so it updates whichever database the environment points at: RDS on the
 * live container, localhost:5433 in development. There is deliberately no flag for choosing —
 * a script that can be pointed at production by a typo eventually is.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';
import { parsePortfolioPage, type PortfolioHotel } from '@/lib/server/stays/travelgatex/portfolio';

const DRY_RUN   = process.argv.includes('--dry-run');
const MAX_PAGES = (() => {
    const i = process.argv.indexOf('--max-pages');
    return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

/** The API caps a page here regardless of what is asked for. */
const PAGE_SIZE = 500;

/** Only the Supplier-Owned Fields. Asking for media or descriptions costs 3-4x per hotel. */
const PORTFOLIO_QUERY = `
query TgxPortfolio($criteria: HotelXHotelListInput!, $token: String) {
  hotelX {
    hotels(criteria: $criteria, token: $token) {
      token
      edges {
        node {
          hotelData {
            code hotelName categoryCode
            location { coordinates { latitude longitude } address city country }
            giataData { id }
          }
        }
      }
    }
  }
}`;

const sql = postgres(DATABASE_URL, { max: 2, idle_timeout: 30, connect_timeout: 30 });

/**
 * One page of hotels, written to `hotel_content` and recorded as seen.
 *
 * Every supplier value passes through COALESCE, so a thin response leaves what we already hold
 * intact. A supplier's null is an absence of news, not news of an absence — and a portfolio
 * pull that returned an empty city for every hotel would otherwise hollow out the catalogue in
 * one run, silently and irreversibly.
 */
async function writePage(hotels: PortfolioHotel[]) {
    const codes = hotels.map(h => h.code);

    await sql`
        INSERT INTO otv_portfolio_seen (hotel_id)
        SELECT unnest(${sql.array(codes)}::text[])
        ON CONFLICT DO NOTHING
    `;

    await sql`
        INSERT INTO hotel_content
            (hotel_id, name, country, city, address, lat, lng, star_rating,
             giata_id, images, amenities, content_source, fetched_at)
        SELECT
            u.hotel_id,
            NULLIF(u.name, ''), NULLIF(u.country, ''), NULLIF(u.city, ''), NULLIF(u.address, ''),
            COALESCE(u.lat::float8, 0), COALESCE(u.lng::float8, 0), u.stars::int,
            NULLIF(u.giata, ''), ARRAY[]::text[], '[]'::jsonb, 'tgx', now()
        FROM unnest(
            ${sql.array(codes)}::text[],
            ${sql.array(hotels.map(h => h.name    ?? ''))}::text[],
            ${sql.array(hotels.map(h => h.country ?? ''))}::text[],
            ${sql.array(hotels.map(h => h.city    ?? ''))}::text[],
            ${sql.array(hotels.map(h => h.address ?? ''))}::text[],
            ${sql.array(hotels.map(h => (h.lat === null ? null : String(h.lat))))}::float8[],
            ${sql.array(hotels.map(h => (h.lng === null ? null : String(h.lng))))}::float8[],
            ${sql.array(hotels.map(h => String(h.stars)))}::text[],
            ${sql.array(hotels.map(h => h.giata ?? ''))}::text[]
        ) AS u(hotel_id, name, country, city, address, lat, lng, stars, giata)
        ON CONFLICT (hotel_id) DO UPDATE SET
            name        = COALESCE(EXCLUDED.name,    hotel_content.name),
            country     = COALESCE(EXCLUDED.country, hotel_content.country),
            city        = COALESCE(EXCLUDED.city,    hotel_content.city),
            address     = COALESCE(EXCLUDED.address, hotel_content.address),
            giata_id    = COALESCE(EXCLUDED.giata_id, hotel_content.giata_id),
            -- A category of 0 is "unrated", which is a gap in OTV's data rather than a claim
            -- that a five-star hotel has lost its stars.
            star_rating = CASE WHEN EXCLUDED.star_rating > 0
                               THEN EXCLUDED.star_rating ELSE hotel_content.star_rating END,

            -- ADR-0024's unfinished repair. 239,764 rows carry Nominatim coordinates written
            -- over the supplier's, with no original kept, and measured twice as likely to sit
            -- on a shared centroid as the rows left alone. osm_geocoded_at is what identifies
            -- them, and the supplier's own coordinate is what fixes them. Rows the geocoder
            -- never touched keep theirs: ETG is authoritative for the hotels ETG supplies.
            lat = CASE
                    WHEN EXCLUDED.lat = 0 THEN hotel_content.lat
                    WHEN hotel_content.osm_geocoded_at IS NOT NULL OR hotel_content.lat = 0
                        THEN EXCLUDED.lat
                    ELSE hotel_content.lat
                  END,
            lng = CASE
                    WHEN EXCLUDED.lng = 0 THEN hotel_content.lng
                    WHEN hotel_content.osm_geocoded_at IS NOT NULL OR hotel_content.lng = 0
                        THEN EXCLUDED.lng
                    ELSE hotel_content.lng
                  END,
            -- Repaired rows are no longer geocoded rows, and must not be repaired again.
            osm_geocoded_at = CASE
                    WHEN hotel_content.osm_geocoded_at IS NOT NULL
                         AND EXCLUDED.lat <> 0 AND EXCLUDED.lng <> 0
                    THEN NULL ELSE hotel_content.osm_geocoded_at
                  END,

            -- Listed again, so no longer delisted. A seasonal absence needs no intervention.
            delisted_at = NULL
    `;
}

async function main() {
    const cfg = getTgxConfig();
    const started = Date.now();
    console.log(`[otv-sync] access ${cfg.accessCode}${DRY_RUN ? ' (dry run — no writes)' : ''}`);

    const [{ count: before }] = await sql`SELECT count(*)::int AS count FROM hotel_content`;
    console.log(`[otv-sync] hotel_content holds ${Number(before).toLocaleString()} rows`);

    // Unlogged and rebuilt each run: it is scratch space for one sync, worth nothing after it,
    // and not worth writing to the WAL on the way. Staged in the database rather than a Set in
    // this process so memory stays flat whether the portfolio holds one million or ten.
    if (!DRY_RUN) {
        await sql`CREATE UNLOGGED TABLE IF NOT EXISTS otv_portfolio_seen (hotel_id TEXT PRIMARY KEY)`;
        await sql`TRUNCATE otv_portfolio_seen`;
    }

    let token: string | null = null;
    let page = 0, seen = 0;
    let complete = false;

    while (page < MAX_PAGES) {
        page++;
        const res: any = await tgxGraphQL(
            PORTFOLIO_QUERY,
            { criteria: { access: cfg.accessCode, maxSize: PAGE_SIZE }, ...(token ? { token } : {}) },
            180_000,
        );

        const list  = res?.data?.hotelX?.hotels;
        const edges = list?.edges ?? [];
        const hotels = parsePortfolioPage(edges);
        seen += hotels.length;

        if (hotels.length > 0 && !DRY_RUN) await writePage(hotels);

        token = list?.token ?? null;
        if (page % 50 === 0 || !token) {
            const mins = ((Date.now() - started) / 60000).toFixed(1);
            console.log(`[otv-sync] page ${page}: ${seen.toLocaleString()} hotels seen (${mins} min)`);
        }
        // No token means the supplier has shown us the whole portfolio. That, and only that,
        // earns the right to say a hotel is missing from it.
        if (!token) { complete = true; break; }
    }

    if (DRY_RUN) {
        console.log(`[otv-sync] dry run: ${seen.toLocaleString()} hotels across ${page} pages, nothing written`);
        await sql.end();
        return;
    }

    const [{ count: after }] = await sql`SELECT count(*)::int AS count FROM hotel_content`;
    console.log(`[otv-sync] ${Number(after) - Number(before)} new, ${seen.toLocaleString()} seen`);

    if (!complete) {
        // The guard that matters. A pull that stopped early has not seen the rest of the
        // portfolio, and letting it mark the unseen as absent would delist most of the
        // catalogue on one network blip. Everything written above still stands.
        console.warn(`[otv-sync] stopped after ${page} pages without reaching the end — ` +
                     `skipping delisting, since an incomplete pull cannot tell absent from unseen`);
        await sql.end();
        process.exitCode = 1;
        return;
    }

    // Only OTV's own hotels. An OTV pull is evidence about OTV's inventory and nothing else,
    // and ETG supplies hotels OTV never carried.
    const delisted = await sql`
        UPDATE hotel_content h
           SET delisted_at = now()
         WHERE h.content_source = 'tgx'
           AND h.delisted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM otv_portfolio_seen s WHERE s.hotel_id = h.hotel_id)
    `;

    console.log(`[otv-sync] delisted ${delisted.count} hotels no longer in the portfolio`);
    console.log(`[otv-sync] done in ${((Date.now() - started) / 60000).toFixed(1)} min`);

    await sql.end();
}

main().catch(async (e) => {
    console.error('[otv-sync] failed:', e?.message ?? e);
    await sql.end().catch(() => {});
    process.exit(1);
});
