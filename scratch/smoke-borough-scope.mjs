#!/usr/bin/env node
/**
 * A borough is searched as a borough, not as the city it belongs to.
 *
 * Reported 2026-09-22: searching "Barking and Dagenham" opened the map on the whole of Greater
 * London and offered 220 hotels, none of the framing being anything the traveller asked for.
 *
 * The picker had done its job — the URL carried the borough's own bbox and its districtName —
 * and three separate places then ignored it:
 *
 *   - the picker flattened the rung to 'city', and the map clips to a bbox for every rung
 *     except city, so the correct bounds were discarded before they were ever drawn
 *   - the catalog honoured a bbox only for a province, so a borough fell through to a 50km
 *     radius around its centroid, which in London is the entire city
 *   - the search ran under the borough's own name, which matches no row in hotel_content and
 *     no TGX destination, reaching London only by way of that radius
 *
 * Not a London problem: the alias dictionary holds 16,634 sub-areas that resolve to a parent
 * city, and every one of them behaved this way.
 *
 * Read-only. It searches and reads; it books nothing.
 *
 *   npm run dev -- --port 3099
 *   node scratch/smoke-borough-scope.mjs
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

/** Barking and Dagenham, exactly as the picker sent it in the report. */
const BOROUGH = {
    destination: 'Barking and Dagenham',
    canonicalCity: 'London',
    countryCode: 'GB',
    rung: 'district',
    lat: 51.533306,
    lng: 0.087108,
    bbox: [0.0666, 51.512, 0.1902, 51.5994],
};

/**
 * Dates close enough that OTV actually prices London. April 2027 returned no prices at all,
 * which let a search that never reached the supplier look exactly like one that did.
 */
const CHECKIN  = new Date(Date.now() + 24 * 864e5).toISOString().slice(0, 10);
const CHECKOUT = new Date(Date.now() + 26 * 864e5).toISOString().slice(0, 10);

/**
 * The body exactly as HotelResultsClient posts it: every URL param a string, the bbox the
 * comma-joined string from the URL, and cityName filled from canonicalCity. An earlier version
 * of this smoke posted a numeric array and no cityName, and passed 14/14 against a live site
 * where every real borough search came back empty.
 */
function asBrowserSends(body) {
    const out = Object.fromEntries(Object.entries(body).map(([k, v]) =>
        [k, Array.isArray(v) ? v.join(',') : String(v)]));
    if (!out.cityName) out.cityName = out.canonicalCity || out.destination;
    return out;
}

