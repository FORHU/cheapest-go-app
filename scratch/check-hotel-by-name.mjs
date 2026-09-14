/** Look a hotel up by name in LOCAL hotel_content. Read-only.  NAME='Liancheng Hotel' node scratch/check-hotel-by-name.mjs */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const sql = postgres(env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, ''), { ssl: false, max: 1 });
const rows = await sql`SELECT hotel_id, name, city, country, lat, lng, address FROM hotel_content WHERE name ILIKE ${'%' + (process.env.NAME ?? '') + '%'} LIMIT 5`;
console.log(rows);
await sql.end();
