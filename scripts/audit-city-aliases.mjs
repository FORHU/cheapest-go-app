#!/usr/bin/env node
/**
 * Audit CITY_ALIASES for the failure modes that silently break destination search.
 *
 *   node scripts/audit-city-aliases.mjs              # offline checks only (fast)
 *   node scripts/audit-city-aliases.mjs --probe      # + Mapbox reachability sample
 *   node scripts/audit-city-aliases.mjs --probe=600  # larger sample
 *   node scripts/audit-city-aliases.mjs --cc=PH      # restrict to one country
 *
 * Offline checks
 *   1. Canonicals that are supplier-localized names (HOTEL_DB_CITY_MAP *values*).
 *      These bypass resolveHotelDbCity and surface in the UI as "Rom", "Singapur",
 *      "Daegu (und Umgebung)" — the user sees the supplier's German catalogue name.
 *   2. Canonicals that are not plain city names (parentheticals, "Village", "Island").
 *   3. Keys that can never match: mixed case, leading/trailing whitespace, empties.
 *
 * Probe check (needs NEXT_PUBLIC_MAPBOX_TOKEN)
 *   4. Reachability: would this alias ever fire from Mapbox *output* alone? Entries
 *      that fail are reachable only via matchAliasQuery's query-side index — which
 *      is why that index exists. Tracks how much of the dict depends on it.
 */

import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagVal = (name, dflt) => {
    const f = flag(name);
    if (!f) return null;
    const [, v] = f.split('=');
    return v === undefined ? dflt : v;
};
const onlyCc = flagVal('cc', null);
const probeArg = flagVal('probe', '240');

const src = readFileSync('src/lib/constants/cityAliases.ts', 'utf8');
const splitAt = src.indexOf('\nexport const HOTEL_DB_CITY_MAP');
const aliasBody = src.slice(src.indexOf('export const CITY_ALIASES'), splitAt);
const dbBody = src.slice(splitAt);

