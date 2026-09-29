/**
 * Read-only: why does /api/cron/fill-dest-cache take >100s before it responds?
 * Its only pre-response work is one SELECT. Print table sizes, the planner's plan (EXPLAIN,
 * not ANALYZE — nothing is executed), and work_mem, which decides whether Postgres can hash
 * the NOT IN subquery or must scan it once per row.
 *
 *   node scratch/check-fill-dest-cache-query.mjs           # live (RDS_DATABASE_URL), read-only
 *   node scratch/check-fill-dest-cache-query.mjs --local
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (n) => env.match(new RegExp(`^\\s*${n}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const local = process.argv.includes('--local');
const url = local ? read('DATABASE_URL') : read('RDS_DATABASE_URL');
const host = url.match(/@([^/:?]+)/)?.[1];
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? ' (local)' : ' ** LIVE ** (read-only)'}\n`);

const sql = postgres(url, { ssl: isLocal ? false : { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const [{ hc }] = await sql`SELECT reltuples::bigint AS hc FROM pg_class WHERE relname = 'hotel_content'`;
const [{ dc }] = await sql`SELECT count(*)::int AS dc FROM tgx_destination_cache`;
const [{ work_mem }] = await sql`SHOW work_mem`;
console.log(`hotel_content ≈ ${hc} rows, tgx_destination_cache = ${dc} rows, work_mem = ${work_mem}\n`);

const nullable = await sql`
    SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'tgx_destination_cache' AND column_name = 'city_key'`;
console.log(`city_key nullable: ${nullable[0]?.is_nullable}\n`);

const plan = await sql.unsafe(`
    EXPLAIN
    SELECT lower(hc.city) AS city, upper(hc.country) AS country, count(*) AS cnt
    FROM hotel_content hc
    WHERE hc.city IS NOT NULL AND hc.city != '' AND hc.country IS NOT NULL AND hc.country != ''
      AND lower(hc.city) || ':' || lower(hc.country) NOT IN (SELECT city_key FROM tgx_destination_cache)
    GROUP BY lower(hc.city), upper(hc.country)
    HAVING count(*) >= 5
    ORDER BY count(*) DESC
    LIMIT 500`);
for (const r of plan) console.log(r['QUERY PLAN']);
await sql.end();
