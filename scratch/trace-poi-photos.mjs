/**
 * BG-4 / BG-6: open a Hong Kong property page on the LOCAL dev server (:3000), scroll to
 * nearby places, and log every /api/poi-photo and /_next/image request with its status,
 * how many times each exact URL was requested, and what kind of element asked for it.
 *   node scratch/trace-poi-photos.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import postgres from 'postgres';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3000';

const env = fs.readFileSync('.env', 'utf8');
const sql = postgres(env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, ''), { ssl: false, max: 1 });
const [hotel] = await sql`SELECT hotel_id, name FROM hotel_content WHERE city ILIKE 'hong kong' AND lat IS NOT NULL LIMIT 1`;
await sql.end();
console.log('hotel', hotel);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

const seen = new Map();  // url -> { count, statuses:[], type }
page.on('response', (res) => {
    const u = res.url();
    if (!u.includes('/api/poi-photo') && !u.includes('/_next/image')) return;
    const key = u.replace(BASE, '');
    const e = seen.get(key) ?? { count: 0, statuses: [], type: res.request().resourceType() };
    e.count++; e.statuses.push(res.status());
    seen.set(key, e);
});

const checkIn = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
const checkOut = new Date(Date.now() + 22 * 864e5).toISOString().slice(0, 10);
await page.goto(`${BASE}/property/${hotel.hotel_id}?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(8000);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(900); }
await page.waitForTimeout(12000);
await page.screenshot({ path: path.join(SCRATCH, 'bg4-property.png'), fullPage: false });

const rows = [...seen.entries()];
const byBase = new Map();
for (const [u, e] of rows) {
    const base = u.startsWith('/_next/image') ? decodeURIComponent(new URL(BASE + u).searchParams.get('url') || '') : u;
    const stripped = base.replace(/&full=true/, '');
    byBase.set(stripped, [...(byBase.get(stripped) ?? []), `${u.startsWith('/_next') ? 'next/image' : u.includes('full=true') ? 'full=true JSON' : 'image'}(${e.type}) ×${e.count} [${e.statuses.join(',')}]`]);
}
console.log(`\n${rows.length} distinct URLs, ${rows.reduce((n, [, e]) => n + e.count, 0)} requests`);
let i = 0;
for (const [b, kinds] of byBase) {
    if (i++ < 12) console.log(`${decodeURIComponent(b).slice(0, 110)}\n    ${kinds.join('  |  ')}`);
}
const failing = rows.filter(([, e]) => e.statuses.some(s => s >= 400));
console.log(`\nfailing: ${failing.length}`);
for (const [u, e] of failing.slice(0, 5)) console.log('  ', e.statuses, decodeURIComponent(u).slice(0, 160));
await browser.close();
