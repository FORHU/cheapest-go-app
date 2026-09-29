/**
 * BG-7 smoke against the LOCAL dev server (:3000) and database: signed out on a search page,
 * click a "Save to wishlist" heart → /login must carry next=<that page>; sign in there →
 * back on that page, and the item is saved. Cleans up its test user.
 *   node scratch/smoke-bg7-wishlist-login.mjs
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
const email = `bg7-${crypto.randomUUID().slice(0, 6)}@example.test`;
let userId;
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

try {
    [{ id: userId }] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                 VALUES (${email}, ${await hash(PASSWORD)}, 'user', 'Bg', 'Seven') RETURNING id`;

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

    // Run from a page other than home too: FROM=/trips node scratch/smoke-bg7-wishlist-login.mjs
    const from = process.env.FROM ?? '/';
    await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(6000);
    const heart = page.getByRole('button', { name: 'Save to wishlist' }).first();
    await heart.scrollIntoViewIfNeeded({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await heart.click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    const loginUrl = new URL(page.url());
    console.log('  login url:', loginUrl.pathname + loginUrl.search);
    const pending = await page.evaluate(() => sessionStorage.getItem('cheapestgo-pending-save'));
    check('the heart remembered what to save', !!pending, pending ?? '');
    // Home is the one page loginUrlFor leaves unnamed, because /login returns there by default.
    check('/login carries next=, or the heart was on the home page', loginUrl.searchParams.has('next') || from === '/', loginUrl.search || `(from ${from})`);

    await page.locator('input[type="email"]').first().fill(email);
    if (await page.locator('input[type="password"]').count() === 0) {
        await page.getByRole('button', { name: /continue|next/i }).first().click();
    }
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('input[type="password"]').first().press('Enter');
    await page.waitForURL(u => !new URL(u).pathname.startsWith('/login'), { timeout: 60_000 });
    console.log('  back on:', new URL(page.url()).pathname);
    await page.waitForTimeout(8000);

    const [row] = await sql`SELECT deep_link FROM saved_trips WHERE user_id = ${userId} LIMIT 1`.catch(() => [undefined]);
    check('the item was saved after signing in', !!row && row.deep_link === pending, row?.deep_link ?? 'nothing saved');
    const stillPending = await page.evaluate(() => sessionStorage.getItem('cheapestgo-pending-save'));
    check('the pending save was used up', stillPending === null);
    await page.screenshot({ path: path.join(SCRATCH, 'bg7-after-login.png') });
    await browser.close();
} finally {
    if (userId) {
        await sql`DELETE FROM saved_trips WHERE user_id = ${userId}`.catch(() => {});
        await sql`DELETE FROM users WHERE id = ${userId}`.catch(e => console.error(e.message));
    }
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
