#!/usr/bin/env node
/**
 * Why a v2 hotel search is slow, and the four things that fix it.
 *
 * Separate from smoke-v2-c1-search.mjs, which checks the rules a search keeps. This one is
 * about the supplier round-trip: the plugins without which TGX rejects every destination
 * code, the second call to OTV that used to run alongside the first, the spelling that
 * dropped a search into a 40-second path, and the collecting pass that picks up what a
 * truncated first answer left behind.
 *
 * Read-only: it searches and reads. It books nothing, and hotel bookings hit the live
 * supplier, so nothing here may ever become a reservation.
 *
 * Wants api-v2 on :4002 so it never takes the port a real backend is using:
 *
 *   cd cheapestgo-api-v2 && PORT=4002 npm run dev
 *   node scratch/smoke-v2-search-speed.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const API = process.env.API_V2 ?? 'http://localhost:4002/api/v2';
const V2  = 'C:/Users/USER/Documents/GitHub/cheapestgo-api-v2';
const APP = 'C:/Users/USER/Documents/GitHub/cheapestgo-app-v2';
const PGC = 'cheapestgo-api-v2-postgres-1';

let pass = 0, fail = 0;
const ok   = (n)      => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad  = (n, d)   => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const src  = (p) => (existsSync(`${V2}/${p}`) ? readFileSync(`${V2}/${p}`, 'utf8') : '');
const src2 = (p) => (existsSync(`${APP}/${p}`) ? readFileSync(`${APP}/${p}`, 'utf8') : '');
const psql = (sql) => execFileSync('docker',
    ['exec', PGC, 'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', sql], { encoding: 'utf8' }).trim();

/**
 * One streaming search, read as it arrives.
 *
 * Read as a stream rather than with `res.text()` because what matters now is *when* `done`
 * lands, not merely that it did. Buffering the whole response collapses the gap between the
 * answer and the collecting pass that follows it, which is the thing under test.
 */
