#!/usr/bin/env node
/**
 * Report cities whose catalog spelling does not match the name we search for.
 *
 * Suppliers file one city under several localized names at once — Seoul is stored
 * as both "Seoul" (1,094 hotels) and "Seúl" (936) — and sometimes under none of
 * the names we would ever ask for: the catalog holds "Singapur" and "Сингапур"
 * but no "Singapore" at all. Neither failure is ever reported, because a guest
 * cannot tell that hotels are missing.
 *
 * Two independent checks:
 *
 *   UNREACHABLE — a canonical name we resolve searches to that has zero rows.
 *     Unambiguous, needs no judgement, and is the worse bug: not "half the city"
 *     but "none of it".
 *
 *   SPLIT — two city names in the same country whose hotels sit in the same place.
 *     Reported on geography alone, deliberately. An earlier version also required
 *     name similarity, which looked tidier and silently missed "Singapur"/"Сингапур"
 *     (different scripts) and "Skiathos"/"Skiathos-stad". The asymmetry is the
 *     point: a false positive costs someone ten seconds of reading, a false
 *     negative costs hundreds of hotels nobody knows are gone. So this errs loud.
 *
 * Nothing is applied automatically. Roughly two thirds of SPLIT rows are genuinely
 * different places that merely sit close together — "Battery Point" and "Hobart"
 * are 0.86 km apart and are not the same town. Confirmed pairs go by hand into
 * HOTEL_DB_CITY_SYNONYMS in src/lib/constants/cityAliases.ts.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/city-spelling-candidates.mjs [--min-hotels 20] [--km 1]
 */

import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const MIN_HOTELS = arg('min-hotels', 20);
const MAX_KM     = arg('km', 1);

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}

const url = process.env.DATABASE_URL;
const sql = postgres(url, { ssl: url.includes('sslmode=require') ? 'require' : false });

// ─── The names we actually search for ─────────────────────────────────────────

const src = readFileSync(new URL('../src/lib/constants/cityAliases.ts', import.meta.url), 'utf8');

function objectLiteral(exportName) {
    const start = src.indexOf(`export const ${exportName}`);
    if (start === -1) return '';
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
    }
    return '';
}

/**
 * City + country pairs a search can resolve to, with how often each was actually
 * searched.
 *
 * `hotel_search_stats` is the important source: it records what people typed, so
 * an unreachable target with real demand behind it is costing money right now.
 * The alias tables are included too, but they only cover names someone thought to
 * write down — Singapore is in neither, and Mapbox returns it directly, which is
 * exactly how a city with no matching catalog spelling went unnoticed.
 */
const targets = new Map(); // key -> demand (0 when it comes only from a table)

const demandRows = await sql`
    SELECT city_key, country_code, search_count
    FROM hotel_search_stats
    WHERE city_key <> '' AND country_code ~ '^[A-Za-z]{2}$'
`;
for (const r of demandRows) {
    // Search keys arrive as typed: "paris, france" as well as "paris".
    const city = r.city_key.split(',')[0].trim();
    if (!city || city === '(unknown)') continue;
    const key = `${city}|${r.country_code.toUpperCase()}`;
    targets.set(key, (targets.get(key) ?? 0) + Number(r.search_count ?? 0));
}

// CITY_ALIASES: nested as { CC: { alias: 'Canonical City' } } — the values are targets.
// Values may contain escaped apostrophes ("Villa O\'Higgins"), so match to the
// closing quote that is not preceded by a backslash.
{
    const body = objectLiteral('CITY_ALIASES');
    let country = null;
    for (const line of body.split('\n')) {
        const head = line.match(/^\s{4}([A-Z]{2}):\s*\{/);
        if (head) { country = head[1]; continue; }
        if (/^\s{4}\}/.test(line)) { country = null; continue; }
        const kv = line.match(/:\s*'((?:[^'\\]|\\.)*)'/);
        if (kv && country) {
            const key = `${kv[1].replace(/\\'/g, "'")}|${country}`;
            if (!targets.has(key)) targets.set(key, 0);
        }
    }
}

// HOTEL_DB_CITY_MAP / HOTEL_DB_CITY_SYNONYMS keys are canonical names by definition.
for (const name of ['HOTEL_DB_CITY_MAP', 'HOTEL_DB_CITY_SYNONYMS']) {
    for (const line of objectLiteral(name).split('\n')) {
        const m = line.match(/^\s*'((?:[^'\\]|\\.)*\|[A-Z]{2})'\s*:/);
        if (m) {
            const key = m[1].replace(/\\'/g, "'");
            if (!targets.has(key)) targets.set(key, 0);
        }
    }
}

