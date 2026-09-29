/**
 * BG-1 smoke against the LOCAL dev server (:3000) and database, in one real browser:
 *   1. account A signs in, has a Booking in progress with details typed into checkout;
 *   2. A signs out through the account menu; account B signs in; B opens /checkout?currency=PHP
 *      → A's details must be gone;
 *   3. A's booking again, then A's session is dropped WITHOUT signing out and B signs in
 *      → still gone;
 *   4. control: booking started signed out, then B signs in → kept (ADR-0027 funnel).
 * Screenshots each checkout. Cleans up its two test users.
 *   node scratch/smoke-bg1-booking-handoff.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });

const PASSWORD = 'Smoke-password-1!';
const run = crypto.randomUUID().slice(0, 6);
const A = `bg1-alice-${run}@example.test`;
const B = `bg1-bob-${run}@example.test`;
const ids = [];
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

async function cookiesFor(email) {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
    return res.headers.getSetCookie().map(c => {
        const [pair] = c.split(';');
        const [name, ...rest] = pair.split('=');
        return { name, value: rest.join('='), url: BASE };
    });
}

/** A hotel booking in progress plus Alice's typed details, as the real flow stores them. */
async function seedAliceBooking(page) {
    await page.evaluate(() => {
        localStorage.setItem('cheapestgo-booking', JSON.stringify({ version: 0, state: {
            property: { id: 'bg1-hotel', name: 'BG-1 Test Hotel', images: [], price: 100, currency: 'PHP', rating: 4 },
            selectedRoom: { id: 'room', offerId: 'TGX:bg1-fake', title: 'Double room', price: 100, currency: 'PHP' },
            checkIn: '2026-10-01T00:00:00.000Z', checkOut: '2026-10-03T00:00:00.000Z', adults: 2, children: 0,
        } }));
        sessionStorage.setItem('hotel-checkout-storage', JSON.stringify({ version: 0, state: {
            formData: { firstName: 'Alice', lastName: 'Anders', email: 'alice-private@example.test', phone: '9171234567',
                guestFirstName: '', guestLastName: '', cardNumber: '', expiry: '', cvc: '', cardCountry: 'PH', cardAddress: '', cardCity: '', cardZip: '', additionalGuests: [], childGuests: [] },
            bookingFor: 'myself', isWorkTravel: false, specialRequests: 'Alice: late check-in', payeeFirstName: '', payeeLastName: '', phoneCountryCode: '+63', selectedCurrency: 'PHP',
        } }));
        sessionStorage.setItem('flightContact', '{"email":"alice-private@example.test"}');
    });
}

async function checkoutShows(page, shot) {
    await page.goto(`${BASE}/checkout?currency=PHP`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(SCRATCH, shot), fullPage: false });
    return page.evaluate(() => ({
        text: document.body.innerText,
        inputs: [...document.querySelectorAll('input,textarea')].map(i => i.value).join(' | '),
        flightContact: sessionStorage.getItem('flightContact'),
    }));
}
const leaksAlice = (s) => /alice-private@example\.test|Alice: late check-in/.test(s.inputs + s.text) || !!s.flightContact;

try {
    for (const [email, first] of [[A, 'Alice'], [B, 'Bob']]) {
        const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                VALUES (${email}, ${await hash(PASSWORD)}, 'user', ${first}, 'Smoke') RETURNING id`;
        ids.push(row.id);
    }

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();

    // ── 1–2: A signs out through the menu, B signs in ────────────────────────
    await context.addCookies(await cookiesFor(A));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(3000);
    await seedAliceBooking(page);
    const asAlice = await checkoutShows(page, 'bg1-1-alice.png');
    check('A sees her own details at checkout (setup is real)', leaksAlice(asAlice));

    await page.getByRole('button', { name: /^AS$|Alice/ }).first().click();
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await context.addCookies(await cookiesFor(B));
    const asBob = await checkoutShows(page, 'bg1-2-bob-after-signout.png');
    check('B does not see A\'s details after A signed out', !leaksAlice(asBob));

    // ── 3: A's session drops without signing out, B signs in ─────────────────
    await context.clearCookies();
    await context.addCookies(await cookiesFor(A));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(3000);
    await seedAliceBooking(page);
    await context.clearCookies();                      // expired session: no sign-out ran
    await context.addCookies(await cookiesFor(B));
    const asBobExpired = await checkoutShows(page, 'bg1-3-bob-after-expiry.png');
    check('B does not see A\'s details after A\'s session simply expired', !leaksAlice(asBobExpired));

    // ── 4: control — started signed out, then B signs in ─────────────────────
    await context.clearCookies();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.evaluate(() => localStorage.removeItem('cheapestgo-booking-owner'));
    await page.waitForTimeout(2000);
    await seedAliceBooking(page);
    await context.addCookies(await cookiesFor(B));
    const funnel = await checkoutShows(page, 'bg1-4-signed-out-then-signin.png');
    check('details typed while signed out are kept for whoever signs in', /alice-private@example\.test/.test(funnel.inputs));

    await browser.close();
} finally {
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
