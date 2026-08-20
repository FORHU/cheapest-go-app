/**
 * matchAliasQuery — query-side alias resolution.
 * Covers destinations Mapbox's geocoder cannot return (e.g. "Clark" PH, which
 * resolves to Clark, New Jersey even when the request is restricted to country=ph).
 */

import { describe, it, expect } from 'vitest';
import { matchAliasQuery } from '@/lib/constants/cityAliases';

const canonicals = (q: string) => matchAliasQuery(q).map(m => `${m.canonicalCity}|${m.countryCode}`);

describe('matchAliasQuery', () => {
    it('resolves "clark" to Angeles, PH — Mapbox returns only Clark, New Jersey', () => {
        expect(canonicals('clark')).toContain('Angeles|PH');
    });

    it('resolves the qualified form "clark pampanga" to the same destination', () => {
        expect(canonicals('clark pampanga')).toContain('Angeles|PH');
    });

    it('resolves a query whose alias key is a prefix of it ("clark freeport zone")', () => {
        expect(canonicals('clark freeport zone')).toContain('Angeles|PH');
    });

    it('collapses clark/clark freeport/clark pampanga into one Angeles suggestion', () => {
        const ph = matchAliasQuery('clark', 3).filter(m => m.canonicalCity === 'Angeles');
        expect(ph).toHaveLength(1);
    });

    it('reaches mixed-case keys that the output-side lookup can never match', () => {
        // 'Clark' is stored capitalised in CITY_ALIASES; the index lowercases keys.
        expect(canonicals('Clark')).toContain('Angeles|PH');
    });

    it('ranks an exact key above a longer partial match', () => {
        expect(matchAliasQuery('makati')[0].canonicalCity).toBe('Makati');
    });

    it('matches only at word boundaries, not mid-word', () => {
        for (const m of matchAliasQuery('ark', 20)) {
            expect(m.alias.startsWith('ark')).toBe(true);
        }
    });

    it('ignores queries shorter than two characters', () => {
        expect(matchAliasQuery('c')).toEqual([]);
    });

    it('respects the result limit', () => {
        expect(matchAliasQuery('san', 3).length).toBeLessThanOrEqual(3);
    });
});