async function search(body) {
    const res = await fetch(`${BASE}/api/search/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(asBrowserSends({ checkin: CHECKIN, checkout: CHECKOUT, adults: '2', children: '0', ...body })),
    });
    const text = await res.text();
    const events = text.split(/\r?\n/)
        .map(l => (l.startsWith('data:') ? l.slice(5) : l).trim())
        .filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    return {
        status: res.status,
        catalog: events.find(e => e.type === 'hotels' && e.source === 'catalog')?.data ?? [],
        done: events.find(e => e.type === 'done') ?? {},
        // Everything the page is handed to draw, supplier hotels included, not only the catalog.
        shown: events.filter(e => e.type === 'hotels').flatMap(e => e.data ?? []),
    };
}

console.log('\n\x1b[1mA borough is searched as a borough\x1b[0m\n');

// ── What the two scopes are actually worth ────────────────────────────────────
console.log('The two extents');

const inBorough = Number(psql(`
    SELECT count(*) FROM hotel_content
     WHERE lng BETWEEN 0.0666 AND 0.1902 AND lat BETWEEN 51.512 AND 51.5994
       AND lat <> 0 AND lng <> 0 AND (content_source IS NULL OR content_source <> 'etg')
       AND delisted_at IS NULL`));
const inRadius = Number(psql(`
    SELECT count(*) FROM hotel_content
     WHERE lat BETWEEN 51.083 AND 51.983 AND lng BETWEEN -0.633 AND 0.807
       AND lat <> 0 AND lng <> 0 AND (content_source IS NULL OR content_source <> 'etg')
       AND delisted_at IS NULL`));

check('the borough holds enough hotels to be worth showing on its own', inBorough > 0, `${inBorough} in the bbox`);
check('and far fewer than the radius that replaced it', inRadius > inBorough * 5,
    `${inBorough} in the borough against ${inRadius} in the 50km box`);

// ── The picker ────────────────────────────────────────────────────────────────
console.log('\nWhat the picker says it found');

const suggest = src('src/lib/server/search.ts');
check('a borough is no longer labelled a city',
    !/rung: aliasedCity \? 'city' : rung/.test(suggest),
    'the picker still flattens an aliased rung to city, and the map discards the bbox for city');

const mapView = src('src/components/search/SearchMapView.tsx');
check('and the map clips to the bbox at that rung',
    /BBOX_CLIP_RUNGS[\s\S]{0,200}'district'/.test(mapView),
    'district must remain a rung the map clips to');

// ── The search ────────────────────────────────────────────────────────────────
console.log('\nWhat the search does with it');

const route = src('src/app/api/search/stream/route.ts');
check('an administrative extent is honoured, not only a province',
    /body\.areaRung && body\.areaRung !== 'city'/.test(route),
    'only province bounded by bbox, so a borough fell through to the radius');
check('and every rung the map clips by is bounded server-side too',
    /BOUNDED_RUNGS = new Set\(\[/.test(route),
    'the list the catalog bounds by must match the list the map clips by, or the pins and the results disagree');
check('and the parent city is what gets searched',
    /body\.cityName = body\.canonicalCity/.test(route),
    'searching under the borough name matches no catalog row and no TGX destination');

let reachable = true;
try { await fetch(`${BASE}/`); } catch { reachable = false; }

if (!reachable) {
    bad('v1 is reachable on :3099', 'start it with: npm run dev -- --port 3099');
} else {
    console.log('\nA live borough search');

    const r = await search(BOROUGH);
    check('the search answers', r.status === 200, `status ${r.status}`);
    check('pins arrive', r.catalog.length > 0, `${r.catalog.length} catalog hotels`);

    // Reported 2026-09-22 as "No hotels found" for Camden Town: the sub-area went undetected, its
    // rung stayed 'district', and the supplier search answers a district with nothing — so every
    // catalog pin was then removed as unavailable. The parent city must actually be searched.
    check('the supplier is asked about the parent city, not the borough',
        (r.done.tgxCount ?? 0) > 0,
        `tgxCount ${r.done.tgxCount}, tgxFailed ${r.done.tgxFailed} — a borough answered with no supplier search empties the page`);

    // The whole point: every pin drawn must be inside the borough the traveller asked for.
    const [minLng, minLat, maxLng, maxLat] = BOROUGH.bbox;
    const outside = r.catalog.filter(h =>
        Number(h.lat) < minLat || Number(h.lat) > maxLat ||
        Number(h.lng) < minLng || Number(h.lng) > maxLng);
    check('and every one of them is inside the borough',
        r.catalog.length > 0 && outside.length === 0,
        `${outside.length} of ${r.catalog.length} fall outside, e.g. ${outside.slice(0, 2).map(h => `${h.name} (${h.lat}, ${h.lng})`).join('; ')}`);

    // The supplier answers for the parent city; what it adds must be bounded like the catalog,
    // or the page lists the whole city and the map refits to it.
    const strays = [...r.shown, ...(r.done.allMappable ?? [])].filter(h =>
        Number(h.lat) < minLat || Number(h.lat) > maxLat || Number(h.lng) < minLng || Number(h.lng) > maxLng);
    check('and nothing the supplier adds, nor any map pin, is outside it',
        strays.length === 0,
        `${strays.length} outside, e.g. ${strays.slice(0, 2).map(h => h.name).join('; ')}`);

    check('the catalog is scoped to the borough, not the city',
        r.catalog.length <= inBorough,
        `${r.catalog.length} drawn against ${inBorough} that exist in the borough`);

    // A plain city search must keep its radius: a city bbox is tighter than the city's real
    // hotel spread, which is the reason the radius exists at all.
    console.log('\nA plain city search still uses its radius');

    const city = await search({ destination: 'London', cityName: 'London', countryCode: 'GB', rung: 'city',
                                lat: 51.5074, lng: -0.1278, bbox: [-0.51, 51.28, 0.33, 51.69] });
    check('a city search still reaches beyond a tight bbox',
        city.catalog.length > r.catalog.length,
        `city ${city.catalog.length} vs borough ${r.catalog.length}`);

    // A sub-area the alias dictionary has never heard of.
    //
    // Barking reaches the catalog through canonicalCity; the 11th arrondissement of Paris has
    // no parent city in the dictionary, so it arrives as a plain district rung and took a
    // different branch. Measured before the fix: 984 pins drawn, 0 of them in the 11th, while
    // 643 hotels sit inside it. The word "arrondissement" appears nowhere in the fix, and
    // should not - what the catalog needs is a rung below city and a set of bounds.
    console.log('\nA sub-area with no parent city in the dictionary');

    const ARR = [2.3556, 48.8478, 2.3987, 48.8700];
    const arr = await search({
        destination: '11th arrondissement', cityName: '11th arrondissement',
        countryCode: 'FR', rung: 'district', lat: 48.8594, lng: 2.3765, bbox: ARR,
    });

    const arrInside = arr.catalog.filter(h =>
        +h.lng >= ARR[0] && +h.lng <= ARR[2] && +h.lat >= ARR[1] && +h.lat <= ARR[3]);

    check('a district with no alias is still bounded by its own extent',
        arr.catalog.length > 0 && arrInside.length === arr.catalog.length,
        `${arr.catalog.length - arrInside.length} of ${arr.catalog.length} pins fall outside the arrondissement`);

    const arrExpected = Number(psql(`
        SELECT count(*) FROM hotel_content
         WHERE lng BETWEEN 2.3556 AND 2.3987 AND lat BETWEEN 48.8478 AND 48.8700
           AND lat <> 0 AND lng <> 0 AND (content_source IS NULL OR content_source <> 'etg')
           AND delisted_at IS NULL`));
    check('and draws the hotels that are actually in it',
        arr.catalog.length > 0 && arr.catalog.length <= arrExpected,
        `${arr.catalog.length} drawn against ${arrExpected} in the bbox`);

    console.log(`\n  borough: ${r.catalog.length} pins, all inside · ` +
                `arrondissement: ${arr.catalog.length} pins, all inside · ` +
                `city: ${city.catalog.length} pins`);
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
