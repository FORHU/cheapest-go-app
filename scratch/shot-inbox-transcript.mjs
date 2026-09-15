/**
 * Screenshots the admin inbox transcript on the LOCAL dev server (:3000) with a seeded chat
 * that has both sides, two different staff authors, a translation, a failed translation, a
 * system notice and a four-hour gap — the cases the messenger layout has to hold.
 * Cleans up its users and chats.
 *   node scratch/shot-inbox-transcript.mjs
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

async function user(role, first, last) {
    const email = `shot-${role}-${run}-${Math.random().toString(36).slice(2, 7)}@example.test`;
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
    const customer = await user('user', 'Ana', 'Reyes');
    const me = await user('admin', 'Ada', 'Admin');
    const colleague = await user('admin', 'Ben', 'Agent');

    const [conv] = await sql`
        INSERT INTO support_conversations (user_id, status, source_brand, locale, reference)
        VALUES (${customer.id}, 'waiting_human', 'CheapestGo', 'ko', ${'CS-SHOT' + String(run).slice(-2)})
        RETURNING id, reference`;

    const t = (minutes) => new Date(run - (300 - minutes) * 60_000).toISOString();
    const say = (sender, body, over = {}) => sql`
        INSERT INTO support_messages (conversation_id, sender_type, sender_admin_id, body,
                                      notice_code, created_at, translated_body, translated_lang,
                                      translation_status, back_translated_body)
        VALUES (${conv.id}, ${sender}, ${over.admin ?? null}, ${body}, ${over.notice ?? null},
                ${over.at ?? t(0)}, ${over.translated ?? null}, ${over.lang ?? null},
                ${over.status ?? null}, ${over.back ?? null})`;

    await say('guest', '안녕하세요, 환불을 받고 싶어요.', { at: t(0), translated: 'Hello, I would like a refund.', lang: 'en', status: 'translated' });
    await say('agent', 'Let me check that booking for you.', { admin: colleague.id, at: t(2), translated: '예약을 확인해 드릴게요.', lang: 'ko', status: 'translated', back: 'I will check your booking.' });
    await say('agent', 'It is refundable until Friday.', { admin: colleague.id, at: t(3), translated: '금요일까지 환불 가능합니다.', lang: 'ko', status: 'translated', back: 'It can be refunded until Friday.' });
    await say('guest', '진짜 감사합니다!', { at: t(6), translated: null, lang: null, status: 'untranslated' });
    await say('system', 'The assistant has been retired; a person answers every chat now.', { notice: 'assistant_retired', at: t(200) });
    await say('agent', 'Refund is on its way — you will see it in 5 days.', { admin: me.id, at: t(240), translated: '환불이 진행 중입니다 — 5일 안에 확인하실 수 있습니다.', lang: 'ko', status: 'translated', back: 'The refund is in progress; you will see it within 5 days.' });

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    await context.addCookies(me.setCookies.map(c => { const [pair] = c.split(';'); const [name, ...rest] = pair.split('='); return { name, value: rest.join('='), url: BASE }; }));
    const page = await context.newPage();

    await page.goto(`${BASE}/admin/support`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(6000);
    await page.getByText(conv.reference).first().click({ timeout: 30_000 });
    // Dev compiles the detail route on first open; wait for the transcript, not a guess.
    await page.getByText('Hello, I would like a refund.').first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1500);

    const out = path.join(SCRATCH, 'inbox-transcript.png');
    await page.screenshot({ path: out });
    const pane = page.locator('div.min-h-0.flex-1.overflow-y-auto').first();
    await pane.screenshot({ path: path.join(SCRATCH, 'inbox-transcript-pane.png') }).catch(() => {});
    console.log('shot:', out);
    console.log('rows:', await page.evaluate(() => [...document.querySelectorAll('div.flex.flex-col.items-end, div.flex.flex-col.items-start')].map(el => `${el.className.includes('items-end') ? 'RIGHT' : 'LEFT '} ${el.innerText.replace(/\s+/g, ' ').slice(0, 70)}`)));

    await browser.close();
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(ids)}::uuid[])`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
