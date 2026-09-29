/**
 * The stale cached price a customer is shown vs a live search for the same thing, hotel by
 * hotel. Answers "does a fresh search come back higher, and how often".
 *
 * Reads the cached row from LIVE (read-only), runs one live TGX search with bypassCache
 * (it writes its result to the LOCAL cache only — getSqlAdmin uses .env's DATABASE_URL).
 *
 *   npx tsx scratch/compare-cached-vs-live.ts "city:manila|2026-09-11|2026-09-12|2|0|US" Manila PH
 */
import fs from 'fs';
import postgres from 'postgres';

// Load .env into process.env without printing anything from it.
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const [key, cityName, countryCode] = process.argv.slice(2);
const [, checkin, checkout, adults, children, nationality] = key.split('|');

const live = postgres(process.env.RDS_DATABASE_URL!, { ssl: { rejectUnauthorized: false }, max: 1 });
const [row] = await live`
    SELECT result, created_at, EXTRACT(EPOCH FROM (now() - created_at)) / 60 AS age_min
      FROM hotel_search_cache WHERE cache_key = ${key}`;
await live.end();
if (!row) { console.log('no cached row for that key'); process.exit(1); }

const cached = new Map<string, number>(
    (row.result.data as any[]).map(h => [String(h.hotelId ?? h.id), Number(h.price)]),
);
console.log(`cached: ${cached.size} hotels, ${Math.round(row.age_min)} min old`);

const { runTgxSearch } = await import('../src/lib/server/stays/travelgatex/search');
const t0 = Date.now();
const fresh = await runTgxSearch({
    cityName, countryCode, checkin, checkout,
    adults: Number(adults), children: Number(children),
    guest_nationality: nationality, bypassCache: true,
} as any);
const freshMap = new Map<string, number>(
    ((fresh?.data ?? []) as any[]).map(h => [String(h.hotelId ?? h.id), Number(h.price)]),
);
console.log(`live:   ${freshMap.size} hotels in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

let up = 0, down = 0, same = 0;
const deltas: number[] = [];
const rowsOut: string[] = [];
for (const [id, was] of cached) {
    const now = freshMap.get(id);
    if (now === undefined || !(was > 0)) continue;
    const pct = (now - was) / was * 100;
    deltas.push(pct);
    if (Math.abs(pct) < 0.5) same++; else if (pct > 0) up++; else down++;
    rowsOut.push(`  ${id.padEnd(10)} ${was.toFixed(0).padStart(8)} → ${now.toFixed(0).padStart(8)}  ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
}
const gone = [...cached.keys()].filter(id => !freshMap.has(id)).length;
const added = [...freshMap.keys()].filter(id => !cached.has(id)).length;

console.log(rowsOut.slice(0, 25).join('\n'));
deltas.sort((a, b) => a - b);
const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
console.log(`\nin both: ${deltas.length}   up ${up}   down ${down}   unchanged ${same}   median ${median >= 0 ? '+' : ''}${median.toFixed(1)}%`);
console.log(`sold out since cached: ${gone}   newly available: ${added}`);
process.exit(0);