async function search(city, { checkin = '2026-12-04', checkout = '2026-12-05' } = {}) {
    const started = Date.now();
    const res = await fetch(`${API}/hotels/search/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ destination: city, cityName: city, checkin, checkout, adults: 2, children: 0, rooms: 1 }),
    });

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    const events = [];
    let buf = '', doneMs = null, afterDone = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            let e;
            try { e = JSON.parse(t.startsWith('data:') ? t.slice(5) : t); } catch { continue; }
            events.push(e);
            if (e.type === 'done') doneMs = Date.now() - started;
            else if (doneMs !== null && (e.type === 'hotels' || e.type === 'prices')) {
                afterDone += Array.isArray(e.data) ? e.data.length : 0;
            }
        }
    }

    const done = events.find((e) => e.type === 'done') ?? {};
    return {
        seconds: (Date.now() - started) / 1000,
        doneSeconds: doneMs === null ? null : doneMs / 1000,
        afterDone,
        collecting: done.collecting === true,
        waves:   events.filter((e) => e.type === 'hotels' && e.source !== 'catalog').length,
        catalog: events.find((e) => e.type === 'hotels' && e.source === 'catalog')?.data?.length ?? 0,
        count:   done.tgxCount ?? 0,
        failed:  done.tgxFailed === true,
        unanswered: done.tgxUnanswered === true,
    };
}

console.log('\n\x1b[1mv2 search — the supplier round-trip\x1b[0m\n');

// ── The plugins, without which every destination code is rejected ─────────────
console.log('TravelgateX plugins');

const tgx = src('src/lib/hotels/travelgatex.ts');
check('search_by_destination is sent', tgx.includes('search_by_destination'),
    'without it TGX answers every destination code with WRONG_FIELD/empty hotels');
check('cheapest_price is sent', tgx.includes('cheapest_price'),
    'without it a Phuket response is ~16MB of ~84k options instead of ~20KB');
check('currency_exchange is sent', tgx.includes('currency_exchange'),
    'without it supplier prices arrive unconverted');

const searchSrc = src('src/lib/hotels/search.ts');
check('the destination search asks for the plugins', searchSrc.includes('destSettings'),
    'the destination variant must carry search_by_destination; a hotel-code search must not');

// ── One request to OTV, not two ───────────────────────────────────────────────
console.log('\nSupplier load');

check('the destination call goes to OTV alone',
    !/Promise\.all\(\[\s*\n\s*tgxGraphQL\(CITY_SEARCH_QUERY/.test(searchSrc),
    'sharing a Promise.all with the portfolio fetch put two concurrent requests on OTV per search');
check('the portfolio is fetched only when it is needed',
    searchSrc.includes('Only now, and only if it is actually needed'),
    'fetching it up front spends an OTV call on every successful search that never uses it');

// ── The budget that decides completeness ──────────────────────────────────────
console.log('\nSupplier budget');

check('the budget still defaults to the 12s OTV stated',
    /SUPPLIER_SEARCH_TIMEOUT_MS = Number\(process\.env\.TGX_SEARCH_TIMEOUT_MS \?\? 12_000\)/.test(searchSrc),
    'raising it is OTV\u2019s call, not ours — but it must be changeable without a code edit');
check('the measurements behind it are written down',
    searchSrc.includes('230 hotels in 5-8s'),
    'the next reader needs to know more budget measured faster AND more complete');

// ── A name typed without its spaces ───────────────────────────────────────────
console.log('\nDestination codes');

const stored = psql(`SELECT city_key FROM tgx_destination_cache WHERE regexp_replace(lower(city_key), '[^a-z0-9]', '', 'g') = 'danang' AND destination_code <> 'NONE' LIMIT 1;`);
check('the catalogue stores "da nang" with a space', stored === 'da nang', `found: ${stored || '(nothing)'}`);
check('a lookup falls back to matching on letters alone', tgx.includes('looseCityKey'),
    '"Danang" missed the stored "da nang" and fell into the 40s hotel-code path');

// ── The collecting pass ───────────────────────────────────────────────────────
console.log('\nSecond pass');

const ctrl = src('src/controllers/hotels.controller.ts');
check('a truncated first answer is followed up', ctrl.includes('SECOND_PASS_THRESHOLD_MS'),
    'OTV keeps working after we stop listening; the finished answer is one cheap call away');
check('a fast first answer is left alone',
    ctrl.includes('firstPassMs >= SECOND_PASS_THRESHOLD_MS'),
    'asking again after a complete answer only doubles the requests OTV sees');

// The gate must read the supplier, not the clock. A slow answer is not a truncated one:
// two cold cities measured on 2026-09-21 ran 16.8s and 17.3s, returned 263 and 158 hotels,
// and their second passes returned the same sets with nothing new. Elapsed time alone sends
// a full extra search to OTV for every search that is merely slow.
check('the collecting pass is gated on the supplier being cut short',
    /tgxResult\.truncated === true/.test(ctrl),
    'gating on elapsed time alone re-asks OTV for answers it already gave in full');
check('a partial destination answer counts as truncated',
    /isSupplierTimeout\(destWarnings\)\) supplierCutShort = true/.test(searchSrc),
    'TGX returns the options that arrived before a 104 timeout, so a success can still be half an answer');
check('the extra hotels arrive with their prices',
    /extraHotels\.length > 0[\s\S]{0,400}type: 'prices'/.test(ctrl),
    'a hotel arriving in the second wave must be bookable, not a pin with no rate');

// `done` is what stops the spinner, so it has to precede the collecting pass rather than
// wait on it. Where the emit sits in the file is the check.
const donePos = ctrl.indexOf("type: 'done'");
const passPos = ctrl.indexOf('if (!closed && wasTruncated)');
check('done is emitted before the collecting pass runs',
    donePos > 0 && passPos > 0 && donePos < passPos,
    'holding done until the pass finished charged the traveller the whole cost of a wait they had no reason to sit through');
check('done tells the client whether more is coming',
    /collecting: wasTruncated/.test(ctrl),
    'without the flag the client cannot know to keep reading, and the collected hotels are dropped');

// The other half lives in the client: a reader that returns on `done` throws away
// everything sent after it, which is exactly what the reorder relies on.
const page = src2(`src/app/[locale]/search/page.tsx`);
check('the client keeps reading past done while collecting',
    /chunk\.collecting\) return;/.test(page),
    'an unconditional return on done drops every hotel the collecting pass finds');
check('a hotel arriving after done does not revive the spinner',
    /setStatus\(collecting \? 'done' : 'streaming'\)/.test(page),
    'the search is already answered; flipping back to searching makes it look unfinished');

// ── Live ──────────────────────────────────────────────────────────────────────
console.log('\nLive searches');

let reachable = true;
try { await fetch(`${API}/health`); } catch { reachable = false; }

if (!reachable) {
    bad('api-v2 is reachable on :4002', 'start it with: cd cheapestgo-api-v2 && PORT=4002 npm run dev');
} else {
    // The unspaced name goes FIRST, on its own dates.
    //
    // Searching "Da Nang" first would warm OTV for that city, and "Danang" would then look
    // fast whether or not the loose lookup works — the test would pass with the fix removed.
    // Different dates for each, because OTV computes per city AND per stay.
    const unspaced = await search('Danang',  { checkin: '2026-12-04', checkout: '2026-12-05' });
    const spaced   = await search('Da Nang', { checkin: '2026-12-11', checkout: '2026-12-12' });

    check('a name typed without its space still resolves',
        !unspaced.failed && unspaced.count > 0,
        `"Danang" returned ${unspaced.count} hotels in ${unspaced.seconds.toFixed(1)}s`);

    // The real regression this guards: no destination code means the portfolio fetch, the
    // chunked supplier search, a 3s wait and the whole thing again — measured at 40s.
    check('and does not fall into the hotel-code path',
        unspaced.seconds < 30,
        `"Danang" took ${unspaced.seconds.toFixed(1)}s, which is the shape of a missing dest code`);

    check('a spaced city name searches successfully',
        !spaced.failed && spaced.count > 0, `${spaced.seconds.toFixed(1)}s, ${spaced.count} hotels`);

    check('the search answers rather than reporting an outage',
        !unspaced.unanswered, 'an Unanswered Search leaves the catalog on screen with no prices');

    check('pins arrive before prices do',
        unspaced.catalog > 0, 'the catalog wave is what fills the map while the supplier is still working');

    // Only meaningful on a search that was actually truncated. One that finished inside the
    // budget has nothing to collect and correctly ends at done, so there is nothing to assert.
    for (const [name, r] of [['Danang', unspaced], ['Da Nang', spaced]]) {
        if (!r.collecting) continue;
        check(`${name}: the spinner stops before the collecting pass finishes`,
            r.doneSeconds !== null && r.doneSeconds < r.seconds,
            `done at ${r.doneSeconds?.toFixed(1)}s but the stream ran to ${r.seconds.toFixed(1)}s`);
        check(`${name}: hotels really do arrive after done`,
            r.afterDone > 0,
            'collecting was promised but nothing followed it');
    }

    // Reported rather than asserted. A cold search is at OTV's mercy and varies from 5s to
    // 50s; failing on that would make this test noise. It is printed because it is the
    // number that decides whether a first-time visitor waits.
    console.log(`\n  cold-search timings — Danang ${unspaced.seconds.toFixed(1)}s (${unspaced.count} hotels), ` +
                `Da Nang ${spaced.seconds.toFixed(1)}s (${spaced.count} hotels)`);
    if (Math.max(unspaced.seconds, spaced.seconds) > 25) {
        console.log('  \x1b[33m!\x1b[0m a cold search over 25s is OTV finishing after we stopped listening —');
        console.log('    see TGX_SEARCH_TIMEOUT_MS in src/lib/hotels/search.ts');
    }
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
