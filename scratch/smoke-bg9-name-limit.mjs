/**
 * BG-9 smoke against the LOCAL dev server (:3000) and database: the profile API and the
 * sign-up API must both refuse a name longer than 30 characters, and accept one of 30.
 * Also drives the profile form in a browser to confirm the field itself stops at 30.
 * Cleans up its test user.
 *   node scratch/smoke-bg9-name-limit.mjs
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
const email = `bg9-${run}@example.test`;
const LOREM = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor.';
let userId;
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

const json = (res, body) => ({ status: res.status, error: body?.error, user: body?.user });

try {
    [{ id: userId }] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                 VALUES (${email}, ${await hash(PASSWORD)}, 'user', 'Bg', 'Nine') RETURNING id`;

    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    const setCookies = login.headers.getSetCookie();
    const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
    const patch = (body) => fetch(`${BASE}/api/account/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: cookieHeader },
        body: JSON.stringify(body),
    }).then(async r => json(r, await r.json().catch(() => null)));

    const long = await patch({ firstName: LOREM, lastName: 'Cruz' });
    check('profile API refuses a 91-character first name', long.status === 400, `${long.status} ${long.error ?? ''}`);

    const exact = await patch({ firstName: 'a'.repeat(30), lastName: 'b'.repeat(30) });
    check('profile API accepts 30 characters', exact.status === 200, `${exact.status} ${exact.error ?? ''}`);

    const [stored] = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
    check('nothing longer than 30 reached the database', stored.first_name.length === 30 && stored.last_name.length === 30,
        `${stored.first_name.length}/${stored.last_name.length}`);

    const signup = await fetch(`${BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email: `bg9b-${run}@example.test`, password: 'Password1', firstName: LOREM, lastName: 'Cruz', birthDate: '1990-05-04' }),
    });
    const signupBody = await signup.json().catch(() => null);
    check('sign-up API refuses a long first name', signup.status === 400, `${signup.status} ${signupBody?.error ?? ''}`);
    const [leaked] = await sql`SELECT id FROM users WHERE email = ${`bg9b-${run}@example.test`}`;
    check('no account was created by that attempt', !leaked);

    // The field itself: typing 91 characters must leave 30.
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(setCookies.map(c => {
        const [pair] = c.split(';');
        const [name, ...rest] = pair.split('=');
        return { name, value: rest.join('='), url: BASE };
    }));
    const page = await context.newPage();
    await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(5000);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    const first = page.locator('input[type="text"]').first();
    await first.fill('');
    await first.type(LOREM, { delay: 0 });
    const typed = await first.inputValue();
    check('the profile field stops at 30 characters', typed.length === 30, `kept ${typed.length}: "${typed}"`);
    await page.screenshot({ path: path.join(SCRATCH, 'bg9-profile-field.png'), clip: { x: 0, y: 0, width: 1280, height: 600 } });
    await browser.close();
} finally {
    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`.catch(e => console.error(e.message));
    await sql`DELETE FROM users WHERE email = ${`bg9b-${run}@example.test`}`.catch(() => {});
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
