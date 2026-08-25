import { describe, it, expect } from 'vitest';
import { resolveCanonicalCity } from './cityAliases';
import { resolveIsoCode } from './countries';

/**
 * The daily content refresh reads `hotel_search_stats`, which records what the
 * visitor typed rather than what it resolved to. On production the raw top-30 was
 * spending roughly a third of its budget on districts, provinces, duplicates and
 * the literal string "(unknown)" — and every wasted slot is a genuinely popular
 * city further down that never gets refreshed.
 *
 * These cover the two helpers that fold that list onto real cities.
 */

describe('resolveIsoCode', () => {
    it('passes ISO codes through, upper-cased', () => {
        expect(resolveIsoCode('kr')).toBe('KR');
        expect(resolveIsoCode('FR')).toBe('FR');
    });

    it('resolves a country name to its code', () => {
        // Search keys carry values like "FRANCE", which compared directly against
        // "FR" made "paris|FRANCE" and "paris|FR" two different places.
        expect(resolveIsoCode('FRANCE')).toBe('FR');
        expect(resolveIsoCode('south korea')).toBe('KR');
    });

    it('returns null for nothing recognisable', () => {
        expect(resolveIsoCode('')).toBeNull();
        expect(resolveIsoCode(undefined)).toBeNull();
        expect(resolveIsoCode('not a country')).toBeNull();
    });
});

describe('resolveCanonicalCity', () => {
    it('folds a district onto the city holding its inventory', () => {
        expect(resolveCanonicalCity('gangnam', 'KR')).toBe('Seoul');
        expect(resolveCanonicalCity('manhattan', 'US')).toBe('New York');
    });

    it('folds a district written with its suffix', () => {
        // Mapbox and stored keys both produce "Gangnam District".
        expect(resolveCanonicalCity('gangnam district', 'KR')).toBe('Seoul');
    });

    it('prefers the longest prefix so a shorter alias cannot steal it', () => {
        // "jamaica plain" is Boston; "jamaica" alone is New York.
        expect(resolveCanonicalCity('jamaica plain', 'US')).not.toBe(resolveCanonicalCity('jamaica', 'US'));
    });

    it('leaves a city that is already canonical alone', () => {
        expect(resolveCanonicalCity('Seoul', 'KR')).toBe('Seoul');
        expect(resolveCanonicalCity('Cebu', 'PH')).toBe('Cebu');
    });

    it('is case-insensitive on the country', () => {
        expect(resolveCanonicalCity('gangnam', 'kr')).toBe('Seoul');
    });

    it('returns the input for an unknown country', () => {
        expect(resolveCanonicalCity('Somewhere', 'ZZ')).toBe('Somewhere');
    });
});

describe('demand merging, on production\'s real top keys', () => {
    // Verbatim from hotel_search_stats on production.
    const PROD_TOP: Array<[string, string, number]> = [
        ['seoul', 'KR', 88], ['daejeon', 'KR', 35], ['jeju', 'KR', 33],
        ['manila', 'PH', 23], ['baguio', 'PH', 22], ['gangnam', 'KR', 16],
        ['manhattan', 'US', 14], ['new york', 'US', 14], ['rome', 'IT', 13],
        ['(unknown)', '', 11], ['paris', 'FR', 11], ['cebu', 'PH', 11],
        ['paris, france', 'FRANCE', 7], ['jeju-do', 'KR', 7],
        ['cebu city', 'PH', 6], ['gangnam district', 'KR', 4],
    ];

    function merge(rows: Array<[string, string, number]>) {
        const out = new Map<string, { city: string; cc: string; demand: number }>();
        for (const [rawCity, rawCc, count] of rows) {
            const cityOnly = rawCity.split(',')[0].trim();
            if (!cityOnly || cityOnly === '(unknown)') continue;
            const iso = resolveIsoCode(rawCc) ?? '';
            const canonical = iso ? resolveCanonicalCity(cityOnly, iso) : cityOnly;
            const key = `${canonical.toLowerCase()}|${iso}`;
            const hit = out.get(key);
            if (hit) hit.demand += count;
            else out.set(key, { city: canonical, cc: iso, demand: count });
        }
        return out;
    }

    it('drops the "(unknown)" row', () => {
        expect([...merge(PROD_TOP).keys()].some(k => k.startsWith('(unknown)'))).toBe(false);
    });

    it('folds both Gangnam rows into Seoul', () => {
        const m = merge(PROD_TOP);
        expect(m.has('gangnam|KR')).toBe(false);
        // 88 seoul + 16 gangnam + 4 gangnam district
        expect(m.get('seoul|KR')?.demand).toBe(108);
    });

    it('folds Manhattan into New York', () => {
        const m = merge(PROD_TOP);
        expect(m.has('manhattan|US')).toBe(false);
        expect(m.get('new york|US')?.demand).toBe(28);
    });

    it('merges "paris, france"/FRANCE with "paris"/FR', () => {
        const m = merge(PROD_TOP);
        expect(m.get('paris|FR')?.demand).toBe(18);
        expect([...m.keys()].filter(k => k.startsWith('paris|'))).toHaveLength(1);
    });

    it('frees up slots for cities further down the list', () => {
        const m = merge(PROD_TOP);
        // 16 raw rows collapse; every slot saved is a real city that would
        // otherwise never be refreshed.
        expect(m.size).toBeLessThan(PROD_TOP.length);
    });
});
