/**
 * "On some pages the language or price switcher does nothing." Drive both from the navbar on
 * every main page of the LOCAL dev server (:3000) and report what actually changed.
 *
 * Language: switch to 한국어, then count Hangul characters on the page before and after.
 * Currency: switch to PHP, then count ₱ and $ before and after.
 *
 *   node scratch/audit-switchers.mjs
 */
import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';
const WAIT = Number(process.env.WAIT ?? 7000);   // dev recompiles can outlast a short wait
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PAGES = [
    ['home', '/'],
    ['deals', '/deals'],
    ['hotel results', `/search?destination=Seoul&countryCode=KR&checkIn=${inDays(21)}&checkOut=${inDays(23)}&adults=2&rooms=1`],
    ['flight results', '/flights/search?origin=MNL&destination=ICN&cabin=economy'],
    ['property', '/property/10557683'],
    ['trips', '/trips'],
    ['account', '/account'],
    ['help', '/help'],
];

const stats = (page) => page.evaluate(() => {
    const t = document.body.innerText;
    return {
        hangul: (t.match(/[가-힣]/g) ?? []).length,
        peso: (t.match(/₱/g) ?? []).length,
        dollar: (t.match(/\$/g) ?? []).length,
        len: t.length,
    };
});

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();

// Trips and account need a signed-in customer (a throwaway local one, removed at the end).
const dbUrl = fs.readFileSync('.env', 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 1 });
const email = `switchers-${Date.now()}@example.test`;
const [u] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (${email}, ${await hash('Smoke-password-1!')}, 'user', 'Sam', 'Switch') RETURNING id`;
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE }, body: JSON.stringify({ email, password: 'Smoke-password-1!' }) });
await context.addCookies(login.headers.getSetCookie().map(c => { const [pair] = c.split(';'); const [name, ...rest] = pair.split('='); return { name, value: rest.join('='), url: BASE }; }));

for (const [label, url] of PAGES) {
    if (ONLY && !ONLY.test(label)) continue;
    try {
        // Always start from English + USD.
        await context.addCookies([{ name: 'locale', value: 'en', url: BASE }]);
        await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForTimeout(WAIT + 2000);
        const before = await stats(page);

        // ── Language: navbar → 한국어
        let langNote = '';
        const clickish = async (locator) => {
            try { await locator.click({ timeout: 6000 }); }
            catch (e) {
                const blocker = (e.message.match(/<[^>]+> (?:from .+? )?subtree intercepts pointer events/) ?? [''])[0];
                if (blocker) langNote += ` [blocked by ${blocker.slice(0, 90)}]`;
                await locator.click({ timeout: 6000, force: true });
            }
        };
        try {
            await clickish(page.locator('header button').filter({ hasText: /^(US|KR|CN|JP)\s*(EN|KO|ZH|JA)$/ }).first());
            await page.waitForTimeout(800);
            await clickish(page.locator('[data-slot="dropdown-menu-item"]:visible', { hasText: /한국어/ }).first());
            await page.waitForTimeout(WAIT);
        } catch (e) { langNote += ` (switcher: ${e.message.split('\n')[0].slice(0, 60)})`; }
        const afterLang = await stats(page);

        // ── Currency: navbar → PHP
        let curNote = '';
        try {
            await clickish(page.locator('header button').filter({ hasText: /USD|KRW|PHP|JPY|CNY/ }).first());
            await page.waitForTimeout(800);
            await clickish(page.locator('[data-slot="dropdown-menu-item"]:visible', { hasText: afterLang.peso > 0 ? /USD/ : /PHP/ }).first());
            await page.waitForTimeout(WAIT);
        } catch (e) { curNote = ` (switcher: ${e.message.split('\n')[0].slice(0, 60)})`; }
        const afterCur = await stats(page);

        const langChanged = afterLang.hangul > before.hangul + 5;
        const curChanged = afterLang.peso > 0 ? (afterCur.dollar > 0 && afterCur.peso < afterLang.peso) : (afterCur.peso > afterLang.peso);
        const hadPrices = afterLang.dollar > 0 || afterLang.peso > 0;
        console.log(
            `${langChanged ? '✓' : '✗'} language  ${curChanged ? '✓' : hadPrices ? '✗' : '–'} price   ${label}` +
            `   [hangul ${before.hangul}→${afterLang.hangul}; $ ${afterLang.dollar}→${afterCur.dollar}; ₱ ${afterLang.peso}→${afterCur.peso}]${langNote}${curNote}`,
        );
    } catch (e) {
        console.log(`·  ${label}: ${e.message.split('\n')[0].slice(0, 80)}`);
    }
}
await browser.close();
await sql`DELETE FROM users WHERE id = ${u.id}`;
await sql.end();
