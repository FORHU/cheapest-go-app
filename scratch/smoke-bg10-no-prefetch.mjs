/**
 * BG-10 against the LOCAL dev server (:3000): choosing a destination in the search bar must
 * not send any search or destination-code request; pressing Search must still work. Also
 * checks the resolve endpoint is rate limited now.
 *   node scratch/smoke-bg10-no-prefetch.mjs
 */
import path from 'path';
import { createRequire } from 'module';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

const calls = [];
page.on('request', r => {
    const u = r.url().replace(BASE, '');
    if (u.startsWith('/api/')) calls.push(u.split('?')[0]);
});

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(6000);

// Open the destination field and type a city nobody has searched here yet.
// The page renders a phone and a desktop search bar; only one is visible.
await page.locator(':text-is("Where to?"):visible').first().click();
await page.waitForTimeout(1500);
const field = page.getByPlaceholder('Search destinations...').first();
await field.click();
await field.fill('Hakodate');
await page.waitForTimeout(3500);
calls.length = 0;                                  // ignore the autocomplete itself

await page.locator(':text-matches("Hakodate", "i"):visible').first().click();
await page.waitForTimeout(4000);

const afterSelect = [...new Set(calls)];
console.log('  requests after choosing the destination:', afterSelect.length ? afterSelect.join(', ') : '(none)');
check('no destination-code lookup on selection', !calls.some(u => u.includes('/api/autocomplete/resolve')));
check('no hotel search on selection', !calls.some(u => u.includes('/api/search')));

// Dates, the way a visitor sets them: the search will not run without them.
const pickDay = async (label) => {
    await page.locator(`:text-is("${label}"):visible`).first().click();
    await page.waitForTimeout(1200);
    const days = page.locator('[data-datepicker-panel]:visible button:not([disabled])');
    // Skip the month arrows and year control; the day cells are the numbered ones.
    const numbered = days.filter({ hasText: /^\d{1,2}$/ });
    // Check-out: days on or before check-in are disabled (BG-5), so take what is offered.
    await (label === 'Check-in' ? numbered.nth(8) : numbered.first()).click();
    await page.waitForTimeout(800);
};
await pickDay('Check-in');
await pickDay('Check-out');

// Now press Search: the search must run.
calls.length = 0;
// The search bar's own submit button (h-12), not a Search link elsewhere on the page.
await page.locator('button.h-12:has-text("Search"):visible').first().click({ timeout: 30_000 });
await page.waitForURL(/\/search/, { timeout: 60_000 }).catch(() => {});
await page.waitForResponse(r => r.url().includes('/api/search/stream'), { timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(4000);
check('pressing Search runs the search', calls.some(u => u.includes('/api/search/stream')), page.url().replace(BASE, ''));
await page.waitForTimeout(15000);
const images = await page.locator('img').count();
const text = await page.locator('body').innerText();
const answered = images > 3 || /no hotels|no results|no stays|nothing found/i.test(text);
check('the results page answered the search', answered, `${images} images; "${text.slice(0, 80).replace(/\s+/g, ' ')}"`);
await page.screenshot({ path: path.join(SCRATCH, 'bg10-after-search.png'), clip: { x: 0, y: 0, width: 1366, height: 700 } });
await browser.close();

// The resolve endpoint's own limit cannot be tripped from here: without CF_ORIGIN_SECRET
// every anonymous caller shares one backstop bucket at 50× the limit. That it is wired up
// at all is checked in src/__tests__/api/rate-limited-routes.test.ts.
const res = await fetch(`${BASE}/api/autocomplete/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
    body: JSON.stringify({ cityName: 'Hakodate' }),
});
check('the resolve endpoint still answers when called directly', res.status === 200, String(res.status));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
// exitCode, not exit(): Chromium's handles are still closing, and exiting under them makes
// Node print a libuv assertion on Windows.
process.exitCode = failures ? 1 : 0;
