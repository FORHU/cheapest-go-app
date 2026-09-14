/**
 * BG-18 on the LOCAL dev server (:3000): a hotel checkout opened as /checkout?currency=PHP,
 * then the navbar currency switched to USD. The URL and the prices on the page must follow.
 * Seeds a booking in progress the way the flow stores it (as the BG-1 smoke does).
 *   node scratch/smoke-bg18-checkout-currency.mjs
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

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(3000);
await page.evaluate(() => {
    localStorage.setItem('cheapestgo-booking', JSON.stringify({ version: 0, state: {
        property: { id: 'bg18-hotel', name: 'BG-18 Test Hotel', images: [], price: 5000, currency: 'PHP', rating: 4 },
        selectedRoom: { id: 'room', offerId: 'TGX:bg18-fake', title: 'Double room', price: 5000, currency: 'PHP' },
        checkIn: '2026-10-01T00:00:00.000Z', checkOut: '2026-10-03T00:00:00.000Z', adults: 2, children: 0,
    } }));
});

await page.goto(`${BASE}/checkout?currency=PHP`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(7000);
const pesoBefore = await page.evaluate(() => (document.body.innerText.match(/₱/g) ?? []).length);
check('checkout opens in PHP', pesoBefore > 0, `${pesoBefore} ₱ on the page`);
await page.screenshot({ path: path.join(SCRATCH, 'bg18-checkout-php.png'), clip: { x: 0, y: 0, width: 1366, height: 700 } });

// Navbar → USD.
console.log('  header buttons:', await page.evaluate(() => [...document.querySelectorAll('header button')].map(b => `${b.innerText.replace(/\s+/g, '')}${b.offsetParent ? '' : '(hidden)'}`).join(', ')));
const trigger = page.locator('header button:visible').filter({ hasText: /^[A-Z]{2}(PHP|USD|KRW)$/ }).first();
// The app's own dropdown (components/ui/dropdown-menu): items are divs with data-slot, no role.
await trigger.click({ timeout: 15_000 });
await page.waitForTimeout(700);
await page.locator('[data-slot="dropdown-menu-item"]:visible', { hasText: 'USD' }).first().click({ timeout: 10_000 });
await page.waitForTimeout(6000);

const url = new URL(page.url());
check('the URL follows the navbar', url.searchParams.get('currency') === 'USD', url.search);
const after = await page.evaluate(() => ({
    peso: (document.body.innerText.match(/₱/g) ?? []).length,
    dollar: (document.body.innerText.match(/\$/g) ?? []).length,
}));
check('the prices are now in USD', after.dollar > 0 && after.peso === 0, JSON.stringify(after));
await page.screenshot({ path: path.join(SCRATCH, 'bg18-checkout-usd.png'), clip: { x: 0, y: 0, width: 1366, height: 700 } });

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
