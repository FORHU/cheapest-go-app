/**
 * BG-13: with the site set to Korean, which visible text is still English, and which is a
 * raw translation key? Crawls the main pages on the LOCAL dev server (:3000).
 *
 * Flags two things per page:
 *   - raw keys ("landing.search.cabinClass.econom") — always a bug
 *   - English phrases (two or more Latin words, no Hangul) — untranslated or hardcoded
 * Brand names, codes and prices are ignored.
 *
 *   node scratch/audit-korean-pages.mjs
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
    ['hotel results', `/search?destination=Seoul&countryCode=KR&checkIn=${inDays(21)}&checkOut=${inDays(23)}&adults=2&rooms=1`],
    ['flight results', '/flights/search?origin=MNL&destination=ICN&cabin=economy'],
    ['trips', '/trips'],
    ['account', '/account'],
    ['login', '/login'],
    ['deals', '/deals'],
];

const IGNORE = /^(CheapestGo|geomeego|USD|KRW|PHP|EN|KO|US|PH|KR|JP|CN|AI|OK|ID|VAT|PWA|FAQ|API)$/i;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ko-KR' });
await context.addCookies([{ name: 'locale', value: 'ko', url: BASE }]);
const page = await context.newPage();

const report = [];
for (const [label, url] of PAGES) {
    try {
        await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await page.waitForTimeout(9000);
        const found = await page.evaluate(() => {
            const out = { keys: [], english: [] };
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                const el = n.parentElement;
                if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
                if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
                const text = (n.textContent ?? '').trim();
                if (!text || text.length < 2) continue;
                // A raw next-intl key: dotted path, no spaces.
                if (/^[a-z][\w]*(\.[\w]+){2,}$/i.test(text) && !text.includes(' ')) { out.keys.push(text); continue; }
                if (/[가-힣]/.test(text)) continue;                       // Korean: fine
                const words = text.match(/[A-Za-z][A-Za-z'’-]{1,}/g) ?? [];
                if (words.length >= 2) out.english.push(text.slice(0, 70));
            }
            return out;
        });
        const english = [...new Set(found.english)].filter(t => !t.split(/\s+/).every(w => IGNORE.test(w)));
        const keys = [...new Set(found.keys)];
        report.push({ label, url, keys, english });
        console.log(`\n── ${label} (${url.slice(0, 50)})`);
        if (keys.length) console.log('   RAW KEYS:', keys.join(' | '));
        console.log(`   english phrases: ${english.length}`);
        for (const t of english.slice(0, 12)) console.log(`     • ${t}`);
    } catch (e) {
        console.log(`\n── ${label}: failed — ${e.message.slice(0, 80)}`);
    }
}
await browser.close();

const totals = report.reduce((a, r) => ({ keys: a.keys + r.keys.length, english: a.english + r.english.length }), { keys: 0, english: 0 });
console.log(`\ntotal: ${totals.keys} raw keys, ${totals.english} English phrases across ${report.length} pages`);