// CITY_ALIASES maps a sub-area to its canonical city, and runs BEFORE the
// spelling resolver in the real search path. Without modelling it here the report
// accuses every district of being unreachable — "gangnam district" resolves to
// Seoul long before any catalog lookup happens.
const aliasIndex = {}; // 'cc|alias' -> 'Canonical City'
{
    const body = objectLiteral('CITY_ALIASES');
    let country = null;
    for (const line of body.split('\n')) {
        const head = line.match(/^\s{4}([A-Z]{2}):\s*\{/);
        if (head) { country = head[1]; continue; }
        if (/^\s{4}\}/.test(line)) { country = null; continue; }
        if (!country) continue;
        // Several pairs per line: 'alias': 'City', 'alias2': 'City',
        for (const m of line.matchAll(/'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
            aliasIndex[`${country}|${m[1].replace(/\\'/g, "'").toLowerCase()}`] = m[2].replace(/\\'/g, "'");
        }
    }
}

/** Mirrors resolveAliasedCity: exact match, then longest whole-word prefix. */
function resolveAlias(city, cc) {
    const lower = city.toLowerCase();
    const exact = aliasIndex[`${cc}|${lower}`];
    if (exact) return exact;
    let best = null;
    for (const key of Object.keys(aliasIndex)) {
        if (!key.startsWith(`${cc}|`)) continue;
        const alias = key.slice(cc.length + 1);
        if (lower.startsWith(alias + ' ') || lower.startsWith(alias + '-')) {
            if (!best || alias.length > best.length) best = alias;
        }
    }
    return best ? aliasIndex[`${cc}|${best}`] : city;
}

// Everything the resolver would send those targets to.
const { resolveHotelDbCities } = await (async () => {
    // The module is TypeScript; parse the two tables out rather than compiling it.
    const syn = {};
    for (const line of objectLiteral('HOTEL_DB_CITY_SYNONYMS').split('\n')) {
        const m = line.match(/'([^']+)'\s*:\s*\[([^\]]+)\]/);
        if (m) syn[m[1]] = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    }
    const map = {};
    for (const line of objectLiteral('HOTEL_DB_CITY_MAP').split('\n')) {
        // Values containing an apostrophe are written in double quotes —
        // "Inch'on". Matching only single-quoted values reported Incheon as
        // unreachable when its 827 hotels resolve perfectly well.
        const m = line.match(/'([^']+)'\s*:\s*(?:'([^']*)'|"([^"]*)")/);
        if (m) map[m[1]] = m[2] ?? m[3];
    }
    // Mirrors the case-insensitive index in cityAliases.ts. Keep the two in step:
    // a case-sensitive lookup here reports Rome as unreachable when it is not.
    const index = {};
    for (const [k, v] of Object.entries(map)) index[k.toLowerCase()] = [v];
    for (const [k, v] of Object.entries(syn)) index[k.toLowerCase()] = v;
    return {
        resolveHotelDbCities: (city, cc) => index[`${city}|${cc}`.toLowerCase()] ?? [city],
    };
})();

// ─── UNREACHABLE ──────────────────────────────────────────────────────────────

// One round-trip, not one per target: CITY_ALIASES alone yields thousands of
// canonical names, and a query each turns a ten-second report into an hour.
const probes = [...targets.keys()].map(key => {
    const [city, cc] = key.split('|');
    // The real chain: sub-area to canonical city, then canonical city to every
    // catalog spelling of it.
    const canonical = resolveAlias(city, cc);
    return { key, cc, canonical, spellings: resolveHotelDbCities(canonical, cc) };
});

// Every (country, spelling) the resolver could send a search to.
const flat = probes.flatMap(p => p.spellings.map(s => ({ cc: p.cc.toLowerCase(), name: s.toLowerCase() })));

const present = new Set(
    (await sql`
        SELECT DISTINCT lower(h.country) AS cc, lower(h.city) AS name
        FROM hotel_content h
        JOIN unnest(${flat.map(f => f.cc)}::text[], ${flat.map(f => f.name)}::text[]) AS t(cc, name)
          ON lower(h.country) = t.cc AND lower(h.city) = t.name
    `).map(r => `${r.cc}|${r.name}`)
);

const emptyTargets = probes.filter(
    p => !p.spellings.some(s => present.has(`${p.cc.toLowerCase()}|${s.toLowerCase()}`))
);

