/**
 * C6 (ops) against a running api-v2 on :4000.
 *
 * The four routes ported from v1: the catalog seeders and the two internal flight refreshers.
 * Every one of them is a door into supplier accounts, so the first thing checked is that it is
 * locked; then the cheap end-to-end — one hotel's room content, which reads from ETG and writes
 * to v2's own catalog.
 *
 * Deliberately does not exercise the full ETG dump (hundreds of megabytes) or place any booking:
 * hotel bookings run against the live OTV API and are never made to satisfy a test.
 *
 *   node scratch/smoke-v2-c6-ops.mjs
 */
import fs from 'fs';

const API = 'http://localhost:4000';
const env = fs.readFileSync('C:/Users/USER/Documents/GitHub/cheapestgo-api-v2/.env', 'utf8');
const read = (key) => env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '');

const CRON = read('CRON_SECRET');
const FUNCTIONS = read('FUNCTIONS_SECRET');

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const get = (path, token) => fetch(`${API}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
const post = (path, token, body) => fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
});

// ── Locked first. A cron route open to the internet is a supplier account open to the internet.
for (const path of ['/api/v2/cron/seed-room-groups', '/api/v2/cron/etg-dump-sync']) {
    const res = await get(path);
    check(`${path} refuses an unauthenticated caller`, res.status === 401, String(res.status));
}
for (const [path, method] of [['/api/internal/cheapest-flight', 'GET'], ['/api/internal/refresh-flights', 'POST']]) {
    const res = method === 'GET' ? await get(path) : await post(path);
    check(`${path} refuses an unauthenticated caller`, res.status === 401, String(res.status));
}

// ── Present at all: a wrong path would 404 rather than 401, which is how a route that was
//    never mounted looks from outside.
const withBadSecret = await get('/api/v2/cron/seed-room-groups', 'not-the-secret');
check('a wrong secret is refused, not ignored', withBadSecret.status === 401, String(withBadSecret.status));

// ── One hotel's room content, end to end: ETG read, catalog write.
if (!CRON) {
    check('CRON_SECRET is configured locally', false, 'not found in api-v2/.env — seeding not exercised');
} else {
    const seeded = await get('/api/v2/cron/seed-room-groups?batch=1', CRON);
    const body = await seeded.json().catch(() => ({}));
    check('the room-group seeder runs', seeded.ok, JSON.stringify(body).slice(0, 120));
    check('it reports what it did', typeof body.considered === 'number', JSON.stringify(body).slice(0, 120));
}

// ── The internal refreshers answer their contract. No booking is created by either.
if (!FUNCTIONS) {
    check('FUNCTIONS_SECRET is configured locally', false, 'not found in api-v2/.env');
} else {
    const missingParams = await get('/api/internal/cheapest-flight', FUNCTIONS);
    check('cheapest-flight refuses a request with no route', missingParams.status === 400, String(missingParams.status));

    const badRefresh = await post('/api/internal/refresh-flights', FUNCTIONS, { origin: 'MNL' });
    check('refresh-flights refuses an incomplete route', badRefresh.status === 400, String(badRefresh.status));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
