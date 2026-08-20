import postgres from './node_modules/postgres/src/index.js';
import { readFileSync } from 'fs';

const sql = postgres({ host: 'localhost', port: 5433, user: 'cheapestgo', password: 'cheapestgo', database: 'cheapestgo', ssl: false });
const rows = await sql`SELECT DISTINCT city FROM hotel_content WHERE country = 'PH'`;
const tgxCities = new Set(rows.map(r => r.city));

const content = readFileSync('./src/lib/constants/cityAliases.ts', 'utf8');
const phStart = content.indexOf('    PH: {');
const nextSect = content.indexOf('\n    // ──', phStart + 10);
const phSection = content.slice(phStart, nextSect > 0 ? nextSect : phStart + 50000);

const valuePattern = /:\s*'([^'\\](?:[^'\\]|\\.)*)'/g;
const mismatches = new Set();
let match;
while ((match = valuePattern.exec(phSection)) !== null) {
    const val = match[1].replace(/\\'/g, "'");
    if (val && !tgxCities.has(val)) mismatches.add(val);
}
console.log('=== PH mismatches (' + mismatches.size + ') ===');
[...mismatches].sort().forEach(m => console.log(m));
await sql.end();
