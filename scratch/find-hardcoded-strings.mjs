/**
 * BG-13: user-visible English hardcoded in customer-facing components — text with no
 * translation key, which locales.test.ts cannot see. A heuristic, not a parser: JSX text
 * between tags, and a few attributes people read (placeholder, aria-label, title, alt),
 * with two or more English words. Admin, support desk, tests and dev pages are skipped.
 *
 *   node scratch/find-hardcoded-strings.mjs            (summary per file)
 *   node scratch/find-hardcoded-strings.mjs --all      (every hit)
 */
import fs from 'fs';
import path from 'path';

const ROOTS = ['src/components', 'src/app/(main)', 'src/app/login', 'src/app/auth'];
const SKIP = /admin|support\/(?!Support(Widget|Panel|Composer|Transcript|Launcher|EntryLink))|\.test\.|__tests__|test-map|dev-policy|meta-preview|\/ui\/|stories/i;

const walk = (d, out = []) => {
    if (!fs.existsSync(d)) return out;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx$/.test(e.name) && !SKIP.test(p.replace(/\\/g, '/'))) out.push(p);
    }
    return out;
};

const files = ROOTS.flatMap(r => walk(r));
const hits = [];
for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (!/next-intl|useTranslations|getTranslations/.test(src) && !/return\s*\(/.test(src)) continue;
    const lines = src.split('\n');
    lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;                       // comments
        if (/console\.|throw new Error|^\s*import /.test(line)) return;
        // JSX text: >Some English words<
        for (const m of line.matchAll(/>\s*([A-Z][A-Za-z'’,.!?&-]*(?:\s+[A-Za-z'’,.!?&()-]+){1,})\s*</g)) {
            if (!/\{|\}/.test(m[1])) hits.push({ file, line: i + 1, text: m[1].trim() });
        }
        // Attributes people read
        for (const m of line.matchAll(/\b(placeholder|aria-label|title|alt)=["']([A-Z][^"'{}]*\s[^"'{}]+)["']/g)) {
            hits.push({ file, line: i + 1, text: `${m[1]}="${m[2]}"` });
        }
    });
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
const sorted = [...byFile].sort((a, b) => b[1].length - a[1].length);
console.log(`${hits.length} hardcoded strings in ${byFile.size} files (of ${files.length} scanned)\n`);
for (const [file, list] of sorted) {
    console.log(`${String(list.length).padStart(3)}  ${file.replace(/\\/g, '/')}`);
    if (process.argv.includes('--all')) for (const h of list) console.log(`       ${h.line}: ${h.text.slice(0, 90)}`);
}
