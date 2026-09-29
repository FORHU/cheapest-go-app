/**
 * BG-12 against the LOCAL dev server (:3000) and database, in one browser:
 *   A signs in → searches a destination → signs out (history off screen) → signs back in
 *   (history returns). Then B signs in on the same browser and must not see A's history.
 * Cleans up its two test users.
 *   node scratch/smoke-bg12-search-history.mjs
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
const A = `bg12-a-${run}@example.test`;
const B = `bg12-b-${run}@example.test`;
const ids = [];
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

try {
    for (const [email, first] of [[A, 'Ann'], [B, 'Ben']]) {
        const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                VALUES (${email}, ${await hash(PASSWORD)}, 'user', ${first}, 'Smoke') RETURNING id`;
        ids.push(row.id);
    }

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

    /**
     * What the picker lists under "Recent Searches". The list only renders while the search
     * box is empty, and choosing a destination leaves its name in there — so clear it first.
     */
    const history = async () => {
        await page.locator(':text-is("Where to?"):visible').first().click();
        await page.waitForTimeout(1200);
        const box = page.getByPlaceholder('Search destinations...').first();
        if (await box.count()) { await box.fill(''); await page.waitForTimeout(1200); }
        const shown = await page.locator(':text-is("Recent Searches"):visible').count() > 0;
        const hakodate = await page.locator(':text-is("Hakodate"):visible').count() > 0;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        return { shown, hakodate };
    };

    const signInThroughForm = async (email) => {
        await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForTimeout(3000);
        await page.locator('input[type="email"]:visible').first().fill(email);
        if (await page.locator('input[type="password"]:visible').count() === 0) {
            await page.locator('button:has-text("Continue"):visible, button:has-text("Next"):visible').first().click();
            await page.waitForTimeout(1500);
        }
        await page.locator('input[type="password"]:visible').first().fill(PASSWORD);
        await page.locator('input[type="password"]:visible').first().press('Enter');
        await page.waitForURL(u => !new URL(u).pathname.startsWith('/login'), { timeout: 60_000 });
        await page.waitForTimeout(4000);
    };

    // A signs in and searches a destination.
    await signInThroughForm(A);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(5000);
    await page.locator(':text-is("Where to?"):visible').first().click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Search destinations...').first().fill('Hakodate');
    await page.waitForTimeout(3500);
    await page.locator(':text-matches("Hakodate", "i"):visible').first().click();
    await page.waitForTimeout(1500);
    const afterSearch = await history();
    check('A sees the destination in Recent Searches', afterSearch.hakodate, JSON.stringify(afterSearch));

    // A signs out through the account menu.
    await page.locator('button:has-text("AS"):visible, [aria-label="Account"]:visible').first().click().catch(async () => {
        await page.locator('header button:visible').last().click();
    });
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Sign out"):visible').first().click();
    await page.waitForTimeout(5000);
    const signedOut = await history();
    check('signed out, the history is off screen', !signedOut.hakodate, JSON.stringify(signedOut));

    // A signs back in — it comes back.
    await signInThroughForm(A);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(5000);
    const backAgain = await history();
    check('A signs back in and the history is back', backAgain.hakodate, JSON.stringify(backAgain));

    // B signs in on the same browser — nothing of A's.
    await page.locator('button:has-text("AS"):visible, [aria-label="Account"]:visible').first().click().catch(async () => {
        await page.locator('header button:visible').last().click();
    });
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Sign out"):visible').first().click();
    await page.waitForTimeout(4000);
    await signInThroughForm(B);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(5000);
    const asB = await history();
    check('B does not see A\'s history', !asB.hakodate, JSON.stringify(asB));

    await page.screenshot({ path: path.join(SCRATCH, 'bg12-history.png'), clip: { x: 0, y: 0, width: 1366, height: 700 } });
    await browser.close();
} finally {
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