// ── parse ────────────────────────────────────────────────────────────────────
// Source-level parsing keeps this runnable as plain node with no TS toolchain.
const PAIR = /'([^']*)'[ ]*:[ ]*'([^']*)'/g;

const dbNames = new Map(); // "dbname|CC" -> { english, cc, db }
for (const m of dbBody.matchAll(/'([^']+)\|([A-Z]{2})'[ ]*:[ ]*'([^']*)'/g)) {
    dbNames.set(`${m[3].toLowerCase()}|${m[2]}`, { english: m[1], cc: m[2], db: m[3] });
}

const blocks = [...aliasBody.matchAll(/^ {4}([A-Z]{2}): \{$/gm)];
const entries = [];
for (let i = 0; i < blocks.length; i++) {
    const cc = blocks[i][1];
    if (onlyCc && cc !== onlyCc) continue;
    const from = blocks[i].index;
    const to = i + 1 < blocks.length ? blocks[i + 1].index : aliasBody.length;
    for (const m of aliasBody.slice(from, to).matchAll(PAIR)) {
        entries.push({ cc, rawAlias: m[1], alias: m[1].toLowerCase().trim(), canonical: m[2] });
    }
}

const destinations = new Map(); // "canonical|CC" -> { canonical, cc, aliases[] }
for (const e of entries) {
    const key = `${e.canonical.toLowerCase()}|${e.cc}`;
    const rec = destinations.get(key) ?? { canonical: e.canonical, cc: e.cc, aliases: [] };
    rec.aliases.push(e.alias);
    destinations.set(key, rec);
}

const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—';
console.log(`\nCITY_ALIASES: ${entries.length} aliases → ${destinations.size} destinations`
    + ` across ${blocks.length} country blocks${onlyCc ? ` (filtered to ${onlyCc})` : ''}`);
console.log(`HOTEL_DB_CITY_MAP: ${dbNames.size} name translations\n`);

let problems = 0;

// ── 1. supplier-localized canonicals ─────────────────────────────────────────
const leaked = [];
for (const [key, rec] of destinations) {
    const hit = dbNames.get(key);
    if (hit) leaked.push({ ...rec, english: hit.english });
}
leaked.sort((a, b) => b.aliases.length - a.aliases.length);
const leakedAliases = leaked.reduce((n, r) => n + r.aliases.length, 0);
console.log('─'.repeat(78));
console.log(`1. Supplier-localized names used as canonical`);
console.log(`   ${leaked.length} destinations · ${leakedAliases} aliases (${pct(leakedAliases, entries.length)} of dict)`);
console.log(`   These display to the user as-is and are what TGX dest-code resolution receives.`);
for (const r of leaked.slice(0, 20)) {
    console.log(`     ${r.cc} "${r.canonical}" → prefer "${r.english}"  (${r.aliases.length} aliases)`);
}
if (leaked.length > 20) console.log(`     … and ${leaked.length - 20} more`);
problems += leaked.length;

// ── 2. canonicals that are not plain city names ──────────────────────────────
const NOT_A_CITY = /\(|und Umgebung|\bVillage\b|\bIsland\b|\bDistrict\b|\bZone\b|Bucht/i;
const odd = [...destinations.values()].filter((r) => NOT_A_CITY.test(r.canonical) && !leaked.includes(r));
console.log('\n' + '─'.repeat(78));
console.log(`2. Canonicals that are not plain city names`);
console.log(`   ${odd.length} destinations · ${odd.reduce((n, r) => n + r.aliases.length, 0)} aliases`);
for (const r of odd.slice(0, 20)) {
    console.log(`     ${r.cc} "${r.canonical}"  (${r.aliases.length} aliases, e.g. '${r.aliases[0]}')`);
}
if (odd.length > 20) console.log(`     … and ${odd.length - 20} more`);
problems += odd.length;

// ── 3. structurally unmatchable keys ─────────────────────────────────────────
// The output-side lookup in fetchCitiesFromMapbox lowercases before comparing, so
// a mixed-case or padded key is dead weight there. matchAliasQuery normalises, so
// these are reachable by typing — but they still signal a bulk-edit slip.
const malformed = entries.filter((e) => e.rawAlias !== e.rawAlias.toLowerCase().trim() || !e.alias);
console.log('\n' + '─'.repeat(78));
console.log(`3. Keys needing normalisation (mixed case / padding / empty)`);
console.log(`   ${malformed.length} entries`);
for (const e of malformed.slice(0, 20)) {
    console.log(`     ${e.cc} '${e.rawAlias}' → ${e.canonical}`);
}
problems += malformed.length;

// ── 4. Mapbox reachability probe ─────────────────────────────────────────────
if (flag('probe')) {
    const token = (readFileSync('.env', 'utf8').split('\n')
        .find((l) => l.startsWith('NEXT_PUBLIC_MAPBOX_TOKEN')) ?? '')
        .split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (!token) {
        console.log('\n(skipping probe: NEXT_PUBLIC_MAPBOX_TOKEN not found in .env)');
    } else {
        const target = Number(probeArg) || 240;
        const byCc = {};
        for (const e of entries) (byCc[e.cc] ??= []).push(e);
        const ccs = Object.keys(byCc).sort();
        const sample = [];
        for (let round = 0; sample.length < target; round++) {
            let added = 0;
            for (const cc of ccs) {
                const list = byCc[cc];
                if (round >= list.length) continue;
                sample.push(list[(round * 7919 + 13) % list.length]);
                added++;
                if (sample.length >= target) break;
            }
            if (!added) break;
        }

        const TYPES = 'region,place,district,locality,neighborhood,poi';
        const ccOf = (f) => (f.context ?? []).find((c) => c.id?.startsWith('country.'))
            ?.short_code?.toUpperCase()?.slice(0, 2);

        const probe = async (e) => {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(e.alias)}.json`
                + `?types=${TYPES}&limit=8&language=en&proximity=126.9780,37.5665&access_token=${token}`;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json();
                    const feats = j.features ?? [];
                    // Mirror the output-side alias match in fetchCitiesFromMapbox.
                    const fired = feats.some((f) => {
                        if (ccOf(f) !== e.cc) return false;
                        const name = (f.text_en ?? f.text ?? '').toLowerCase();
                        return name === e.alias
                            || e.alias.startsWith(name + ' ') || e.alias.startsWith(name + '-')
                            || name.startsWith(e.alias + ' ') || name.startsWith(e.alias + '-');
                    });
                    return { ...e, fired, top: feats[0]?.place_name ?? '(no results)' };
                } catch { if (attempt) return { ...e, error: true }; }
            }
        };

        const results = [];
        const CONC = 6;
        for (let i = 0; i < sample.length; i += CONC) {
            results.push(...await Promise.all(sample.slice(i, i + CONC).map(probe)));
            process.stderr.write(`   probing ${Math.min(i + CONC, sample.length)}/${sample.length}\r`);
        }
        const ok = results.filter((r) => r && !r.error);
        const unreachable = ok.filter((r) => !r.fired);
        console.log('\n' + '─'.repeat(78));
        console.log(`4. Mapbox reachability (sample of ${ok.length})`);
        console.log(`   reachable from Mapbox output alone : ${ok.length - unreachable.length} (${pct(ok.length - unreachable.length, ok.length)})`);
        console.log(`   query-side index only              : ${unreachable.length} (${pct(unreachable.length, ok.length)})`);
        for (const r of unreachable.slice(0, 20)) {
            console.log(`     ${r.cc} "${r.alias}" → ${r.canonical.padEnd(16)} | mapbox top: ${r.top.slice(0, 46)}`);
        }
    }
}

console.log('\n' + '─'.repeat(78));
console.log(`${problems} offline findings. Re-run with --probe for Mapbox reachability.\n`);
