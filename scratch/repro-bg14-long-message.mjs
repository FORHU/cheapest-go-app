/**
 * BG-14 against the LOCAL dev server (:3000) and database: a customer pastes 5,000 characters
 * into the Support chat and presses send. Reports what the box kept, what the POST returned
 * and how long it took, and whether the page's main thread stayed responsive (a frozen tab
 * cannot answer a trivial evaluate). Cleans up its test user and chat.
 *   node scratch/repro-bg14-long-message.mjs
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
const email = `bg14-${crypto.randomUUID().slice(0, 6)}@example.test`;
const LONG = ('Lorem ipsum dolor sit amet, consectetuer adipiscing elit. ').repeat(90).slice(0, 5000);
let userId;

/** Resolves within ~ms if the main thread is free; a frozen tab times out. */
async function responsive(page, label) {
    const t = Date.now();
    const ok = await Promise.race([
        page.evaluate(() => 1).then(() => true),
        new Promise(r => setTimeout(() => r(false), 5000)),
    ]);
    console.log(`  ${label}: main thread ${ok ? `responsive (${Date.now() - t} ms)` : 'FROZEN (no answer in 5 s)'}`);
    return ok;
}

try {
    [{ id: userId }] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                 VALUES (${email}, ${await hash(PASSWORD)}, 'user', 'Bg', 'Fourteen') RETURNING id`;
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`login failed: ${login.status} ${(await login.text()).slice(0, 120)}`);
    const cookies = login.headers.getSetCookie().map(c => { const [pair] = c.split(';'); const [name, ...rest] = pair.split('='); return { name, value: rest.join('='), url: BASE }; });

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(cookies);
    const page = await context.newPage();
    page.on('response', async (res) => {
        if (res.url().includes('/api/support/conversation/messages') && res.request().method() === 'POST') {
            let body = ''; try { body = (await res.text()).slice(0, 160); } catch {}
            console.log(`  POST messages → ${res.status()} ${body}`);
        }
    });
    page.on('pageerror', e => console.log('  pageerror:', e.message.slice(0, 160)));

    page.on('console', m => { if (m.type() === 'error') console.log('  console error:', m.text().slice(0, 160)); });
    const meSeen = page.waitForResponse(r => r.url().includes('/api/auth/me'), { timeout: 180_000 }).catch(() => null);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const me = await meSeen;
    console.log('  /api/auth/me in the browser →', me?.status() ?? '(never called)');
    await page.waitForTimeout(4000);
    // Open Support the way a customer does: account menu → Support.
    const headerButtons = await page.evaluate(() => [...document.querySelectorAll('header button')].map(b => `${JSON.stringify(b.innerText.trim())}${b.offsetParent ? '' : '(hidden)'}`));
    console.log('  header buttons:', headerButtons.join(', '));
    // Support lives in the account menu (desktop): the avatar button carries the initials.
    await page.locator('header button:visible').filter({ hasText: /^[A-Z]{1,2}\s*$/ }).first().click({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.locator('button:has-text("Support"):visible').first().click();
    const box = page.getByRole('textbox', { name: /type a message|message/i }).first();
    await box.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2500);

    // Paste, as QA did.
    await box.click();
    await page.evaluate((text) => navigator.clipboard?.writeText?.(text).catch(() => {}), LONG).catch(() => {});
    await box.fill(LONG);
    const kept = (await box.inputValue()).length;
    console.log(`  pasted ${LONG.length} characters; the box kept ${kept}`);
    await responsive(page, 'after paste');

    const t0 = Date.now();
    await page.getByRole('button', { name: /send/i }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    await responsive(page, 'right after send');
    await page.waitForTimeout(12_000);
    await responsive(page, '13 s after send');
    const shot = path.join(SCRATCH, 'bg14-after-send.png');
    await page.screenshot({ path: shot, timeout: 15_000 }).catch(e => console.log('  screenshot failed:', e.message.slice(0, 80)));
    console.log(`  elapsed ${Date.now() - t0} ms → ${shot}`);

    const [stored] = await sql`
        SELECT length(m.body)::int AS len, m.translation_status
        FROM support_messages m JOIN support_conversations c ON c.id = m.conversation_id
        WHERE c.user_id = ${userId} ORDER BY m.created_at DESC LIMIT 1`;
    console.log('  stored message:', stored ?? '(none)');
    await browser.close();
} finally {
    if (userId) {
        await sql`DELETE FROM support_conversations WHERE user_id = ${userId}`.catch(e => console.error(e.message));
        await sql`DELETE FROM users WHERE id = ${userId}`.catch(e => console.error(e.message));
    }
    await sql.end();
}
