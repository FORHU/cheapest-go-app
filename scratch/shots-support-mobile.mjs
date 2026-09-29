/**
 * At phone width, open Support from the bottom bar's Profile drawer against the LOCAL dev
 * server (:3000) and database, then check that nothing sits on top of the message box — the
 * bottom nav used to. Screenshots before/after. Cleans up its test customer.
 *
 *   node scratch/shots-support-mobile.mjs
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
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });

const PASSWORD = 'Shots-password-1!';
const email = `shots-mobile-${crypto.randomUUID().slice(0, 6)}@example.test`;
let userId;

try {
    [{ id: userId }] = await sql`
        INSERT INTO users (email, password_hash, role, first_name)
        VALUES (${email}, ${await hash(PASSWORD)}, 'user', 'Mobile') RETURNING id`;

    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`login ${login.status}`);
    const cookies = login.headers.getSetCookie().map(c => {
        const [pair] = c.split(';');
        const [name, ...rest] = pair.split('=');
        return { name, value: rest.join('='), url: BASE };
    });

    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await context.addCookies(cookies);
    const page = await context.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 180_000 });
    await page.getByRole('button', { name: /profile/i }).last().click();
    await page.getByRole('button', { name: /^support$/i }).last().click();
    const box = page.getByRole('textbox', { name: /type a message|message/i });
    await box.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);

    const file = path.join(SCRATCH, 'support-mobile-390.png');
    await page.screenshot({ path: file });

    // What is actually on top at the middle of the message box? It should be the box itself.
    const covered = await box.evaluate(el => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { onTop: top === el || el.contains(top), topTag: top?.outerHTML.slice(0, 120), rect: [r.top, r.bottom] };
    });
    console.log('message box on top:', covered.onTop, covered.rect, covered.onTop ? '' : covered.topTag);
    await box.fill('안녕하세요');
    console.log('typed value:', await box.inputValue());
    console.log('→', file);

    // Close support: the nav should come back.
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: /support/i }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    console.log('nav visible after close:', await page.getByRole('button', { name: /profile/i }).last().isVisible());

    await browser.close();
} finally {
    if (userId) {
        await sql`DELETE FROM support_conversations WHERE user_id = ${userId}`.catch(e => console.error(e.message));
        await sql`DELETE FROM users WHERE id = ${userId}`.catch(e => console.error(e.message));
    }
    await sql.end();
}
