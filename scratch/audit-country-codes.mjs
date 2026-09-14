/**
 * Is Hong Kong (hotels filed under CN) the only territory filed under another country's code?
 * Read-only against LIVE.
 *
 * 1. For every small place in COUNTRY_BBOX (a territory, city-state or island nation), count
 *    the stored country codes of hotels inside its box, with their top city names — a box
 *    dominated by a foreign code is the Hong Kong pattern. Neighbours sharing a box edge
 *    (Singapore/Johor) show up too; the city names tell them apart.
 * 2. Known territories by city name, wherever their coordinates are.
 *
 *   node scratch/audit-country-codes.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const src = fs.readFileSync('src/lib/server/stays/travelgatex/search.ts', 'utf8');
const block = src.slice(src.indexOf('const COUNTRY_BBOX'), src.indexOf('};', src.indexOf('const COUNTRY_BBOX')));
const boxes = [...block.matchAll(/([A-Z]{2}):\s*\{\s*minLat:\s*(-?[\d.]+),\s*maxLat:\s*(-?[\d.]+),\s*minLng:\s*(-?[\d.]+),\s*maxLng:\s*(-?[\d.]+)/g)]
    .map(([, code, a, b, c, d]) => ({ code, minLat: +a, maxLat: +b, minLng: +c, maxLng: +d }))
    .map(b => ({ ...b, area: (b.maxLat - b.minLat) * (b.maxLng - b.minLng) }));

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });
await sql`SET statement_timeout = '60s'`;

console.log(`── 1. Small places in COUNTRY_BBOX (${boxes.filter(b => b.area < 30).length} of ${boxes.length}): stored codes inside each box`);
for (const b of boxes.filter(b => b.area < 30).sort((x, y) => x.area - y.area)) {
    const rows = await sql`
        SELECT UPPER(country) AS country, count(*)::int AS n,
               (array_agg(city ORDER BY city))[1:3] AS sample
        FROM hotel_content
        WHERE lat BETWEEN ${b.minLat} AND ${b.maxLat} AND lng BETWEEN ${b.minLng} AND ${b.maxLng} AND lat != 0
        GROUP BY 1 ORDER BY 2 DESC LIMIT 4`;
    const total = rows.reduce((s, r) => s + r.n, 0);
    if (!total) continue;
    const own = rows.find(r => r.country === b.code)?.n ?? 0;
    const flag = own / total < 0.5 ? '  ⚠' : '';
    console.log(`${b.code}${flag}  own ${own}/${total}  ` + rows.map(r => `${r.country}×${r.n} (${[...new Set(r.sample)].join(', ')})`).join('  |  '));
}

console.log('\n── 2. Known territories by city name');
const territories = [
    ['TW', ['taipei', 'taichung', 'kaohsiung', 'tainan', 'hualien']],
    ['MO', ['macau', 'macao', 'taipa', 'cotai']],
    ['MP', ['saipan', 'garapan', 'tinian', 'rota']],
    ['GU', ['tamuning', 'tumon', 'hagatna', 'hagåtña', 'dededo']],
    ['PR', ['san juan', 'carolina', 'dorado', 'rincon', 'ponce']],
    ['VI', ['charlotte amalie', 'christiansted', 'cruz bay']],
    ['PF', ['papeete', 'bora bora', 'moorea']],
    ['NC', ['noumea', 'nouméa']],
    ['RE', ['saint-denis', 'saint-gilles-les-bains', 'saint-pierre']],
    ['CW', ['willemstad']], ['AW', ['oranjestad', 'palm beach', 'noord']],
    ['BM', ['hamilton']], ['KY', ['george town', 'west bay']],
    ['GI', ['gibraltar']], ['FO', ['torshavn', 'tórshavn']], ['GL', ['nuuk', 'ilulissat']],
    ['XK', ['pristina', 'prishtina', 'prizren']], ['PS', ['bethlehem', 'ramallah', 'jericho']],
    ['IM', ['douglas']], ['JE', ['st helier', 'saint helier']], ['GG', ['st peter port']],
];
for (const [code, cities] of territories) {
    const rows = await sql`
        SELECT UPPER(country) AS country, count(*)::int AS n, (array_agg(DISTINCT city))[1:4] AS cities
        FROM hotel_content WHERE LOWER(TRIM(city)) = ANY(${cities})
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5`;
    if (!rows.length) { console.log(`${code}  (no hotels by those names)`); continue; }
    const total = rows.reduce((s, r) => s + r.n, 0);
    const own = rows.find(r => r.country === code)?.n ?? 0;
    console.log(`${code}${own / total < 0.5 ? '  ⚠' : ''}  own ${own}/${total}  ` + rows.map(r => `${r.country}×${r.n} (${r.cities.join(', ')})`).join('  |  '));
}
await sql.end();
