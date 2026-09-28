#!/usr/bin/env node
/**
 * A borough is searched as a borough — api-v2's side of it.
 *
 * v1's `smoke-borough-scope.mjs` proves this against v1's own route. This one proves the same
 * behaviour through api-v2, because the audit on 2026-09-24 found the sub-area missing from v2
 * end to end: app-v2 posted only the destination and a centre point, and api-v2 had no notion
 * of an extent, so a borough was a 50km circle around its centre — in London, the whole city.
 *
 * It sends exactly what app-v2's search page now posts. The one thing that must not be
 * "corrected" here is the shape of that body: the v1 smoke passed 14/14 against a live site
 * where every real borough search was broken, because it posted a tidier body than the browser.
 *
 * Read-only. It searches and reads; it books nothing.
 *
 *   cd cheapestgo-api-v2 && PORT=4002 npm run dev
 *   node scratch/smoke-v2-borough-scope.mjs
 */

import { execFileSync } from 'node:child_process';

const BASE = process.env.API_V2 ?? 'http://localhost:4002/api/v2';
const PGC  = 'cheapestgo-api-v2-postgres-1';

let pass = 0, fail = 0;
const ok  = (n)    => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const psql = (sql) => execFileSync('docker',
    ['exec', PGC, 'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', sql], { encoding: 'utf8' }).trim();

/** Close enough that the supplier actually prices London; far enough to have inventory. */
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const CHECKIN = day(24), CHECKOUT = day(26);

/** Camden Town, exactly as the picker hands it to the results page. */
const CAMDEN = {
    destination:   'Camden Town',
    canonicalCity: 'London',
    countryCode:   'GB',
    rung:          'district',
    lat:           51.541805,
    lng:           -0.13837,
    bbox:          [-0.1413, 51.5361, -0.1186, 51.5571],
};

/**
 * The body app-v2's search page posts: the bbox as the comma-joined string from the URL, and
 * `cityName` set from `canonicalCity` — the parent city, which is what made the sub-area
 * invisible to a check comparing it against the destination.
 */
function asAppV2Sends(dest, extra = {}) {
    const body = {
        destination: dest.destination,
        checkIn: CHECKIN, checkOut: CHECKOUT,
        adults: 2, children: 0, rooms: 1,
        lat: dest.lat, lng: dest.lng,
        ...(dest.countryCode ? { countryCode: dest.countryCode } : {}),
        ...(dest.rung ? { rung: dest.rung } : {}),
        ...(dest.bbox ? { bbox: dest.bbox.join(',') } : {}),
        ...extra,
    };
    if (dest.canonicalCity) {
        body.canonicalCity = dest.canonicalCity;
        body.cityName      = dest.canonicalCity;
    }
    return body;
}

