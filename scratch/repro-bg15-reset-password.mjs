/**
 * BG-15 on the LOCAL dev server (:3000): open a real reset-password link at phone size, as
 * someone arriving from the email (no session cookie), in three conditions:
 *   normal        — how long until the form is usable
 *   slow session  — /api/auth/me stalls (a poor mobile connection)
 *   no JavaScript — what the server-rendered page looks like before/without hydration
 * Then, in the normal case, actually reset the password and sign in with it.
 * Screenshots each state. Cleans up its test user.
 *   node scratch/repro-bg15-reset-password.mjs
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

const email = `bg15-${Date.now()}@example.test`;
const NEW_PASSWORD = 'Newpass-2026x';
const PHONE = {
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; V2427) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};
let userId;

const formState = (page) => page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="password"], input#password, input#confirmPassword')];
    const button = document.querySelector('form button[type="submit"]');
    return {
        inputsDisabled: inputs.length ? inputs.every(i => i.disabled) : null,
        buttonShowsSpinner: !!button?.querySelector('.animate-spin'),
        buttonText: button?.innerText.trim() ?? null,
    };
});

try {
    [{ id: userId }] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                 VALUES (${email}, ${await hash('Oldpass-2026x')}, 'user', 'Bg', 'Fifteen') RETURNING id`;
    const token = crypto.randomUUID();
    await sql`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (${userId}, ${token}, now() + interval '1 hour')`;
    const link = `${BASE}/auth/reset-password?token=${token}`;

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

    // ── No JavaScript: the server-rendered page, which is also what shows until hydration.
    {
        const ctx = await browser.newContext({ ...PHONE, javaScriptEnabled: false });
        const page = await ctx.newPage();
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForTimeout(1500);
        console.log('no JavaScript (= before hydration):', await formState(page));
        await page.screenshot({ path: path.join(SCRATCH, 'bg15-nojs.png') });
        await ctx.close();
    }

    // ── Slow session check: /api/auth/me takes 60 s.
    {
        const ctx = await browser.newContext(PHONE);
        const page = await ctx.newPage();
        await page.route('**/api/auth/me', async (route) => { await new Promise(r => setTimeout(r, 60_000)); await route.continue().catch(() => {}); });
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForTimeout(12_000);
        console.log('session check stalled, 12 s in:', await formState(page));
        await page.screenshot({ path: path.join(SCRATCH, 'bg15-slow-session.png') });
        await ctx.close();
    }

    // ── Normal: how long until usable, then really reset.
    {
        const ctx = await browser.newContext(PHONE);
        const page = await ctx.newPage();
        const t0 = Date.now();
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        let state;
        for (let i = 0; i < 60; i++) {
            state = await formState(page);
            if (state.inputsDisabled === false) break;
            await page.waitForTimeout(500);
        }
        console.log(`normal: usable after ${Date.now() - t0} ms`, state);
        // Typed immediately — before hydration on a slow phone — and it must still count.
        await page.locator('#password').fill(NEW_PASSWORD);
        await page.locator('#confirmPassword').fill(NEW_PASSWORD);
        await page.waitForFunction(() => !document.querySelector('form button[type="submit"]')?.hasAttribute('disabled'), null, { timeout: 30_000 })
            .then(() => console.log('  typed-before-hydration password is accepted: button enabled'))
            .catch(() => console.log('  ✗ button still disabled 30 s after typing'));
        const put = page.waitForResponse(r => r.url().includes('/api/auth/reset-password') && r.request().method() === 'PUT', { timeout: 60_000 });
        await page.locator('form button[type="submit"]').click();
        const res = await put;
        console.log('  PUT /api/auth/reset-password →', res.status(), (await res.text()).slice(0, 80));
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SCRATCH, 'bg15-after-reset.png') });
        await ctx.close();
    }
    await browser.close();

    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: NEW_PASSWORD }),
    });
    console.log('sign in with the new password →', login.status);
} finally {
    if (userId) {
        await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`.catch(() => {});
        await sql`DELETE FROM users WHERE id = ${userId}`.catch(e => console.error(e.message));
    }
    await sql.end();
}
