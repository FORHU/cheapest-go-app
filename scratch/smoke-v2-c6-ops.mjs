#!/usr/bin/env node
/**
 * C6 — the jobs that watch the money, and the cancel that actually cancels.
 *
 * Read-only against the running api-v2. The reconcilers report and notify; neither repairs
 * anything, and nothing here books, cancels or refunds.
 *
 *   node scratch/smoke-v2-c6-ops.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const API = process.env.API_V2 ?? 'http://localhost:4000/api/v2';
const V2  = 'C:/Users/USER/Documents/GitHub/cheapestgo-api-v2';

let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };
const check = (n, c, d = '') => c ? ok(n) : bad(n, d);

const src = (p) => existsSync(`${V2}/${p}`) ? readFileSync(`${V2}/${p}`, 'utf8') : '';

const secret = (readFileSync(`${V2}/.env`, 'utf8').match(/^CRON_SECRET=(.*)$/m) ?? [])[1]?.trim();
const cron = async (path) => {
    const res = await fetch(`${API}/cron/${path}`, { headers: { Authorization: `Bearer ${secret}` } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};

console.log('\n\x1b[1mC6 — ops\x1b[0m\n');

// ── Reconcilers ───────────────────────────────────────────────────────────────
console.log('Reconciliation');

const noAuth = await fetch(`${API}/cron/hotel-reconciliation`);
check('a reconciler refuses an unauthenticated caller', noAuth.status === 401, `got ${noAuth.status}`);

const hotel = await cron('hotel-reconciliation');
check('unrecorded reservations are looked for', hotel.status === 200 && hotel.body.success === true,
    `got ${hotel.status} ${JSON.stringify(hotel.body).slice(0, 160)}`);
check('the run reports what it scanned, not just what it found',
    typeof hotel.body.scanned === 'number' && typeof hotel.body.unrecorded === 'number',
    'a run that found nothing is indistinguishable from one that did not look');

const cost = await cron('platform-cost-reconciliation');
check('platform cost is reconciled for a closed month', cost.status === 200 && cost.body.success === true,
    `got ${cost.status}`);
check('it reports the Stripe rate it charged against',
    cost.body.stripeRateConfigured === 0.044,
    `stripeRateConfigured=${cost.body.stripeRateConfigured} — the measured rate is 4.4%, not the 2.9% headline`);
check('it says what makes its own numbers soft',
    Array.isArray(cost.body.caveats),
    'no caveats field — a figure with no stated weaknesses reads as more certain than it is');
check('it does not report a cancellation rate off too few orders',
    cost.body.orders >= 20 || cost.body.cancellationRate === null,
    `orders=${cost.body.orders} rate=${cost.body.cancellationRate}`);

// ── The credit check compares like with like ──────────────────────────────────
console.log('\nOTV credit');

const credit = await cron('otv-credit-check');
check('the credit check runs', credit.status === 200, `got ${credit.status}`);

const creditSrc = src('src/routes/cron.route.ts');
check('outstanding credit is summed over what the supplier is owed',
    /SUM\(COALESCE\(supplier_cost, 0\)\)/.test(creditSrc),
    'still summing total_price — that is the guest price, markup included, in mixed currencies');
check('the limit is converted into the same currency before comparing',
    creditSrc.includes('CREDIT_LIMIT_CURRENCY') && creditSrc.includes('SUPPLIER_COST_CURRENCY'),
    'a 600,000 PHP line read as $600,000 means the alert can never fire');
check('a limit that cannot be converted is announced, not skipped quietly',
    creditSrc.includes('OTV credit check could not run'),
    'a skipped check looks identical to a healthy one');

// ── Cancellation addresses the booking the way OTV accepts ────────────────────
console.log('\nCancellation reference (OTV)');

const tgx = src('src/lib/hotels/travelgatex.ts');
const clientIdx   = tgx.indexOf("label: 'client'");
const supplierIdx = tgx.indexOf("label: 'supplier'");
check('the client reference is tried first',
    clientIdx > 0 && supplierIdx > clientIdx,
    'supplier-first — OTV answers that with "Request not accepted by supplier"');
check('the supplier reference remains as a fallback', supplierIdx > 0,
    'dropping it entirely loses the only route for a booking with no client reference');

// ── The FX backfill the revenue figures assume ────────────────────────────────
console.log('\nFX backfill');

check('a backfill exists for rows lockFx could not price',
    existsSync(`${V2}/src/scripts/backfill-booking-fx.ts`),
    'rows with a null usd_amount are excluded from every blended total, permanently');
check('it is a dry run unless told otherwise',
    src('src/scripts/backfill-booking-fx.ts').includes("includes('--apply')"),
    'a backfill that writes by default is one nobody can inspect first');

const dump = execFileSync('node', ['-e', 'console.log(require("' + V2 + '/package.json").scripts["backfill-booking-fx"] ?? "")'], { encoding: 'utf8' }).trim();
check('it is runnable as a named script', dump.includes('backfill-booking-fx.ts'), `package.json script: "${dump}"`);

// ── Scheduled, not merely written ─────────────────────────────────────────────
console.log('\nSchedule');

const crontab = src('docker/cron/crontab');
for (const job of ['hotel-reconciliation', 'platform-cost-reconciliation', 'etg-dump-sync', 'seed-room-groups']) {
    check(`${job} is actually scheduled`, crontab.includes(job),
        'the route exists and nothing calls it — which is how it stands in v1');
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
