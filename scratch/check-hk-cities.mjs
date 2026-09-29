/** BG-8: city names on CN-coded hotels in and around Hong Kong, on live. Read-only. */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });
await sql`SET statement_timeout = '20s'`;
// Box spanning HK and the Shenzhen side of the border, with a latitude split per city.
const rows = await sql`
    SELECT city, count(*)::int AS n,
           round(min(lat)::numeric, 3) AS min_lat, round(max(lat)::numeric, 3) AS max_lat
    FROM hotel_content
    WHERE country = 'CN' AND lat BETWEEN 22.15 AND 22.60 AND lng BETWEEN 113.83 AND 114.44 AND lat != 0
    GROUP BY city ORDER BY n DESC LIMIT 40`;
for (const r of rows) console.log(`${String(r.n).padStart(5)}  ${r.city}  lat ${r.min_lat}–${r.max_lat}`);
await sql.end();
