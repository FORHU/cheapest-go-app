import { readFileSync } from 'fs';
import postgres from './node_modules/postgres/src/index.js';

const fileContent = readFileSync('./src/lib/constants/cityAliases.ts', 'utf-8');
const lines = fileContent.split('\n');

// Parse all (country → Set<targetCity>) from cityAliases.ts
const countryAliases = {};
let currentCountry = null;

for (const line of lines) {
  // Country block header e.g. "    KR: {" or "    US: {"
  const countryMatch = line.match(/^\s{4}([A-Z]{2,3}):\s*\{/);
  if (countryMatch) {
    currentCountry = countryMatch[1];
    countryAliases[currentCountry] ??= new Set();
    continue;
  }

  if (!currentCountry || line.trim().startsWith('//')) continue;

  // Extract every right-hand-side string from  'key': 'value'  or  "key": "value"  pairs
  // Pattern: any-quoted-string  :  (captured-quoted-string)
  const pairRe = /(?:'[^']*'|"[^"]*")\s*:\s*(?:'([^']*)'|"([^"]*)")/g;
  let m;
  while ((m = pairRe.exec(line)) !== null) {
    const value = m[1] ?? m[2];
    if (value !== undefined && value !== '') {
      countryAliases[currentCountry].add(value);
    }
  }
}

// Fetch ALL country+city combos in one query
const sql = postgres({
  host: 'localhost', port: 5433,
  user: 'cheapestgo', password: 'cheapestgo',
  database: 'cheapestgo', ssl: false,
});

console.log('Querying DB for all countries…');
const rows = await sql`SELECT DISTINCT country, city FROM hotel_content ORDER BY country, city`;
await sql.end();

// Build map country → Set<city>
const dbMap = {};
for (const { country, city } of rows) {
  dbMap[country] ??= new Set();
  dbMap[country].add(city);
}

console.log(`DB has ${rows.length} distinct (country, city) rows across ${Object.keys(dbMap).length} countries.\n`);

// Compare
const KNOWN_NO_DATA = new Set(['HK']); // TGX has no hotel_content rows for these
let totalMismatches = 0;
const report = [];

for (const [cc, targets] of Object.entries(countryAliases)) {
  const dbCities = dbMap[cc] ?? new Set();
  const mismatches = [...targets].filter(t => !dbCities.has(t)).sort();

  if (mismatches.length === 0) continue;

  const note = KNOWN_NO_DATA.has(cc) ? ' [NO TGX DATA — expected]' : '';
  report.push({ cc, dbSize: dbCities.size, targetCount: targets.size, mismatches, note });
  totalMismatches += mismatches.length;
}

if (report.length === 0) {
  console.log('✅  All alias targets match DB cities. Nothing to fix.');
} else {
  for (const { cc, dbSize, targetCount, mismatches, note } of report) {
    console.log(`── ${cc}${note}  (DB: ${dbSize} cities | aliases: ${targetCount} targets | ❌ ${mismatches.length} mismatches)`);
    for (const m of mismatches) {
      console.log(`     ❌  "${m}"`);
    }
    console.log();
  }
  console.log(`═══════════════════════════════════════`);
  console.log(`Countries with mismatches: ${report.length}`);
  console.log(`Total mismatched targets:  ${totalMismatches}`);
}
