#!/usr/bin/env node
/**
 * C7 — the confirmation a customer is owed, and the receipt they can download.
 *
 * Checks the two things v2 was missing outright: a booking that sends no email at all, and a
 * receipt link that only worked for whoever was signed in. Read-only against the running
 * api-v2 and its local database — it books nothing (hotel bookings hit the live supplier).
 *
 *   node scratch/smoke-v2-c7-email.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const API   = process.env.API_V2 ?? 'http://localhost:4000/api/v2';
const V2     = 'C:/Users/USER/Documents/GitHub/cheapestgo-api-v2';
const PGC    = 'cheapestgo-api-v2-postgres-1';

let pass = 0, fail = 0;
const ok  = (name) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); };
const bad = (name, detail) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`); };
const check = (name, cond, detail = '') => cond ? ok(name) : bad(name, detail);

const src = (p) => existsSync(`${V2}/${p}`) ? readFileSync(`${V2}/${p}`, 'utf8') : '';
const psql = (sql) => execFileSync('docker', ['exec', PGC, 'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', sql], { encoding: 'utf8' }).trim();

console.log('\n\x1b[1mC7 — confirmation email + receipt\x1b[0m\n');

// ── The email exists at all ───────────────────────────────────────────────────
console.log('Sending machinery');

check('a send module exists', !!src('src/lib/email/send.ts'), 'src/lib/email/send.ts is missing');
check('templates are pure (no prisma import)',
    !src('src/lib/email/templates.ts').includes("from '@/lib/prisma'"),
    'templates.ts reaches the database — it cannot be rendered in a test');
check('every send is deduplicated by email_logs',
    src('src/lib/email/send.ts').includes('email_logs.findFirst'),
    'no read of email_logs before sending');
check('a failed send keeps its HTML for the retry job',
    src('src/lib/email/send.ts').includes('htmlBody: p.html'),
    'a failed send leaves nothing for /api/internal/retry-emails to re-send');
check('the from-address is the brand the customer used',
    src('src/lib/email/send.ts').includes('fromNoReply()'),
    'a literal from-address would sign AirangGo mail as CheapestGo');

// ── Wired to the paths that make a booking real ───────────────────────────────
console.log('\nWired to the booking paths');

check('a confirmed hotel booking sends a confirmation',
    src('src/services/hotels.service.ts').includes('buildHotelConfirmationHtml'),
    'confirmBooking never sends anything');
check('a created flight booking sends a confirmation',
    src('src/routes/internal.route.ts').includes('sendFlightConfirmationEmail'),
    'create-booking never sends anything');
check('the ticket webhook keeps the "ticket on the way" promise',
    src('src/routes/webhooks.route.ts').includes('sendFlightConfirmationEmail'),
    'a booking that is ticketed later is never told');
check('the flight email reads the booking rather than trusting a caller',
    src('src/lib/email/flightConfirmation.ts').includes('flight_bookings.findUnique'),
    'the itinerary is passed in, so it can disagree with what was ticketed');
check('the client-triggered /email route is gone',
    !existsSync(`${V2}/src/routes/email.route.ts`),
    'a second, client-driven send path still exists — this is what double-sent in v1');

// ── The database backs the dedup ──────────────────────────────────────────────
console.log('\nDatabase');

const idx = psql("SELECT indexdef FROM pg_indexes WHERE tablename='email_logs' AND indexname='email_logs_booking_type_unsent_uniq';");
check('a partial unique index settles the dedup race', idx.includes('UNIQUE'),
    'email_logs has no unique index — two callers can both pass the pre-check');
check('the index does not block a legitimate retry after a failure',
    idx.includes("'sent'") && idx.includes("'queued'") && !idx.includes("'failed'"),
    'a failed send would be unable to be retried');

// ── The receipt answers to the link ───────────────────────────────────────────
console.log('\nReceipt (ADR-0027)');

const hotelId  = psql('SELECT id FROM bookings LIMIT 1;');
const flightId = psql('SELECT id FROM flight_bookings WHERE pnr IS NOT NULL LIMIT 1;');
const ref      = psql('SELECT booking_id FROM bookings WHERE booking_id IS NOT NULL LIMIT 1;');
const pnr      = psql('SELECT pnr FROM flight_bookings WHERE pnr IS NOT NULL LIMIT 1;');

const get = async (path) => {
    const res = await fetch(`${API}${path}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get('content-type') ?? '', magic: buf.subarray(0, 4).toString('latin1') };
};

if (!hotelId || !flightId) {
    bad('a booking to test the receipt against', 'the local database has no bookings');
} else {
    const h = await get(`/invoices/${hotelId}/pdf?type=hotel`);
    check('a hotel receipt opens with no session at all', h.status === 200 && h.magic === '%PDF',
        `got ${h.status} ${h.type}`);

    const f = await get(`/invoices/${flightId}/pdf?type=flight`);
    check('a flight receipt opens with no session at all', f.status === 200 && f.magic === '%PDF',
        `got ${f.status} ${f.type}`);

    const byRef = await get(`/invoices/${ref}/pdf?type=hotel`);
    check('the supplier reference is not a second way in', byRef.status === 404,
        `booking_id lookup returned ${byRef.status} — a guessable reference reaches the same data`);

    const byPnr = await get(`/invoices/${pnr}/pdf?type=flight`);
    check('the PNR is not a second way in', byPnr.status === 404,
        `pnr lookup returned ${byPnr.status} — six characters off a luggage tag reaches the receipt`);

    const junk = await get('/invoices/not-a-uuid/pdf?type=hotel');
    check('a non-UUID is refused outright', junk.status === 404, `got ${junk.status}`);
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