async function search(body) {
    const res = await fetch(`${BASE}/hotels/search/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
    const text = await res.text();
    const events = text.split(/\r?\n/)
        .map(l => (l.startsWith('data:') ? l.slice(5) : l).trim())
        .filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    const hotels = events.filter(e => e.type === 'hotels');
    return {
        status:  res.status,
        catalog: hotels.find(e => e.source === 'catalog')?.data ?? [],
        /** Everything the page is handed to draw, supplier hotels included. */
        shown:   hotels.flatMap(e => e.data ?? []),
        done:    events.find(e => e.type === 'done') ?? {},
    };
}

const coords = (h) => ({
    lat: Number(h.lat ?? h.coordinates?.lat),
    lng: Number(h.lng ?? h.coordinates?.lng),
});
const outside = (list, [minLng, minLat, maxLng, maxLat]) => list.filter(h => {
    const { lat, lng } = coords(h);
    // A hotel with no coordinates cannot be placed, and is not counted as a stray.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat < minLat || lat > maxLat || lng < minLng || lng > maxLng;
});

/**
 * Which of these the portfolio sync has marked as no longer sold.
 *
 * The sync marks rather than deletes, because a hotel can come back and because a booking
 * already made against one still has to render. A delisted hotel on the map is one a
 * traveller can see, click and never book.
 */
const delistedAmong = (ids) => {
    if (!ids.length) return [];
    const list = ids.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
    return psql(`SELECT hotel_id FROM hotel_content WHERE hotel_id IN (${list}) AND delisted_at IS NOT NULL`)
        .split('\n').map(x => x.trim()).filter(Boolean);
};
console.log('\n\x1b[1mA borough is searched as a borough — api-v2\x1b[0m\n');

let reachable = true;
try { await fetch(`${BASE}/hotels/search/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
catch { reachable = false; }

if (!reachable) {
    bad('api-v2 is reachable on :4002', 'start it with: cd cheapestgo-api-v2 && PORT=4002 npm run dev');
} else {
    // ── What the two extents are worth ────────────────────────────────────────
    console.log('The two extents');

    const [minLng, minLat, maxLng, maxLat] = CAMDEN.bbox;
    const inBorough = Number(psql(`
        SELECT count(*) FROM hotel_content
         WHERE lng BETWEEN ${minLng} AND ${maxLng} AND lat BETWEEN ${minLat} AND ${maxLat}
           AND lat <> 0 AND lng <> 0 AND array_length(images, 1) > 0`));
    const inRadius = Number(psql(`
        SELECT count(*) FROM hotel_content
         WHERE lat BETWEEN ${CAMDEN.lat - 0.45} AND ${CAMDEN.lat + 0.45}
           AND lng BETWEEN ${CAMDEN.lng - 0.45} AND ${CAMDEN.lng + 0.45}
           AND lat <> 0 AND lng <> 0 AND array_length(images, 1) > 0`));

    check('the borough holds enough hotels to be worth showing on its own', inBorough > 0, `${inBorough} in the bbox`);
    check('and far fewer than the 50km radius that replaced it',
        inRadius > inBorough * 2, `${inBorough} in the borough against ${inRadius} in the radius`);

    // ── The search itself ─────────────────────────────────────────────────────
    console.log('\nA borough search, posted the way app-v2 posts it');

    const r = await search(asAppV2Sends(CAMDEN));
    check('the search answers', r.status === 200, `status ${r.status}`);
    check('pins arrive', r.catalog.length > 0, `${r.catalog.length} catalog hotels`);

    check('the catalog is scoped to the borough, not the city',
        r.catalog.length > 0 && r.catalog.length <= inBorough,
        `${r.catalog.length} drawn against ${inBorough} that exist in the borough`);

    check('and every pin drawn is inside the borough',
        r.catalog.length > 0 && outside(r.catalog, CAMDEN.bbox).length === 0,
        `${outside(r.catalog, CAMDEN.bbox).length} of ${r.catalog.length} fall outside`);

    // The supplier answers for the parent city, because OTV serves only the City rung
    // (ADR-0006). What it adds has to be cut back, or the page lists the whole city.
    const delistedInExtent = Number(psql(`
        SELECT count(*) FROM hotel_content
         WHERE lng BETWEEN ${minLng} AND ${maxLng} AND lat BETWEEN ${minLat} AND ${maxLat}
           AND array_length(images, 1) > 0 AND delisted_at IS NOT NULL`));
    const shownButDelisted = delistedAmong(r.shown.map(h => h.id ?? h.hotelId).filter(Boolean));
    check('and none of them is a hotel the supplier has stopped selling',
        shownButDelisted.length === 0,
        `${shownButDelisted.length} delisted shown, of ${delistedInExtent} in the extent: ${shownButDelisted.slice(0, 3).join(', ')}`);
    const strays = outside(r.shown, CAMDEN.bbox);
    check('and nothing the supplier adds is outside it either',
        strays.length === 0,
        `${strays.length} of ${r.shown.length} outside, e.g. ${strays.slice(0, 2).map(h => h.name).join('; ')}`);

    // ── A plain city keeps its radius ─────────────────────────────────────────
    console.log('\nA plain city search still uses its radius');

    // Jeju: its own bbox excludes Seogwipo, 27km away, so bounding a city by its box would
    // throw away hotels the traveller expects to see. This is the opposite mistake, and the
    // one that looks like more care rather than less.
    // Jeju City proper, which is what a picker hands back for the city — not the island. The
    // island's own outline already contains Seogwipo, so bounding by it would prove nothing.
    // Measured in this catalog: 353 hotels in the city box, 1,527 within 50km, 308 of those
    // around Seogwipo.
    const JEJU = { destination: 'Jeju', countryCode: 'KR', rung: 'city',
                   lat: 33.4996, lng: 126.5312, bbox: [126.40, 33.45, 126.62, 33.56] };
    const city = await search(asAppV2Sends(JEJU));
    const beyond = outside(city.catalog, JEJU.bbox);
    const cityDelisted = delistedAmong(city.catalog.map(h => h.id ?? h.hotelId).filter(Boolean));
    check('and a city search excludes delisted hotels too',
        cityDelisted.length === 0,
        `${cityDelisted.length} delisted among ${city.catalog.length} pins: ${cityDelisted.slice(0, 3).join(', ')}`);
    check('a city search reaches beyond its own tight bbox',
        city.catalog.length > 0 && beyond.length > 0,
        `${beyond.length} of ${city.catalog.length} outside the city bbox — 0 means the city was wrongly bounded`);

    console.log(`\n  borough: ${r.catalog.length} pins against ${inBorough} in the extent, ` +
                `${inRadius} in the radius · city: ${city.catalog.length} pins, ${beyond.length} beyond its box`);
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
