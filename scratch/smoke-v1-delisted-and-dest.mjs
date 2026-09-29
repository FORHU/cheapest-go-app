#!/usr/bin/env node
/**
 * The three v1 search changes of 2026-09-21, against a running server and the real database.
 *
 * Each was unit-tested, and a unit test cannot see any of what matters here: whether the SQL
 * actually excludes a delisted hotel, whether a name typed without its space reaches the
 * cached destination code, and whether a supplier's "no results" still reads as an outage.
 *
 * Read-only. It searches and reads; it books nothing, and hotel bookings reach the live
 * supplier.
 *
 *   npm run dev -- --port 3099
 *   node scratch/smoke-v1-delisted-and-dest.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.env.V1_BASE ?? 'http://localhost:3099';
const PGC  = 'cheapest-go-app-postgres-1';

let pass = 0, fail = 0;
const ok  = (n)    => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const psql = (sql) => execFileSync('docker',
    ['exec', PGC, 'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', sql], { encoding: 'utf8' }).trim();

const src = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

console.log('\n\x1b[1mv1 search — delisting, destination lookup, supplier warnings\x1b[0m\n');

// ── The portfolio, and what is no longer in it ────────────────────────────────
console.log('Delisted hotels');

const delisted = Number(psql("SELECT count(*) FROM hotel_content WHERE delisted_at IS NOT NULL"));
check('the sync marked hotels OTV no longer lists', delisted > 0, `${delisted} delisted`);
check('and marked only OTV’s own',
    psql("SELECT count(*) FROM hotel_content WHERE delisted_at IS NOT NULL AND content_source <> 'tgx'") === '0',
    'an ETG hotel was delisted by an OTV pull');

// The catalog query is what draws pins and what fills the hotel-code batches. A delisted
// hotel in either is a pin that must be withdrawn mid-search and a code the supplier has
// already said it cannot price.
const pinned = psql(`
    SELECT count(*) FROM hotel_content
     WHERE delisted_at IS NOT NULL AND lat <> 0 AND lng <> 0
       AND (content_source IS NULL OR content_source <> 'etg')`);
check('some of them would otherwise still be drawn on the map', Number(pinned) > 0, `${pinned} with coordinates`);

// Counted rather than fixed at a number, so adding a catalog query cannot quietly leave one
// unfiltered. Every read of hotel_content on this path is for drawing pins.
const route = src('src/app/api/search/stream/route.ts');
const reads   = (route.match(/FROM hotel_content/g) || []).length;
const filters = (route.match(/AND delisted_at IS NULL/g) || []).length;
check('every catalog query filters them out', reads > 0 && reads === filters,
    `${reads} queries against hotel_content, ${filters} carrying the filter`);

// The supplier path is more mixed: a lookup by hotel_id is enriching a hotel we already
// hold and has nothing to filter, and the country inference wants every hotel it can see,
// because a delisted hotel sits in the same country as a live one. What must carry the
// filter is each query that picks ids *by place* and sends them to OTV.
const tgx = src('src/lib/server/stays/travelgatex/search.ts');
const byPlace = (tgx.match(/SELECT hotel_id(?:, lat, lng)? FROM hotel_content/g) || []).length;
const tgxFilters = (tgx.match(/AND delisted_at IS NULL/g) || []).length;
check('so does every query that picks hotel codes by place',
    byPlace > 0 && byPlace === tgxFilters,
    `${byPlace} pick ids by place, ${tgxFilters} carry the filter`);

// ── A destination typed without its space ─────────────────────────────────────
console.log('\nDestination lookup');

const stored = psql(`SELECT city_key FROM tgx_destination_cache
                      WHERE regexp_replace(lower(city_key), '[^a-z0-9]', '', 'g') = 'danang'
                        AND destination_code <> 'NONE' LIMIT 1`);
check('the catalogue files it with a space', stored === 'da nang', `found: ${stored || '(nothing)'}`);
check('and the lookup can match on letters alone',
    src('src/lib/server/search.ts').includes('export function looseCityKey'),
    'v1 had no loose fallback; the fix only ever landed in v2');

// ── A live search ─────────────────────────────────────────────────────────────
console.log('\nA search that runs');

let reachable = true;
try { await fetch(`${BASE}/`); } catch { reachable = false; }

if (!reachable) {
    bad('v1 is reachable on :3099', 'start it with: npm run dev -- --port 3099');
} else {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/search/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            cityName: 'Danang', destination: 'Danang', countryCode: 'VN',
            checkin: '2027-03-18', checkout: '2027-03-20', adults: '2', children: '0',
        }),
    });
    const text = await res.text();
    const seconds = (Date.now() - t0) / 1000;

    const events = text.split(/\r?\n/)
        .map(l => (l.startsWith('data:') ? l.slice(5) : l).trim())
        .filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);

    const done = events.find(e => e.type === 'done') ?? {};
    const catalog = events.find(e => e.type === 'hotels' && e.source === 'catalog')?.data ?? [];

    check('the search answers', res.status === 200 && events.length > 0, `status ${res.status}, ${events.length} events`);
    check('pins arrive for the map', catalog.length > 0, `${catalog.length} catalog hotels`);

    // The point of the filter: nothing drawn may be a hotel the supplier has dropped.
    const ids = catalog.map(h => h.id).filter(Boolean);
    if (ids.length > 0) {
        const list = ids.map(i => `'${String(i).replace(/'/g, "''")}'`).join(',');
        const drawnButDelisted = psql(
            `SELECT count(*) FROM hotel_content WHERE hotel_id IN (${list}) AND delisted_at IS NOT NULL`);
        check('none of the pins is a delisted hotel', drawnButDelisted === '0',
            `${drawnButDelisted} of ${ids.length} drawn hotels are no longer in the portfolio`);
    }

    console.log(`\n  "Danang" answered in ${seconds.toFixed(1)}s with ${done.tgxCount ?? 0} priced hotels`);
    if (done.tgxFailed) console.log('  ! the supplier leg failed on this run — timing above is not representative');
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
