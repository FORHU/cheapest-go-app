/**
 * BG-13: merge scratch/translations/batch-*.json into src/locales/{ko,ja,zh}.json.
 *
 * Only fills keys a locale is missing — never overwrites an existing translation. Refuses to
 * write anything unless every missing key has a translation and every translation carries
 * the ICU arguments and rich-text tags its English source declares (the same check
 * src/locales/locales.test.ts enforces). Then run: node scratch/regen-locale-baseline.mjs
 *
 *   node scratch/apply-translations.mjs            (dry run: report only)
 *   node scratch/apply-translations.mjs --write
 */
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const dir = path.join(process.cwd(), 'src/locales');
const tdir = path.join(process.cwd(), 'scratch/translations');

const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const flatten = (obj, prefix = '', out = {}) => {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
};
const flatEn = flatten(en);

/** Same logic as locales.test.ts: top-level ICU argument names, plus <tag> names. */
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

const translations = {};
for (const file of fs.readdirSync(tdir).filter(f => /^batch-.*\.json$/.test(f))) {
    Object.assign(translations, JSON.parse(fs.readFileSync(path.join(tdir, file), 'utf8')));
}
console.log(`translations loaded: ${Object.keys(translations).length} keys`);

function setDeep(obj, dotted, value) {
    const parts = dotted.split('.');
    let node = obj;
    for (const p of parts.slice(0, -1)) {
        if (!node[p] || typeof node[p] !== 'object') node[p] = {};
        node = node[p];
    }
    node[parts[parts.length - 1]] = value;
}

let problems = 0;
for (const locale of ['ko', 'ja', 'zh']) {
    const file = path.join(dir, `${locale}.json`);
    const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
    const flat = flatten(messages);
    const missing = Object.keys(flatEn).filter(k => !(k in flat));
    let filled = 0;
    for (const key of missing) {
        const value = translations[key]?.[locale];
        if (typeof value !== 'string' || !value.trim()) { console.log(`  ✗ ${locale} ${key}: no translation`); problems++; continue; }
        const want = placeholders(String(flatEn[key]));
        const have = new Set(placeholders(value));
        const dropped = want.filter(p => !have.has(p));
        if (dropped.length) { console.log(`  ✗ ${locale} ${key}: drops ${dropped.join(' ')}`); problems++; continue; }
        setDeep(messages, key, value);
        filled++;
    }
    console.log(`${locale}: ${missing.length} missing, ${filled} filled`);
    if (WRITE && !problems) fs.writeFileSync(file, JSON.stringify(messages, null, 2) + '\n', 'utf8');
}

if (problems) { console.log(`\n${problems} problem(s) — nothing written.`); process.exit(1); }
console.log(WRITE ? '\nwritten. Now: node scratch/regen-locale-baseline.mjs' : '\ndry run clean. Re-run with --write.');
