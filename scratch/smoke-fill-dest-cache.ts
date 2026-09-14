/**
 * LOCAL smoke of the fixed /api/cron/fill-dest-cache handler and the startup column check.
 *
 * Calls the route's GET directly with the real CRON_SECRET from .env against the LOCAL
 * database. min_hotels is set impossibly high so the query runs end to end but selects no
 * cities — nothing is sent to TravelgateX.
 *
 *   npx tsx scratch/smoke-fill-dest-cache.ts
 */
import fs from 'fs';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing: DATABASE_URL is not local.');

const { NextRequest } = await import('next/server');
const { GET } = await import('../src/app/api/cron/fill-dest-cache/route');
const { getSqlAdmin } = await import('../src/lib/db/postgres');

// Wakes ensureTablesOnce — the new column check logs "[db] startup tables OK" when it passes.
await getSqlAdmin()`SELECT 1`;
await new Promise(r => setTimeout(r, 3000));

const unauthorized = await GET(new NextRequest('http://localhost/api/cron/fill-dest-cache'));
console.log(`no secret → ${unauthorized.status}`);

const t0 = Date.now();
const res = await GET(new NextRequest('http://localhost/api/cron/fill-dest-cache?limit=500&min_hotels=100000000', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
}));
console.log(`with secret → ${res.status} in ${Date.now() - t0}ms: ${JSON.stringify(await res.json())}`);

// The real query shape at real thresholds, for timing only — read, never acted on.
const sql = getSqlAdmin();
const t1 = Date.now();
const [{ n }] = await sql`
    WITH cities AS (
        SELECT lower(city) AS city, lower(country) AS cc FROM hotel_content
         WHERE city IS NOT NULL AND city <> '' AND country IS NOT NULL AND country <> ''
         GROUP BY 1, 2 HAVING count(*) >= 5)
    SELECT count(*)::int AS n FROM cities c
     WHERE NOT EXISTS (SELECT 1 FROM tgx_destination_cache d WHERE d.city_key = c.city || ':' || c.cc)`;
console.log(`local uncached cities with 5+ hotels: ${n} (${Date.now() - t1}ms)`);
await sql.end();
process.exit(0);
