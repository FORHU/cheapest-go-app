/**
 * BG-2 reproduction against the LOCAL dev server (:3000): a prior HKG search, then the home
 * page's MNL→SIN deal card "Search Flights". Logs every failed API response and screenshots.
 *   node scratch/repro-bg2.mjs
 */
import path from 'path';
import { createRequire } from 'module';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    let body = '';
    try { body = (await res.text()).slice(0, 200); } catch {}
    const failed = res.status() >= 400 || /"success"\s*:\s*false/.test(body);
    if (failed || url.includes('/api/flights/search')) {
        console.log(`  ${res.request().method()} ${url.replace(BASE, '')} → ${res.status()} ${failed ? body : ''}`);
    }
});
page.on('pageerror', e => console.log('  pageerror:', e.message));

const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
console.log('1. prior HKG search');
await page.goto(`${BASE}/flights/search?origin=MNL&destination=HKG&departure=${future}&adults=1&cabin=economy`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForResponse(r => r.url().includes('/api/flights/search'), { timeout: 120_000 }).catch(() => console.log('  (no search response)'));
await page.waitForTimeout(2500);

console.log('2. home page, MNL→SIN deal card');
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(6000);
for (let y = 0; y < 8; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(700); }
const routes = await page.locator('h3').filter({ hasText: /✈/ }).allTextContents();
console.log('  deal cards on page:', routes.length, routes.slice(0, 8));
// Local deals have no MNL→SIN; the card's click is a client-side push to exactly this URL
// (buildBookingUrl), so push it the same way from the home page.
await page.evaluate(() => window.next?.router?.push('/flights/search?origin=MNL&destination=SIN&cabin=economy'));
await page.waitForURL(/flights\/search/, { timeout: 60_000 });
console.log('  landed on', page.url().replace(BASE, ''));
await page.waitForResponse(r => r.url().includes('/api/flights/search'), { timeout: 120_000 }).catch(() => console.log('  (no search response)'));
await page.waitForTimeout(3000);

const file = path.join(SCRATCH, 'bg2-after-deal-card.png');
await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1366, height: 500 } });
console.log('  error panel visible:', await page.getByText('Search Error').isVisible(), '→', file);
await browser.close();