// Only report a dead target when the country has hotels at all — otherwise every
// alias for a country we simply do not stock shows up as a defect.
const stocked = new Map(
    (await sql`
        SELECT lower(country) AS cc, COUNT(*)::int AS n
        FROM hotel_content GROUP BY lower(country)
    `).map(r => [r.cc, r.n])
);

const topByCountry = new Map();
for (const r of await sql`
    SELECT cc, city, n FROM (
        SELECT lower(country) AS cc, city, COUNT(*)::int AS n,
               row_number() OVER (PARTITION BY lower(country) ORDER BY COUNT(*) DESC) AS rn
        FROM hotel_content WHERE city IS NOT NULL AND country IS NOT NULL
        GROUP BY lower(country), city
    ) x WHERE rn <= 3
`) {
    const bucket = topByCountry.get(r.cc) ?? [];
    bucket.push(`${r.city} (${r.n})`);
    topByCountry.set(r.cc, bucket);
}

const unreachable = emptyTargets
    .filter(p => (stocked.get(p.cc.toLowerCase()) ?? 0) >= MIN_HOTELS)
    .map(p => ({
        key: p.key,
        canonical: p.canonical,
        spellings: p.spellings,
        demand: targets.get(p.key) ?? 0,
        near: topByCountry.get(p.cc.toLowerCase()) ?? [],
    }))
    // Demand first: a target nobody searches for may simply be a city we do not
    // stock, which is not a defect. One people search for and never reach is.
    .sort((a, b) => b.demand - a.demand);

const searched = unreachable.filter(u => u.demand > 0);
const untouched = unreachable.filter(u => u.demand === 0);

console.log(`\n═══ UNREACHABLE — search resolves to a name with zero hotels ═══\n`);
if (!searched.length) {
    console.log('  Nothing that anyone has actually searched for.\n');
} else {
    console.log('  WITH REAL SEARCH DEMAND — these are costing bookings now:\n');
    for (const u of searched) {
        const viaAlias = u.canonical && u.canonical.toLowerCase() !== u.key.split('|')[0].toLowerCase()
            ? `  (alias -> ${u.canonical})`
            : '';
        console.log(`  ${String(u.demand).padStart(4)} searches   ${u.key}${viaAlias}  ->  [${u.spellings.join(', ')}]  = 0 hotels`);
        console.log(`                  country's largest: ${u.near.join(', ')}`);
    }
    console.log('');
}
console.log(`  ${untouched.length} more target${untouched.length === 1 ? '' : 's'} resolve to nothing but have never been searched.`);
console.log(`  Most are cities we simply do not stock, which is not a defect — check them only if a`);
console.log(`  country's largest cities suggest we should have inventory there.\n`);

// ─── SPLIT ────────────────────────────────────────────────────────────────────

const splits = await sql`
    WITH c AS (
        SELECT country, city, COUNT(*)::int AS n, AVG(lat) AS la, AVG(lng) AS lo
        FROM hotel_content
        WHERE lat IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL
        GROUP BY country, city
        HAVING COUNT(*) >= ${MIN_HOTELS}
    )
    SELECT a.country, a.city AS ca, a.n AS na, b.city AS cb, b.n AS nb,
           round((111.045 * sqrt(power(a.la - b.la, 2)
               + power((a.lo - b.lo) * cos(radians((a.la + b.la) / 2)), 2)))::numeric, 2) AS km
    FROM c a JOIN c b ON a.country = b.country AND a.city < b.city
    WHERE 111.045 * sqrt(power(a.la - b.la, 2)
        + power((a.lo - b.lo) * cos(radians((a.la + b.la) / 2)), 2)) < ${MAX_KM}
    ORDER BY a.country, km
`;

console.log(`═══ SPLIT — same country, hotel centroids within ${MAX_KM} km, >= ${MIN_HOTELS} hotels each ═══\n`);
console.log('  Confirm each by hand. Most are different places that merely sit close together.\n');
for (const r of splits) {
    console.log(`  ${r.country}  ${(r.ca + ' (' + r.na + ')').padEnd(30)} <-> ${(r.cb + ' (' + r.nb + ')').padEnd(30)} ${String(r.km).padStart(5)} km`);
}
console.log(`\n  ${splits.length} pair${splits.length === 1 ? '' : 's'}.`);
console.log('  Add confirmed ones to HOTEL_DB_CITY_SYNONYMS in src/lib/constants/cityAliases.ts.\n');

await sql.end();
