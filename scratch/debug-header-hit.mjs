/**
 * For each page on the LOCAL dev server (:3000): find the navbar language and currency
 * buttons, and ask the browser what element is actually on top at their centres — if it is
 * not the button, a customer's click never reaches the switcher. Checked at the top of the
 * page and after scrolling.
 *   node scratch/debug-header-hit.mjs
 */
import path from 'path';
import { createRequire } from 'module';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';

const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PAGES = [
    ['home', '/'],
    ['deals', '/deals'],
    ['hotel results', `/search?destination=Seoul&countryCode=KR&checkIn=${inDays(21)}&checkOut=${inDays(23)}&adults=2&rooms=1`],
    ['flight results', '/flights/search?origin=MNL&destination=ICN&cabin=economy'],
    ['property', '/property/10557683'],
    ['trips', '/trips'],
    ['account', '/account'],
    ['help', '/help'],
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

const probe = () => page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => {
        const t = b.innerText.replace(/\s+/g, '');
        return /^(US|KR|CN|JP)(EN|KO|ZH|JA)$/.test(t) || /^[A-Z]{2}(USD|KRW|PHP|JPY|CNY|SGD|EUR)$/.test(t);
    });
    return buttons.map(b => {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const ok = !!top && (top === b || b.contains(top));
        const describe = (el) => el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.getAttribute('alt') ? `[alt="${el.getAttribute('alt').slice(0, 30)}"]` : ''}.${String(el.className).split(' ').slice(0, 3).join('.')}` : 'nothing';
        let chain = '';
        if (!ok && top) {
            const parts = [];
            for (let el = top; el && parts.length < 6; el = el.parentElement) {
                const cs = getComputedStyle(el);
                if (cs.zIndex !== 'auto' || cs.position !== 'static' || cs.transform !== 'none') parts.push(`${describe(el)}{z:${cs.zIndex},pos:${cs.position}${cs.transform !== 'none' ? ',transform' : ''}}`);
            }
            chain = parts.join(' < ');
        }
        return { text: b.innerText.replace(/\s+/g, ''), y: Math.round(r.top), ok, onTop: ok ? '' : describe(top), chain };
    });
});

for (const [label, url] of PAGES) {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(9000);
    const atTop = await probe();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1500);
    const scrolled = await probe();
    const fmt = (list) => list.length ? list.map(b => `${b.ok ? '✓' : '✗'} ${b.text}@${b.y}${b.ok ? '' : ` covered by ${b.onTop} ${b.chain}`}`).join(' | ') : '(no switcher buttons found)';
    console.log(`\n── ${label}\n   top:      ${fmt(atTop)}\n   scrolled: ${fmt(scrolled)}`);
}
await browser.close();
