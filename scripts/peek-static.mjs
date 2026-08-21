import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)/);
        if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}

const KEY_ID  = process.env.RATEHAWK_KEY_ID  || process.env.ETG_KEY_ID;
const API_KEY = process.env.RATEHAWK_API_KEY || process.env.ETG_API_KEY;
const TOKEN   = Buffer.from(`${KEY_ID}:${API_KEY}`).toString('base64');

// 1. Ask what /hotel/static/ returns
const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/static/', {
    method: 'GET',
    headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
});
const json = await res.json();
console.log('HTTP status:', res.status);
console.log(JSON.stringify(json, null, 2));
