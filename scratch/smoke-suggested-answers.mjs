/**
 * Suggested Answers (ADR-0043) end to end on the LOCAL dev server (:3000):
 *   a signed-in customer opens Support, types a refund question, and is offered the Help Page
 *   article — below the composer, not in the transcript. Reading it and saying it answered them
 *   leaves no message in the chat; typing a double-charge question offers nothing at all; and
 *   sending anyway is recorded as such.
 * Cleans up its user, chat and counters.
 *   node scratch/smoke-suggested-answers.mjs
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

try {
    const email = `suggest-${run}@example.test`;
    const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                            VALUES (${email}, ${await hash('Smoke-password-1!')}, 'user', 'Sara', 'Suggest') RETURNING id`;
    ids.push(row.id);
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    if (!login.ok) throw new Error(`login: ${login.status}`);

    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(login.headers.getSetCookie().map(c => { const [pair] = c.split(';'); const [name, ...rest] = pair.split('='); return { name, value: rest.join('='), url: BASE }; }));
    const page = await context.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(4000);

    // In the customer's way: account menu → Support.
    await page.getByRole('button', { name: /^SS$/ }).first().click({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.locator('button:has-text("Support"):visible').first().click();
    const box = page.getByRole('textbox', { name: /type a message|message/i }).first();
    await box.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => {
        const input = document.querySelector('input[aria-label]');
        return input && !input.hasAttribute('disabled');
    }, null, { timeout: 30_000 });

    // ── The chips an empty chat opens with (ADR-0044).
    const chip = page.getByRole('button', { name: /when do i get my refund/i }).first();
    check('an empty chat opens with the common questions', await chip.isVisible().catch(() => false));
    await chip.click();
    await page.waitForTimeout(1200);
    check('tapping one answers it in the chat', await page.getByText(/refund goes back to the card/i).first().isVisible().catch(() => false));
    check('the answer is labelled automated', await page.getByText(/help centre/i).first().isVisible().catch(() => false));
    const [afterTap] = await sql`SELECT count(*)::int AS n FROM support_messages m
        JOIN support_conversations c ON c.id = m.conversation_id WHERE c.user_id = ${row.id}`;
    check('no message was written by tapping', afterTap.n === 0, `${afterTap.n} messages`);
    await page.screenshot({ path: path.join(SCRATCH, 'quick-answer.png'), clip: { x: 830, y: 150, width: 540, height: 760 } }).catch(() => {});
    await page.getByRole('button', { name: /talk to a person/i }).last().click();
    await page.waitForTimeout(2500);
    const [afterPerson] = await sql`SELECT count(*)::int AS n FROM support_messages m
        JOIN support_conversations c ON c.id = m.conversation_id WHERE c.user_id = ${row.id}`;
    check('talking to a person sends the question', afterPerson.n === 1, `${afterPerson.n} messages`);

    // ── A question the Help Page answers, typed out (ADR-0043). The chat now has a message in
    // it, so the typing path is checked on the reload below rather than here.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: /^SS$/ }).first().click({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.locator('button:has-text("Support"):visible').first().click();
    const box1b = page.getByRole('textbox', { name: /type a message|message/i }).first();
    await box1b.waitFor({ timeout: 30_000 });
    await box1b.fill('when do I get my refund for the hotel');
    await page.waitForTimeout(1500);
    const card = page.getByRole('button', { name: /when do i get my refund/i }).first();
    const offered = await card.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    check('the article is offered while typing', offered);

    await card.click();
    await page.waitForTimeout(800);
    check('the answer opens in place', await page.getByText(/refund goes back to the card/i).first().isVisible().catch(() => false));

    await page.screenshot({ path: path.join(SCRATCH, 'suggested-answers.png'), clip: { x: 830, y: 200, width: 530, height: 700 } }).catch(() => {});

    await page.getByRole('button', { name: /that answered it/i }).first().click();
    await page.waitForTimeout(1200);
    check('saying so puts the cards away', await page.getByText(/glad that helped/i).first().isVisible().catch(() => false));

    const outcomes = await sql`SELECT outcome, count(*)::int AS n FROM support_suggestion_events
        WHERE article_id = 'refunds' AND created_at > now() - interval '5 minutes' GROUP BY outcome`;
    const byOutcome = Object.fromEntries(outcomes.map(o => [o.outcome, o.n]));
    check('shown, opened and solved were recorded', Boolean(byOutcome.shown && byOutcome.opened && byOutcome.solved), JSON.stringify(byOutcome));

    // ── A question only a person should answer.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: /^SS$/ }).first().click({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.locator('button:has-text("Support"):visible').first().click();
    const box2 = page.getByRole('textbox', { name: /type a message|message/i }).first();
    await box2.waitFor({ timeout: 30_000 });
    await box2.fill('you charged twice for one booking, fix this now');
    await page.waitForTimeout(1500);
    const cards = await page.locator('section[aria-label*="answer"] li').count();
    check('a double charge is offered nothing', cards === 0, `${cards} cards`);

    // ── Sending anyway still works, and is recorded.
    await box2.fill('when do I get my refund for the hotel');
    await page.waitForTimeout(1500);
    await box2.press('Enter');
    await page.getByText('when do I get my refund for the hotel').first().waitFor({ timeout: 30_000 });
    check('sending is never blocked', true);
    await page.waitForTimeout(1200);
    const [sentAnyway] = await sql`SELECT count(*)::int AS n FROM support_suggestion_events
        WHERE outcome = 'sent_anyway' AND created_at > now() - interval '5 minutes'`;
    check('sending anyway is recorded', sentAnyway.n > 0, `${sentAnyway.n} rows`);

    await browser.close();
} finally {
    await sql`DELETE FROM support_suggestion_events WHERE created_at > now() - interval '10 minutes'`.catch(() => {});
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(ids)}::uuid[])`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
