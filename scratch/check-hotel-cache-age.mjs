/**
 * Read-only: how old are the hotel search results being served from hotel_search_cache?
 *
 * runTgxSearch serves a row as FRESH until expires_at, then as STALE for another full TTL
 * (getHotelSearchCache: `expires_at > now() - ttl`) while it refreshes in the background.
 * So the first search after expiry shows prices up to 2×TTL old, and the next search the
 * refreshed ones. This prints what the cache holds right now, by state and age.
 *
 *   node scratch/check-hotel-cache-age.mjs           # live (RDS_DATABASE_URL)
 *   node scratch/check-hotel-cache-age.mjs --local   # local (DATABASE_URL)
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (name) => env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const local = process.argv.includes('--local');
const url = local ? read('DATABASE_URL') : read('RDS_DATABASE_URL');
const host = url.match(/@([^/:?]+)/)?.[1];
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE ** (read-only)'}\n`);

const sql = postgres(url, { ssl: isLocal ? false : { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const cols = (await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hotel_search_cache'`).map(r => r.column_name);
console.log(`columns: ${cols.join(', ')}\n`);

// TTL per row isn't stored; created_at → expires_at is it.
const rows = await sql`
    SELECT cache_key,
           created_at,
           expires_at,
           EXTRACT(EPOCH FROM (expires_at - created_at)) / 60   AS ttl_min,
           EXTRACT(EPOCH FROM (now() - created_at)) / 60        AS age_min,
           CASE
             WHEN expires_at > now() THEN 'fresh'
             WHEN expires_at > now() - (expires_at - created_at) THEN 'stale-served'
             ELSE 'dead'
           END AS state,
           jsonb_typeof(result->'data') AS data_type,
           CASE WHEN jsonb_typeof(result->'data') = 'array'
                THEN jsonb_array_length(result->'data') END AS hotels
      FROM hotel_search_cache
     ORDER BY created_at DESC
`;

const byState = {};
for (const r of rows) byState[r.state] = (byState[r.state] ?? 0) + 1;
console.log(`rows: ${rows.length}`, byState);

const servable = rows.filter(r => r.state !== 'dead');
if (servable.length) {
    const ages = servable.map(r => Number(r.age_min)).sort((a, b) => a - b);
    const pct = (p) => ages[Math.min(ages.length - 1, Math.floor(p * ages.length))];
    console.log(`servable ages (min): median ${pct(0.5).toFixed(0)}, p90 ${pct(0.9).toFixed(0)}, max ${ages[ages.length - 1].toFixed(0)}`);
}

console.log('\nmost recent 15 servable rows:');
for (const r of servable.slice(0, 15)) {
    console.log(
        `  ${r.state.padEnd(12)} age ${String(Math.round(r.age_min)).padStart(4)}m / ttl ${String(Math.round(r.ttl_min)).padStart(3)}m  ` +
        `${r.data_type === 'array' ? `${r.hotels} hotels` : 'hotel'}  ${r.cache_key}`,
    );
}
await sql.end();
