/**
 * LIVE: cancel the stuck fill-dest-cache SELECTs (and a waiting count(*) left by a diagnostic
 * script), so the ALTER queued behind them can finish and reads of tgx_destination_cache unblock.
 *
 * pg_cancel_backend only — cancels the running statement; it does not terminate sessions, and
 * these are read-only SELECTs whose HTTP requests died hours ago. The ALTER is not touched.
 *
 *   node scratch/cancel-stuck-fill-dest-cache.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const targets = await sql`
    SELECT pid, now() - query_start AS age, left(regexp_replace(query, '\\s+', ' ', 'g'), 90) AS query
      FROM pg_stat_activity
     WHERE datname = current_database()
       AND pid <> pg_backend_pid()
       AND state = 'active'
       AND (
            (query LIKE '%SELECT lower(hc.city) AS city, upper(hc.country) AS country, count(*) AS cnt%'
             AND query LIKE '%NOT IN (SELECT city_key FROM tgx_destination_cache)%'
             AND now() - query_start > interval '10 minutes')
         OR query LIKE 'SELECT count(*)::int AS dc FROM tgx_destination_cache%'
       )
`;

console.log(`cancelling ${targets.length} backend(s):`);
for (const t of targets) {
    const [{ ok }] = await sql`SELECT pg_cancel_backend(${t.pid}) AS ok`;
    console.log(`  pid ${t.pid}  ${String(t.age).padEnd(18)} ${ok ? 'cancelled' : 'NOT cancelled'}  ${t.query}`);
}
await sql.end();
