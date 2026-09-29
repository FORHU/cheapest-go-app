/**
 * BG-13: delete the locale keys en.json no longer has (listed in the baseline's `stale`), after
 * confirming no source file references them. Leftovers of renames applied to en only.
 *   node scratch/remove-stale-locale-keys.mjs
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'src/locales');
const baseline = JSON.parse(fs.readFileSync(path.join(dir, 'untranslated-baseline.json'), 'utf8'));

// Every stale key's last segment, searched across the source as a quoted string.
const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.next', 'locales'].includes(e.name)) walk(p, out); }
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
};
const sources = walk(path.join(process.cwd(), 'src')).map(f => fs.readFileSync(f, 'utf8')).join('\n');

let removed = 0;
for (const [locale, keys] of Object.entries(baseline.stale)) {
    if (!keys.length) continue;
    const file = path.join(dir, `${locale}.json`);
    const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of keys) {
        const leaf = key.split('.').slice(-2).join('.');
        if (new RegExp(`['"\`]${leaf.replace('.', '\\.')}['"\`]|['"\`]${key.replace(/\./g, '\\.')}['"\`]`).test(sources)) {
            console.log(`  kept ${locale} ${key}: referenced in source`);
            continue;
        }
        const parts = key.split('.');
        let node = messages;
        for (const p of parts.slice(0, -1)) node = node?.[p];
        if (node && parts[parts.length - 1] in node) {
            delete node[parts[parts.length - 1]];
            removed++;
        }
    }
    fs.writeFileSync(file, JSON.stringify(messages, null, 2) + '\n', 'utf8');
}
console.log(`removed ${removed} stale keys. Now: node scratch/regen-locale-baseline.mjs`);
