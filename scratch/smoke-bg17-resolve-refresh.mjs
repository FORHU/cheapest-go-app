/**
 * BG-17 end to end on the LOCAL dev server (:3000) and database:
 *   customer opens Support and sends a message → an admin resolves the chat through the real
 *   API → the customer's open widget, untouched, must refresh by itself: their message gone
 *   from the transcript, "Previous conversation CS-…" offered, and a box they can type in.
 *   Then they send again and it lands in a new chat, the old one reachable from history.
 * Cleans up its users and chats.
 *   node scratch/smoke-bg17-resolve-refresh.mjs
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
const run = Date.now();
const ids = [];
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

async function user(role, first, last, email) {
    const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                            VALUES (${email}, ${await hash('Smoke-password-1!')}, ${role}, ${first}, ${last}) RETURNING id`;
    ids.push(row.id);
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    if (!login.ok) throw new Error(`login ${email}: ${login.status}`);
    return { id: row.id, setCookies: login.headers.getSetCookie() };
}

try {
    const customer = await user('user', 'Bea', 'Seventeen', `bg17-c-${run}@example.test`);
    const admin = await user('admin', 'Ada', 'Admin', `bg17-a-${run}@example.test`);
    const adminCookie = admin.setCookies.map(c => c.split(';')[0]).join('; ');

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(customer.setCookies.map(c => { const [pair] = c.split(';'); const [name, ...rest] = pair.split('='); return { name, value: rest.join('='), url: BASE }; }));
    const page = await context.newPage();

    const meSeen = page.waitForResponse(r => r.url().includes('/api/auth/me'), { timeout: 180_000 }).catch(() => null);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await meSeen;
    await page.waitForTimeout(3000);

    // Open Support the customer's way: account menu → Support.
    await page.getByRole('button', { name: /^BS$/ }).first().click({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.locator('button:has-text("Support"):visible').first().click();
    const box = page.getByRole('textbox', { name: /type a message|message/i }).first();
    await box.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => {
        const input = document.querySelector('input[aria-label]');
        return input && !input.hasAttribute('disabled');
    }, null, { timeout: 30_000 });

    const FIRST = `My hotel voucher is missing (${run})`;
    await box.fill(FIRST);
    await box.press('Enter');
    await page.getByText(FIRST).first().waitFor({ timeout: 30_000 });

    const [conv] = await sql`SELECT id, reference FROM support_conversations WHERE user_id = ${customer.id} ORDER BY created_at DESC LIMIT 1`;
    check('the customer\'s message started a chat', !!conv, conv?.reference);

    // The team resolves it — through the real route, not the database.
    const resolve = await fetch(`${BASE}/api/admin/support/conversations/${conv.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: adminCookie },
        body: '{}',
    });
    check('the admin resolved it', resolve.ok, String(resolve.status));

    // No reload, no typing: the widget must refresh on its own.
    const previousLink = page.getByRole('button', { name: new RegExp(`Previous conversation ${conv.reference}`) });
    const refreshed = await previousLink.waitFor({ timeout: 20_000 }).then(() => true, () => false);
    check('the widget refreshed by itself and offers the resolved chat as a previous conversation', refreshed);
    // The history list and the new chat load separately; give the second a moment to land.
    const cleared = await page.waitForFunction(t => !document.body.innerText.includes(t), FIRST, { timeout: 10_000 }).then(() => true, () => false);
    check('the finished chat\'s message is no longer in the current transcript', cleared);
    const enabled = await box.isEnabled().catch(() => false);
    check('the customer can type straight away', enabled);
    await page.screenshot({ path: path.join(SCRATCH, 'bg17-after-resolve.png') });

    // Start another convo.
    const SECOND = `Another question about my flight (${run})`;
    await box.fill(SECOND);
    await box.press('Enter');
    await page.getByText(SECOND).first().waitFor({ timeout: 30_000 });
    const chats = await sql`SELECT reference, status FROM support_conversations WHERE user_id = ${customer.id} ORDER BY created_at`;
    check('the new message is in a new chat, the old one stays resolved', chats.length === 2 && chats[0].status === 'resolved' && chats[1].status !== 'resolved',
        chats.map(c => `${c.reference}:${c.status}`).join(', '));

    // The previous conversation still opens, with its message.
    await previousLink.click();
    const oldVisible = await page.getByText(FIRST).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
    check('the previous conversation opens with its message', oldVisible);

    await browser.close();
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(ids)}::uuid[])`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
