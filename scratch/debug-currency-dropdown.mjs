/** Can a script open the navbar currency dropdown at all? LOCAL :3000.  node scratch/debug-currency-dropdown.mjs [path] */
import path from 'path';
import { createRequire } from 'module';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto(`http://localhost:3000${process.argv[2] ?? '/'}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(8000);

const info = await page.evaluate(() => {
    const b = [...document.querySelectorAll('header button')].find(x => /USD|PHP|KRW/.test(x.textContent ?? ''));
    if (!b) return { found: false };
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { found: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], onTop: top === b || b.contains(top) ? 'button' : `${top?.tagName}.${String(top?.className).slice(0, 60)}`, expanded: b.getAttribute('aria-expanded'), state: b.getAttribute('data-state') };
});
console.log('trigger:', info);
if (info.found) {
    const [x, y, w, h] = info.rect;
    await page.mouse.click(x + w / 2, y + h / 2);
    await page.waitForTimeout(800);
    console.log('after mouse click → menuitems:', await page.getByRole('menuitem').count(),
        'data-state:', await page.evaluate(() => [...document.querySelectorAll('header button')].find(x => /USD|PHP|KRW/.test(x.textContent ?? ''))?.getAttribute('data-state')));
}
await browser.close();
