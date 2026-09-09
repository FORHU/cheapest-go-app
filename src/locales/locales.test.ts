import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import en from './en.json';
import ko from './ko.json';
import ja from './ja.json';
import zh from './zh.json';
import baseline from './untranslated-baseline.json';

/**
 * Locale parity, enforced as a ratchet.
 *
 * AirangGo launched with English across the booking funnel while the locale files
 * looked healthy on a key count — because the visible strings had never been given
 * keys, and the ones that had were missing quietly. Nothing failed; a customer
 * noticed.
 *
 * These tests exist so the next gap fails here instead. They deliberately do NOT
 * demand full coverage: there are several hundred known gaps, and a test that fails
 * on all of them could not be merged and would block every unrelated PR. Instead the
 * known set is frozen in `untranslated-baseline.json` and only *new* gaps fail.
 *
 * The baseline is a debt register, not a permission slip. It should only ever shrink.
 * To regenerate after translating: `node scratch/regen-locale-baseline.mjs`.
 */

type Messages = Record<string, unknown>;

const LOCALES: Record<string, Messages> = { ko, ja, zh };

function flatten(obj: Messages, prefix = '', out: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Messages, key, out);
        else out[key] = Array.isArray(v) ? JSON.stringify(v) : String(v);
    }
    return out;
}

/**
 * ICU argument names and rich-text tags a translation must carry through.
 *
 * Depth-aware on purpose. `{hours, plural, =1 {1 hour} other {# hours}}` declares ONE
 * argument, `hours`; the braces inside it are sub-message text. A naive regex reads
 * `{1 hour}` and `{# hours}` as placeholders and reports every plural in the file as
 * a mismatch, which buries the real ones.
 */
function placeholders(s: string): string[] {
    const found = new Set<string>();
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '{') {
            if (depth === 0) {
                const m = /^\{\s*(\w+)\s*[,}]/.exec(s.slice(i));
                if (m) found.add(`{${m[1]}}`);
            }
            depth++;
        } else if (c === '}') {
            depth = Math.max(0, depth - 1);
        }
    }
    for (const m of s.matchAll(/<(\w+)>/g)) found.add(`<${m[1]}>`);
    return [...found].sort();
}

const flatEn = flatten(en as Messages);
const enKeys = Object.keys(flatEn);

describe('locale parity', () => {
    it('en.json is the reference and is non-trivial', () => {
        expect(enKeys.length).toBeGreaterThan(1500);
    });

    for (const [name, messages] of Object.entries(LOCALES)) {
        const flat = flatten(messages);
        const known = new Set(baseline.missing[name as keyof typeof baseline.missing] ?? []);
        const knownStale = new Set(baseline.stale[name as keyof typeof baseline.stale] ?? []);

        it(`${name}: no NEW missing keys beyond the baseline`, () => {
            const missing = enKeys.filter((k) => !(k in flat) && !known.has(k));
            expect(missing, `${name}.json is missing keys that en.json has. Translate them, or if that is genuinely not possible, add them to untranslated-baseline.json with a reason in the PR.`).toEqual([]);
        });

        it(`${name}: no keys en.json has dropped`, () => {
            // A stale key is dead weight and usually means a rename landed in en only.
            const stale = Object.keys(flat).filter((k) => !(k in flatEn) && !knownStale.has(k));
            expect(stale, `${name}.json has keys en.json does not — likely a rename applied to en only.`).toEqual([]);
        });

        it(`${name}: no placeholder that en declares is dropped`, () => {
            // Directional, and the direction matters.
            //
            // A translation that DROPS a placeholder en declares is a rendering bug:
            // the caller passes {amount} and the string never shows it, or next-intl
            // throws. That is what this guards, and it must always be empty.
            //
            // The opposite — a translation carrying a placeholder en lacks — is not a
            // rendering bug, because the caller is already passing the value. It means
            // the ENGLISH source hardcodes something the translations parameterise,
            // which today is 18 keys hardcoding "CheapestGo" where ko/ja/zh all use
            // {brand}. Real, and brand-leaking on a non-CheapestGo storefront, but it
            // is fixed per call site rather than by a bulk edit, so it is tracked
            // separately rather than blocking this gate.
            const dropped: string[] = [];
            for (const k of enKeys) {
                if (!(k in flat)) continue;
                const declared = placeholders(flatEn[k]);
                const present = new Set(placeholders(flat[k]));
                const missing = declared.filter((p) => !present.has(p));
                if (missing.length) {
                    dropped.push(`${k} — ${name}.json is missing ${missing.join(' ')}`);
                }
            }
            expect(dropped, `a translation dropped a placeholder that en declares — the value will not render`).toEqual([]);
        });
    }

    it('the baseline only shrinks', () => {
        // Guards the ratchet itself: if this number goes up, debt was added rather
        // than paid down, and the gate stopped meaning anything.
        const total = [...Object.values(baseline.missing), ...Object.values(baseline.stale)]
            .reduce((n, list) => n + list.length, 0);
        const cap = Number(
            fs.readFileSync(path.join(__dirname, 'untranslated-baseline.max'), 'utf8').trim(),
        );
        expect(total, `baseline grew to ${total}, above the recorded ceiling of ${cap}. Lower the ceiling when you translate; never raise it.`).toBeLessThanOrEqual(cap);
    });
});
