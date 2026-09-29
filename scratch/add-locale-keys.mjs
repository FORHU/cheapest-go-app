/**
 * BG-13: add new translation keys to all four locale files at once, from a JSON file of
 * { "dotted.key": { "en": "...", "ko": "...", "ja": "...", "zh": "..." } }.
 *
 * Refuses to overwrite an existing key, and refuses a translation that drops an ICU argument
 * or <tag> the English declares (the rule locales.test.ts enforces).
 *
 *   node scratch/add-locale-keys.mjs scratch/translations/keys-flights.json
 */
import fs from 'fs';
import path from 'path';

const input = process.argv[2];
if (!input) { console.error('usage: node scratch/add-locale-keys.mjs <keys.json>'); process.exit(1); }
const additions = JSON.parse(fs.readFileSync(input, 'utf8'));
const dir = path.join(process.cwd(), 'src/locales');
const LOCALES = ['en', 'ko', 'ja', 'zh'];

function placeholders(s) {
    const found = new Set();
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '{') {
            if (depth === 0) {
                const m = /^\{\s*(\w+)\s*[,}]/.exec(s.slice(i));
                if (m) found.add(`{${m[1]}}`);
            }
            depth++;
        } else if (c === '}') depth = Math.max(0, depth - 1);
    }
    for (const m of s.matchAll(/<(\w+)>/g)) found.add(`<${m[1]}>`);
    return [...found].sort();
}

const getDeep = (obj, key) => key.split('.').reduce((n, p) => (n && typeof n === 'object' ? n[p] : undefined), obj);
function setDeep(obj, key, value) {
    const parts = key.split('.');
    let node = obj;
    for (const p of parts.slice(0, -1)) {
        if (node[p] === undefined) node[p] = {};
        if (typeof node[p] !== 'object') throw new Error(`${key}: "${p}" is already a string`);
        node = node[p];
    }
    node[parts[parts.length - 1]] = value;
}

const files = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'))]));
let problems = 0, added = 0;
for (const [key, byLocale] of Object.entries(additions)) {
    const want = placeholders(byLocale.en ?? '');
    for (const l of LOCALES) {
        const value = byLocale[l];
        if (typeof value !== 'string' || !value.length) { console.log(`✗ ${key} [${l}]: missing`); problems++; continue; }
        if (getDeep(files[l], key) !== undefined) { console.log(`✗ ${key} [${l}]: already exists`); problems++; continue; }
        const have = new Set(placeholders(value));
        const dropped = want.filter(p => !have.has(p));
        if (dropped.length) { console.log(`✗ ${key} [${l}]: drops ${dropped.join(' ')}`); problems++; continue; }
        setDeep(files[l], key, value);
    }
    added++;
}
if (problems) { console.log(`\n${problems} problem(s) — nothing written.`); process.exit(1); }
for (const l of LOCALES) fs.writeFileSync(path.join(dir, `${l}.json`), JSON.stringify(files[l], null, 2) + '\n', 'utf8');
console.log(`added ${added} keys to ${LOCALES.join(', ')}`);
