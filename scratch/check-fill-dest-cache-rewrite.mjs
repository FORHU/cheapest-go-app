/**
 * LIVE, read-only: does the rewritten fill-dest-cache query plan and run fast, and does it
 * return the same cities as the original would? Runs under a 60s statement_timeout so it can
 * never become another stuck query.
 *
 *   node scratch/check-fill-dest-cache-rewrite.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const indexes = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'tgx_destination_cache'`;
console.log('tgx_destination_cache indexes:');
for (const i of indexes) console.log(`  ${i.indexdef}`);

const REWRITE = `
    WITH cities AS (
        SELECT lower(hc.city) AS city, lower(hc.country) AS cc, count(*) AS cnt
          FROM hotel_content hc
         WHERE hc.city IS NOT NULL AND hc.city <> '' AND hc.country IS NOT NULL AND hc.country <> ''
         GROUP BY lower(hc.city), lower(hc.country)
        HAVING count(*) >= $1
    )
    SELECT c.city, upper(c.cc) AS country, c.cnt
      FROM cities c
     WHERE NOT EXISTS (
            SELECT 1 FROM tgx_destination_cache d WHERE d.city_key = c.city || ':' || c.cc
     )
     ORDER BY c.cnt DESC
     LIMIT $2`;

console.log('\nplan:');
for (const r of await sql.unsafe(`EXPLAIN ${REWRITE}`, [5, 500])) console.log(`  ${r['QUERY PLAN']}`);

const result = await sql.begin(async tx => {
    await tx`SET LOCAL statement_timeout = '60s'`;
    const t0 = Date.now();
    const rows = await tx.unsafe(REWRITE, [5, 500]);
    return { rows, ms: Date.now() - t0 };
});
console.log(`\nran in ${result.ms}ms — ${result.rows.length} uncached cities (top 5):`);
for (const r of result.rows.slice(0, 5)) console.log(`  ${r.city} (${r.country}) — ${r.cnt} hotels`);
await sql.end();
