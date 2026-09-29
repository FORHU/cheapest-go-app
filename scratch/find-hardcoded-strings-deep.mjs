/**
 * BG-13, second pass: what find-hardcoded-strings.mjs misses — English on its own line inside
 * JSX, quoted English in label/title/description object fields and ternaries, and single words
 * in attributes people read. Heuristic; review the output. Skips files nothing imports.
 *   node scratch/find-hardcoded-strings-deep.mjs [--all]
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOTS = ['src/components', 'src/app/(main)', 'src/app/login', 'src/app/auth'];
const SKIP = /admin|support\/(?!Support(Widget|Panel|Composer|Transcript|Launcher|EntryLink))|\.test\.|__tests__|test-map|dev-policy|meta-preview|\/ui\/|stories/i;
const walk = (d, out = []) => {
    if (!fs.existsSync(d)) return out;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx$/.test(e.name) && !SKIP.test(p.replace(/\\/g, '/'))) out.push(p.replace(/\\/g, '/'));
    }
    return out;
};
const imported = (file) => {
    if (/\/(page|layout|error|not-found|loading)\.tsx$/.test(file)) return true;
    const base = path.basename(file, '.tsx');
    try { return execSync(`git grep -lE "/${base}['\\"]" -- src`, { encoding: 'utf8' }).split('\n').some(l => l && l !== file); }
    catch { return false; }
};

const WORDS = /[A-Za-z]{2,}(?:[\s'’,.!?…—-]+[A-Za-z]{2,}){1,}/;
const hits = [];
for (const file of ROOTS.flatMap(r => walk(r))) {
    if (!imported(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let inJsx = false;
    lines.forEach((raw, i) => {
        const line = raw.trim();
        if (/return\s*\(|=>\s*\(/.test(line)) inJsx = true;
        if (!line || /^(\/\/|\*|\/\*|\{\/\*|import |export type|console\.|throw )/.test(line)) return;
        if (/className=|href=|src=|key=|\bt\d?\(|tm\(|t\.rich/.test(line) && !/(title|label|placeholder|aria-label|alt)=["']/.test(line)) {
            // still check >Text< on class lines
        }
        // 1) a JSX text line: starts with a capital English word, no code characters
        if (inJsx && /^[A-Z][A-Za-z'’]*(?:[\s,.!?…—:-]+[A-Za-z'’()]+)*[.!?…:]?$/.test(line) && WORDS.test(line) && !/^(React|Promise|Record|Partial)\b/.test(line)) {
            hits.push({ file, line: i + 1, text: line });
            return;
        }
        // 2) >Text< on one line
        for (const m of raw.matchAll(/>\s*([A-Z][A-Za-z'’]*(?:[\s,.!?…—-]+[A-Za-z'’()]+)*[.!?…:]?)\s*</g)) hits.push({ file, line: i + 1, text: m[1] });
        // 3) attributes people read, including single words
        for (const m of raw.matchAll(/\b(placeholder|aria-label|title|alt|label)=["']([A-Z][^"'{}]{2,})["']/g)) hits.push({ file, line: i + 1, text: `${m[1]}="${m[2]}"` });
        // 4) label/title/description: 'English words' in objects, and ternary string results
        for (const m of raw.matchAll(/\b(label|title|description|message|text|placeholder|subtitle)\s*:\s*['"]([A-Z][^'"]*\s[^'"]+)['"]/g)) hits.push({ file, line: i + 1, text: `${m[1]}: "${m[2]}"` });
        for (const m of raw.matchAll(/[?:]\s*['"]([A-Z][a-z]+(?:\s+[A-Za-z'’…]+)+[.!?…]?)['"]/g)) hits.push({ file, line: i + 1, text: `"${m[1]}"` });
    });
}
const byFile = new Map();
for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
const sorted = [...byFile].sort((a, b) => b[1].length - a[1].length);
console.log(`${hits.length} candidate strings in ${byFile.size} imported files\n`);
for (const [file, list] of sorted) {
    console.log(`${String(list.length).padStart(3)}  ${file}`);
    if (process.argv.includes('--all')) for (const h of list) console.log(`       ${h.line}: ${h.text.slice(0, 100)}`);
}
