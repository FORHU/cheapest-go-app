/**
 * Follow-up to audit-country-codes.mjs. Read-only against LIVE.
 *
 * 1. Coordinates of the doubtful territory hits: is "Saint-Denis, FR" on Réunion or outside
 *    Paris? Is "San Juan, US" in Puerto Rico?
 * 2. The reverse audit: hotels stored under a country whose coordinates fall OUTSIDE that
 *    country's COUNTRY_BBOX. buildCityResults drops those as "confirmed out-of-country", so
 *    a wrong box (Nicaragua's held none of its own hotels) silently removes real hotels.
 *
 *   node scratch/audit-country-bbox.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const src = fs.readFileSync('src/lib/server/stays/travelgatex/search.ts', 'utf8');
const start = src.indexOf('const COUNTRY_BBOX');
const block = src.slice(start, src.indexOf('};', start));
const boxes = Object.fromEntries([...block.matchAll(/([A-Z]{2}):\s*\{\s*minLat:\s*(-?[\d.]+),\s*maxLat:\s*(-?[\d.]+),\s*minLng:\s*(-?[\d.]+),\s*maxLng:\s*(-?[\d.]+)/g)]
    .map(([, code, a, b, c, d]) => [code, { minLat: +a, maxLat: +b, minLng: +c, maxLng: +d }]));

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });
await sql`SET statement_timeout = '120s'`;

console.log('── 1. Where the doubtful territory hits really are');
for (const [label, cities, country] of [
    ['Réunion?', ['saint-denis', 'saint-pierre'], 'FR'],
    ['Puerto Rico?', ['san juan'], 'US'],
    ['Guam', ['tamuning', 'tumon', 'dededo'], 'US'],
    ['Jersey', ['saint helier'], 'GB'],
]) {
    const rows = await sql`
        SELECT city, round(lat::numeric, 1) AS lat, round(lng::numeric, 1) AS lng, count(*)::int AS n
        FROM hotel_content WHERE LOWER(TRIM(city)) = ANY(${cities}) AND UPPER(country) = ${country} AND lat != 0
        GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 6`;
    console.log(`${label} (${country}):`, rows.map(r => `${r.city} @${r.lat},${r.lng}×${r.n}`).join('  |  '));
}

console.log('\n── 2. Stored under a country, outside its COUNTRY_BBOX (what search drops)');
const counts = await sql`SELECT UPPER(country) AS country, count(*)::int AS n FROM hotel_content WHERE lat != 0 AND country IS NOT NULL GROUP BY 1`;
const totals = Object.fromEntries(counts.map(r => [r.country, r.n]));
const results = [];
for (const [code, b] of Object.entries(boxes)) {
    if (!totals[code]) continue;
    const [row] = await sql`
        SELECT count(*)::int AS outside,
               (array_agg(city || ' @' || round(lat::numeric, 1) || ',' || round(lng::numeric, 1)))[1:4] AS sample
        FROM hotel_content
        WHERE UPPER(country) = ${code} AND lat != 0
          AND NOT (lat BETWEEN ${b.minLat} AND ${b.maxLat} AND lng BETWEEN ${b.minLng} AND ${b.maxLng})`;
    if (row.outside > 0) results.push({ code, outside: row.outside, total: totals[code], share: row.outside / totals[code], sample: row.sample });
}
results.sort((a, b) => b.outside - a.outside);
for (const r of results.slice(0, 30)) {
    console.log(`${r.code}  ${r.outside}/${r.total} (${(r.share * 100).toFixed(1)}%)  e.g. ${r.sample.join('; ')}`);
}
console.log(`\ncountries with any outside: ${results.length} of ${Object.keys(boxes).filter(c => totals[c]).length}; countries with no box at all: ${counts.filter(r => !boxes[r.country]).length}`);
await sql.end();
