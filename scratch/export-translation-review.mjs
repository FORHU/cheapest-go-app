/**
 * A sheet for native reviewers: every ko/ja/zh string added or changed since a commit, beside
 * its English source. UTF-8 with BOM so Excel opens the Hangul/kana/hanzi correctly.
 *   node scratch/export-translation-review.mjs [since=801978f3]
 */
import fs from 'fs';
import { execSync } from 'child_process';

const since = process.argv[2] ?? '801978f3';
const flat = (o, p = '', out = {}) => {
    for (const [k, v] of Object.entries(o)) {
        const key = p ? `${p}.${k}` : k;
        if (v && typeof v === 'object') flat(v, key, out); else out[key] = String(v);
    }
    return out;
};
const at = (rev, file) => { try { return flat(JSON.parse(execSync(`git show ${rev}:${file}`, { encoding: 'utf8', maxBuffer: 1 << 26 }))); } catch { return {}; } };
const now = (file) => flat(JSON.parse(fs.readFileSync(file, 'utf8')));
const cell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

const en = now('src/locales/en.json');
const rows = [['language', 'key', 'English', 'translation', 'status', 'reviewer: OK or corrected text']];
const counts = {};
for (const lang of ['ko', 'ja', 'zh']) {
    const before = at(since, `src/locales/${lang}.json`);
    const after = now(`src/locales/${lang}.json`);
    for (const [key, value] of Object.entries(after)) {
        if (before[key] === value) continue;
        rows.push([lang, key, en[key] ?? '', value, key in before ? 'changed' : 'new', '']);
        counts[lang] = (counts[lang] ?? 0) + 1;
    }
}
const out = 'scratch/translations/translation-review.csv';
fs.writeFileSync(out, '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'));
console.log(`${rows.length - 1} strings → ${out}`, counts);
