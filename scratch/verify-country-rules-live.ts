/**
 * Measure the territory correction and the out-of-country rule against EVERY hotel on live.
 * Read-only.
 *
 * For each hotel stored under country X:
 *   - old rule: would a search for X have dropped it? (coordinates outside COUNTRY_BBOX[X])
 *   - new rule: would it be dropped now? (isConfirmedOutOfCountry, searched as the hotel's
 *     corrected country — what an autocomplete suggestion for that place would carry)
 *   - what does the territory correction turn its country into?
 *
 *   npx tsx scratch/verify-country-rules-live.ts
 */
import fs from 'fs';
import postgres from 'postgres';

const { isConfirmedOutOfCountry } = await import('../src/lib/server/stays/travelgatex/search');
const { hotelCountry } = await import('../src/lib/geo/territories');

const src = fs.readFileSync('src/lib/server/stays/travelgatex/search.ts', 'utf8');
const start = src.indexOf('const COUNTRY_BBOX');
const block = src.slice(start, src.indexOf('};', start));
const boxes: Record<string, number[]> = Object.fromEntries([...block.matchAll(/([A-Z]{2}):\s*\{\s*minLat:\s*(-?[\d.]+),\s*maxLat:\s*(-?[\d.]+),\s*minLng:\s*(-?[\d.]+),\s*maxLng:\s*(-?[\d.]+)/g)]
    .map(([, code, a, b, c, d]) => [code, [+a, +b, +c, +d]]));

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)![1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const oldDropped = new Map<string, number>();
const newDropped = new Map<string, { n: number; sample: string[] }>();
const relabelled = new Map<string, { n: number; sample: string[] }>();
let total = 0;

await sql`SELECT hotel_id, city, country, lat, lng FROM hotel_content WHERE country IS NOT NULL AND country != '' AND lat != 0`
    .cursor(5000, async (rows) => {
        for (const r of rows) {
            total++;
            const stored = String(r.country).toUpperCase();
            const lat = Number(r.lat), lng = Number(r.lng);
            const box = boxes[stored];
            if (box && !(lat >= box[0] && lat <= box[1] && lng >= box[2] && lng <= box[3])) {
                oldDropped.set(stored, (oldDropped.get(stored) ?? 0) + 1);
            }
            const corrected = hotelCountry(r.country, r.city, lat, lng).toUpperCase();
            if (corrected !== stored) {
                const key = `${stored}→${corrected}`;
                const e = relabelled.get(key) ?? { n: 0, sample: [] };
                e.n++; if (e.sample.length < 3 && !e.sample.includes(r.city)) e.sample.push(r.city);
                relabelled.set(key, e);
            }
            if (isConfirmedOutOfCountry({ country: r.country, city: r.city, lat, lng }, corrected)) {
                const e = newDropped.get(corrected) ?? { n: 0, sample: [] };
                e.n++; if (e.sample.length < 3) e.sample.push(`${r.city} @${lat.toFixed(1)},${lng.toFixed(1)}`);
                newDropped.set(corrected, e);
            }
        }
    });
await sql.end();

const sum = (m: Map<string, any>) => [...m.values()].reduce((s, v) => s + (typeof v === 'number' ? v : v.n), 0);
console.log(`hotels checked: ${total}`);
console.log(`\nold rule — dropped from a search for their own country: ${sum(oldDropped)} hotels in ${oldDropped.size} countries`);
console.log('  ' + [...oldDropped].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `${c}×${n}`).join(', '));
console.log(`\nnew rule — dropped: ${sum(newDropped)} hotels in ${newDropped.size} countries`);
for (const [c, e] of [...newDropped].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${c}×${e.n}  e.g. ${e.sample.join('; ')}`);
const kept = new Map<string, number>();
console.log(`\nterritory corrections: ${sum(relabelled)} hotels`);
for (const [k, e] of [...relabelled].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k} ×${e.n}  (${e.sample.join(', ')})`);
