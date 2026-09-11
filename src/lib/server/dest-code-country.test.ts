import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A cached destination code belongs to a country, and the unscoped fallback must
 * not hand one country's code to another country's search.
 *
 * `tgx_destination_cache` holds one row per *bare* city name — 37,788 of them — so
 * "paris" can only ever mean one place worldwide. It meant Paris, Texas. A search for
 * "Paris, France" was answered with that code, TGX truthfully reported no availability
 * in Texas, and because the supplier *had* answered the stream pruned all 300 catalog
 * hotels and rendered "no hotels found". Bali (cached as Greece) and Rome (cached as
 * the United States) failed identically, so three of eighteen landing destinations
 * were dead.
 *
 * The rule under test is the narrow one deliberately chosen: reject a row only when it
 * can be *proven* to belong elsewhere. `parent_code` is either "Country Name#CC" or a
 * numeric parent id, and a numeric one identifies nothing — so it is accepted, exactly
 * as before. The check can only ever remove a code known to be wrong.
 */

/** Mirrors the helper in resolveTgxDestinationCode. */
const rowCountry = (parentCode: string | null): string | null =>
    /#([A-Z]{2})$/.exec(parentCode ?? '')?.[1] ?? null;

/** Mirrors the fallback's accept/reject decision. */
const acceptsRow = (parentCode: string | null, requireCountry?: string): boolean => {
    if (!requireCountry) return true;
    const belongsTo = rowCountry(parentCode);
    return !belongsTo || belongsTo === requireCountry.toUpperCase();
};

describe('destination code country scoping', () => {
    it('reads the country out of a named parent_code', () => {
        expect(rowCountry('France#FR')).toBe('FR');
        expect(rowCountry('United States of America#US')).toBe('US');
        expect(rowCountry('South Korea#KR')).toBe('KR');
    });

    it('reads no country from a parent that does not name one', () => {
        // `greater london` has parent 11218; `porte de paris` has '-'.
        expect(rowCountry('11218')).toBeNull();
        expect(rowCountry('-')).toBeNull();
        expect(rowCountry(null)).toBeNull();
        expect(rowCountry('')).toBeNull();
    });

    it('rejects the row that broke Paris', () => {
        // The actual live row: city_key 'paris' -> 143485, parent United States.
        expect(acceptsRow('United States of America#US', 'FR')).toBe(false);
    });

    it('rejects the rows that broke Bali and Rome', () => {
        expect(acceptsRow('Greece#GR', 'ID')).toBe(false);              // Bali, Crete
        expect(acceptsRow('United States of America#US', 'IT')).toBe(false); // Rome, Georgia
    });

    it('accepts a row whose country matches, whatever the case', () => {
        expect(acceptsRow('France#FR', 'FR')).toBe(true);
        expect(acceptsRow('France#FR', 'fr')).toBe(true);
        expect(acceptsRow('Japan#JP', 'JP')).toBe(true);
    });

    it('accepts cities that were never ambiguous', () => {
        // London, Tokyo, Seoul, New York, Barcelona all resolved correctly before the
        // fix and must keep resolving from cache — the check must not cost them a
        // fresh 18-second round trip to TGX.
        expect(acceptsRow('United Kingdom#GB', 'GB')).toBe(true);
        expect(acceptsRow('Japan#JP', 'JP')).toBe(true);
        expect(acceptsRow('South Korea#KR', 'KR')).toBe(true);
        expect(acceptsRow('United States of America#US', 'US')).toBe(true);
        expect(acceptsRow('Spain#ES', 'ES')).toBe(true);
    });

    it('accepts a row it cannot judge rather than guessing', () => {
        // The conservative half of the rule: an unjudgeable parent behaves exactly as
        // it did before, so the change can never make a working city worse.
        expect(acceptsRow('11218', 'GB')).toBe(true);
        expect(acceptsRow('-', 'FR')).toBe(true);
        expect(acceptsRow(null, 'FR')).toBe(true);
    });

    it('accepts everything when no country was asked for', () => {
        // An unscoped search has no country to contradict, so nothing is rejected.
        expect(acceptsRow('United States of America#US', undefined)).toBe(true);
        expect(acceptsRow('Greece#GR', undefined)).toBe(true);
    });
});

/**
 * The sync must keep both cities when two countries share a name.
 *
 * Rejecting the wrong row is only half a fix: reject Paris, Texas and the resolver falls
 * through to TGX's `destinationSearcher`, which for "Paris" answers with a ZONE for
 * Alpine-Casparis Municipal Airport — a substring match returning zero availability. The
 * real French code was in TGX's destination list all along; the sync dropped it because it
 * keyed on the bare name and the United States, with 4,699 of the 37,788 names, got there
 * first.
 *
 * So the scoped key has to be written at sync time. These mirror that keying.
 */
describe('sync keys a destination by name and country', () => {
    const countryOf = (parent: string | null): string | undefined =>
        /#([A-Z]{2})$/.exec(parent ?? '')?.[1];

    const keysFor = (name: string, parent: string | null): string[] => {
        const bare = name.toLowerCase().trim();
        const cc = countryOf(parent);
        return cc ? [bare, `${bare}:${cc.toLowerCase()}`] : [bare];
    };

    it('writes both a bare and a scoped key for a country-parented city', () => {
        expect(keysFor('Paris', 'France#FR')).toEqual(['paris', 'paris:fr']);
        expect(keysFor('Bali', 'Indonesia#ID')).toEqual(['bali', 'bali:id']);
    });

    it('gives the two Parises different scoped keys', () => {
        // The collision that started this: one bare key, two real cities. Scoped, they no
        // longer contend, and neither overwrites the other whatever order TGX pages them in.
        const fr = keysFor('Paris', 'France#FR');
        const us = keysFor('Paris', 'United States of America#US');
        expect(fr[0]).toBe(us[0]);          // same bare key — the collision
        expect(fr[1]).not.toBe(us[1]);      // distinct scoped keys — the fix
        expect(fr[1]).toBe('paris:fr');
        expect(us[1]).toBe('paris:us');
    });

    it('still writes the bare key alone when the parent names no country', () => {
        // A numeric parent identifies nothing, so there is no country to scope by and the
        // row behaves exactly as it did before.
        expect(keysFor('Greater London', '11218')).toEqual(['greater london']);
        expect(keysFor('Porte de Paris', '-')).toEqual(['porte de paris']);
        expect(keysFor('Somewhere', null)).toEqual(['somewhere']);
    });
});

/**
 * The rule above is worthless unless the search actually invokes it with a country.
 *
 * Every assertion in the block above passed on 2026-09-09 while production still answered
 * "Paris, France" with Paris, Texas — because they exercise a *mirror* of the rule, and the
 * one caller that matters passed `undefined`. The logic was right and unreached: a green
 * suite and a dead landing card at the same time.
 *
 * So this reads the call site. It is a coarse test and deliberately so — the failure it
 * guards against was not a wrong rule but an unwired one, and nothing about the rule's own
 * correctness can detect that.
 */
describe('the city fallback passes a country to the resolver', () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'src/lib/server/stays/travelgatex/search.ts'),
        'utf8',
    );

    it('does not hand the resolver a literal undefined', () => {
        expect(source).not.toMatch(/resolveTgxDestinationCode\(\s*cityName\s*,\s*undefined\s*\)/);
    });

    it('hands it the country resolved for this search', () => {
        expect(source).toMatch(/resolveTgxDestinationCode\(\s*cityName\s*,\s*resolvedCountry\s*\)/);
    });
});
