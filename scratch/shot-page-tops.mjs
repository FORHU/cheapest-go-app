/** Screenshot the top of a few pages on LOCAL :3000.  node scratch/shot-page-tops.mjs */
import path from 'path';
import { createRequire } from 'module';

const SCRATCH = 'C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER-Documents-GitHub-cheapest-go-app/fdb429a2-c340-4b41-8500-3b60a45c8b2a/scratchpad/shots';
const require = createRequire(path.join(SCRATCH, 'package.json'));
const { chromium } = require('playwright-core');

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
for (const [name, url] of [['home', '/'], ['property', '/property/10557683']]) {
    await page.goto(`http://localhost:3000${url}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(10000);
    const file = path.join(SCRATCH, `top-${name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1366, height: 340 } });
    console.log(file);
}
await browser.close();
