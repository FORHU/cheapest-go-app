/**
 * BG-8: which country code do Hong Kong / Macau hotels carry, locally and on live, and what
 * does Mapbox say Hong Kong is? Read-only.
 *   node scratch/check-hk-country.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');

for (const [label, url, ssl] of [['local', read('DATABASE_URL'), false], ['live', read('RDS_DATABASE_URL'), { rejectUnauthorized: false }]]) {
    const sql = postgres(url, { ssl, max: 1, connect_timeout: 25 });
    try {
        await sql`SET statement_timeout = '20s'`;
        const byCity = await sql`
            SELECT city, country, count(*)::int AS n FROM hotel_content
            WHERE city ILIKE ANY (ARRAY['hong kong%', 'kowloon%', 'macau%', 'macao%', 'shenzhen%'])
            GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12`;
        const inHkBox = await sql`
            SELECT country, count(*)::int AS n FROM hotel_content
            WHERE lat BETWEEN 22.15 AND 22.56 AND lng BETWEEN 113.83 AND 114.44 AND lat != 0
            GROUP BY 1 ORDER BY 2 DESC LIMIT 6`;
        console.log(`${label} by city:`, byCity.map(r => `${r.city}/${r.country}×${r.n}`).join(', '));
        console.log(`${label} inside HK's box:`, inHkBox.map(r => `${r.country}×${r.n}`).join(', '));
    } catch (e) { console.log(label, 'error:', e.message); }
    await sql.end();
}

const token = read('NEXT_PUBLIC_MAPBOX_TOKEN');
const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/Hong%20Kong.json?types=region,place,district,locality,neighborhood,poi&limit=3&language=en&access_token=${token}`);
const data = await res.json();
for (const f of data.features ?? []) console.log('mapbox:', f.id, JSON.stringify(f.place_type), f.place_name, JSON.stringify(f.bbox), JSON.stringify((f.context ?? []).map(c => c.id)));
