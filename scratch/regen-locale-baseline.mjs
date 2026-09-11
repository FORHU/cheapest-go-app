/**
 * Regenerate the untranslated baseline and its ceiling.
 *
 * Two kinds of debt are recorded:
 *   missing — en has the key, the locale does not. Someone shipped an English string.
 *   stale   — the locale has a key en dropped. Usually a rename applied to en only,
 *             or a string hardcoded into a component with its en key deleted, which
 *             orphans the translations someone already paid for.
 *
 * Run after translating, so the register shrinks. Never run it to make a failing test
 * pass — that inverts the ratchet and the gate stops meaning anything.
 *
 *   node scratch/regen-locale-baseline.mjs
 */
import fs from 'fs';

const dir = 'src/locales';
const flat = (o, p = '', out = {}) => {
    for (const [k, v] of Object.entries(o)) {
        const key = p ? `${p}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
        else out[key] = Array.isArray(v) ? JSON.stringify(v) : String(v);
    }
    return out;
};

const en = flat(JSON.parse(fs.readFileSync(`${dir}/en.json`, 'utf8')));
const enKeys = Object.keys(en);

const baseline = { missing: {}, stale: {} };
let total = 0;

for (const loc of ['ko', 'ja', 'zh']) {
    const m = flat(JSON.parse(fs.readFileSync(`${dir}/${loc}.json`, 'utf8')));
    const missing = enKeys.filter((k) => !(k in m)).sort();
    const stale = Object.keys(m).filter((k) => !(k in en)).sort();
    baseline.missing[loc] = missing;
    baseline.stale[loc] = stale;
    total += missing.length + stale.length;
    console.log(`${loc}: ${String(missing.length).padStart(3)} missing, ${stale.length} stale`);
}

const capPath = `${dir}/untranslated-baseline.max`;
const prev = fs.existsSync(capPath) ? Number(fs.readFileSync(capPath, 'utf8').trim()) : Infinity;
if (total > prev) {
    console.error(`\nREFUSING: total ${total} is above the recorded ceiling ${prev}.`);
    console.error('The baseline is a debt register. Translate the new keys instead of widening it.');
    process.exit(1);
}

fs.writeFileSync(`${dir}/untranslated-baseline.json`, JSON.stringify(baseline, null, 2) + '\n');
fs.writeFileSync(capPath, String(total) + '\n');
console.log(`\ntotal ${total} (ceiling was ${prev === Infinity ? 'unset' : prev}) — written`);
