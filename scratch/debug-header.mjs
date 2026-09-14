/** What does the navbar look like to a script? LOCAL :3000.  node scratch/debug-header.mjs */
import path from 'path';
import { createRequire } from 'module';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(10000);
const info = await page.evaluate(() => ({
    headers: document.querySelectorAll('header').length,
    bodyLen: document.body.innerText.length,
    dollars: (document.body.innerText.match(/\$/g) ?? []).length,
    buttons: [...document.querySelectorAll('header button')].map(b => ({ text: b.innerText.replace(/\s+/g, ' ').trim(), visible: !!b.offsetParent })),
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: path.join(SCRATCH, 'debug-header.png'), clip: { x: 0, y: 0, width: 1366, height: 120 } });
await browser.close();
