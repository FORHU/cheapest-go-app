/**
 * BG-13: write every missing ko/ja/zh key with its English source to scratch files, so they
 * can be translated in batches and merged back with apply-translations.mjs.
 *   node scratch/list-missing-translations.mjs
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'src/locales');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const en = read('en.json');
const baseline = read('untranslated-baseline.json');

const flatten = (obj, prefix = '', out = {}) => {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
};

const flatEn = flatten(en);
const OUT = path.join(process.cwd(), 'scratch/translations');
fs.mkdirSync(OUT, { recursive: true });

for (const locale of ['ko', 'ja', 'zh']) {
    const flatLocale = flatten(read(`${locale}.json`));
    const missing = Object.keys(flatEn).filter(k => !(k in flatLocale));
    const payload = Object.fromEntries(missing.map(k => [k, flatEn[k]]));
    fs.writeFileSync(path.join(OUT, `${locale}-missing.json`), JSON.stringify(payload, null, 2), 'utf8');
    const arrays = missing.filter(k => Array.isArray(flatEn[k])).length;
    const inBaseline = missing.filter(k => (baseline.missing[locale] ?? []).includes(k)).length;
    console.log(`${locale}: ${missing.length} missing (${inBaseline} in the baseline, ${arrays} are arrays) → scratch/translations/${locale}-missing.json`);
}

// What the three locales have in common — translate once, reuse the key list.
const sets = ['ko', 'ja', 'zh'].map(l => new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(OUT, `${l}-missing.json`), 'utf8')))));
const all = [...sets[0]].filter(k => sets[1].has(k) && sets[2].has(k));
console.log(`\nkeys missing in all three: ${all.length}`);
console.log(`total strings to write: ${sets.reduce((n, s) => n + s.size, 0)}`);
