/**
 * Screenshots of /admin/support at several widths against the LOCAL dev server (:3000) and
 * database, with a conversation open, the details panel, the assign list and the team tally —
 * using a support agent whose display name is a paragraph, which is what broke the layout.
 * Reports whether the page overflows horizontally at each width. Cleans up after itself.
 *
 *   node scratch/shots-support-inbox.mjs
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
const run = crypto.randomUUID().slice(0, 6);
const LOREM = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem.';
const userIds = [];

async function user(role, first, email) {
    const [row] = await sql`
        INSERT INTO users (email, password_hash, role, first_name)
        VALUES (${email}, ${await hash(PASSWORD)}, ${role}, ${first}) RETURNING id`;
    userIds.push(row.id);
    return row.id;
}

try {
    const adminEmail = `shots-admin-${run}@example.test`;
    await user('admin', 'Admin Shots', adminEmail);
    const longAgent = await user('support_agent', LOREM, `shots-lorem-${run}@example.test`);
    await user('support_agent', 'Aida Cruz', `shots-aida-${run}@example.test`);
    const customer = await user('user', 'Customer', `shots-customer-${run}@example.test`);

    const [earlier] = await sql`
        INSERT INTO support_conversations (user_id, source_brand, locale, status, assigned_admin_id)
        VALUES (${customer}, 'CheapestGo', 'en', 'resolved', ${longAgent}) RETURNING id, reference`;
    const [open] = await sql`
        INSERT INTO support_conversations (user_id, source_brand, locale, status, assigned_admin_id)
        VALUES (${customer}, 'CheapestGo', 'en', 'human_active', ${longAgent}) RETURNING id, reference`;
    for (const [sender, body] of [['guest', 'Hello, my hotel booking is not showing in the app.'], ['agent', 'Thanks — I can see it on our side. Let me resend the confirmation now.'], ['guest', 'Great, thank you!']]) {
        await sql`INSERT INTO support_messages (conversation_id, sender_type, sender_admin_id, body)
                  VALUES (${open.id}, ${sender}, ${sender === 'agent' ? longAgent : null}, ${body})`;
    }
    console.log(`open ${open.reference}, earlier ${earlier.reference}`);

    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email: adminEmail, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`login ${login.status}`);
    const cookies = login.headers.getSetCookie().map(c => {
        const [pair] = c.split(';');
        const [name, ...rest] = pair.split('=');
        return { name, value: rest.join('='), url: BASE };
    });

    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    await context.addCookies(cookies);
    const page = await context.newPage();

    for (const width of (process.env.WIDTHS ?? "1920,1366,1024,390").split(",").map(Number)) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${BASE}/admin/support`, { waitUntil: 'networkidle', timeout: 120_000 });
        await page.getByRole('button', { name: 'Assigned', exact: true }).click();
        await page.getByText(open.reference, { exact: true }).first().click();
        await page.getByRole('textbox', { name: /reply to the customer/i }).waitFor();
        await page.waitForTimeout(800);

        // Before opening anything: the conversation alone must not push the page sideways.
        const bare = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const bareFile = path.join(SCRATCH, `inbox-${width}-chat.png`);
        await page.screenshot({ path: bareFile });
        console.log(`${width}px chat — overflows sideways by ${bare}px → ${bareFile}`);

        const details = page.getByRole('button', { name: 'Details', exact: true });
        if (width < 1280 && await details.isVisible()) await details.click();

        const picker = page.getByRole('combobox', { name: /assign to/i });
        await picker.click();
        await page.getByRole('listbox').waitFor();
        await page.waitForTimeout(300);

        const overflow = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        const file = path.join(SCRATCH, `inbox-${width}.png`);
        await page.screenshot({ path: file });
        console.log(`${width}px — page overflows sideways by ${overflow.doc}px → ${file}`);

        await page.keyboard.press('Escape');
    }

    // The team tally, expanded, at a laptop width.
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE}/admin/support`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('button', { name: /team · handled in/i }).click();
    await page.waitForTimeout(400);
    const tallyFile = path.join(SCRATCH, 'tally-1366.png');
    await page.screenshot({ path: tallyFile, clip: { x: 0, y: 0, width: 1366, height: 700 } });
    const tallyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`tally 1366px — overflows by ${tallyOverflow}px → ${tallyFile}`);

    await browser.close();
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(userIds)}::uuid[])`.catch(e => console.error(e.message));
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(userIds)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
