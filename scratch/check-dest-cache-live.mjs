/** Read-only: how fresh is the live TGX destination cache? node scratch/check-dest-cache-live.mjs */
import fs from 'fs';
import postgres from 'postgres';
const env = fs.readFileSync('.env', 'utf8');
const read = (k) => env.match(new RegExp(`^\s*${k}\s*=\s*(.*?)\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const url = read('RDS_DATABASE_URL') || read('DATABASE_URL_LIVE');
if (!url) { console.log('no live URL in .env'); process.exit(0); }
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });
try {
    await sql`SET statement_timeout = '30s'`;
    const [row] = await sql`SELECT count(*)::int AS rows,
                                   max(created_at) AS newest,
                                   min(created_at) AS oldest,
                                   count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_week
                            FROM tgx_destination_cache`;
    console.log(row);
} catch (e) { console.log('error:', e.message); }
await sql.end();
