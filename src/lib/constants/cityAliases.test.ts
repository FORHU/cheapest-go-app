import { describe, it, expect } from 'vitest';
import {
    resolveHotelDbCities,
    resolveHotelDbCity,
    HOTEL_DB_CITY_SYNONYMS,
    HOTEL_DB_CITY_MAP,
} from './cityAliases';

/**
 * Cover the case that motivated the one-to-many resolver: the catalog files Seoul
 * as both "Seoul" (1,094 hotels) and "Seúl" (936), so resolving to either one
 * alone hid roughly half the city.
 */
describe('resolveHotelDbCities', () => {
    it('returns every spelling a split city is filed under', () => {
        expect(resolveHotelDbCities('Seoul', 'KR')).toEqual(['Seoul', 'Seúl', 'Seoel']);
        expect(resolveHotelDbCities('Beijing', 'CN')).toEqual(['Peking', 'Beijing']);
    });

    it('includes the canonical spelling, not just the localized one', () => {
        // The old one-to-one map sent Beijing to "Peking" only, losing the 964
        // hotels filed under "Beijing".
        expect(resolveHotelDbCities('Beijing', 'CN')).toContain('Beijing');
        expect(resolveHotelDbCities('Athens', 'GR')).toContain('Athens');
        expect(resolveHotelDbCities('New Delhi', 'IN')).toContain('New Delhi');
    });

    it('falls back to the one-to-one map when a city has a single spelling', () => {
        // Taken from the maps rather than named, because which cities have one spelling is
        // data that a supplier refresh changes: Rome and Tokyo were both examples here until
        // the 2026-09-21 sync gave each of them a second.
        const key = Object.keys(HOTEL_DB_CITY_MAP)
            .find(k => !(k in HOTEL_DB_CITY_SYNONYMS));
        expect(key).toBeDefined();
        const [city, cc] = key!.split('|');
        expect(resolveHotelDbCities(city, cc)).toEqual([HOTEL_DB_CITY_MAP[key!]]);

        // And a city with several is given all of them, the synonyms winning.
        expect(resolveHotelDbCities('Rome', 'IT')).toEqual(['Rome', 'Rom']);
        expect(resolveHotelDbCities('Cape Town', 'ZA')).toEqual(['Cape Town', 'Kapstadt']);
    });

    it('returns the input unchanged when nothing is mapped', () => {
        expect(resolveHotelDbCities('Cebu', 'PH')).toEqual(['Cebu']);
    });

    it('is case-insensitive on the country code', () => {
        expect(resolveHotelDbCities('Seoul', 'kr')).toEqual(resolveHotelDbCities('Seoul', 'KR'));
    });

    it('is case-insensitive on the city name', () => {
        // A city name reaches the resolver from URLs, stored search keys and
        // supplier payloads, and not all preserve case. "rome" missing `Rome|IT`
        // meant searching the catalog for "rome", which has no rows — Rome
        // returned nothing at all.
        expect(resolveHotelDbCities('rome', 'IT')).toEqual(['Rome', 'Rom']);
        expect(resolveHotelDbCities('ROME', 'it')).toEqual(['Rome', 'Rom']);
        expect(resolveHotelDbCities('sEoUl', 'KR')).toEqual(resolveHotelDbCities('Seoul', 'KR'));
    });

    it('never returns an empty list', () => {
        for (const city of ['Seoul', 'Rome', 'Nowhere']) {
            expect(resolveHotelDbCities(city, 'XX').length).toBeGreaterThan(0);
        }
    });
});

describe('resolveHotelDbCity', () => {
    it('still returns a single name, for callers that need one', () => {
        expect(resolveHotelDbCity('Rome', 'IT')).toBe('Rome');
        expect(resolveHotelDbCity('Cebu', 'PH')).toBe('Cebu');
    });

    it('agrees with the first entry of the many-valued resolver', () => {
        for (const key of Object.keys(HOTEL_DB_CITY_SYNONYMS)) {
            const [city, cc] = key.split('|');
            expect(resolveHotelDbCity(city, cc)).toBe(resolveHotelDbCities(city, cc)[0]);
        }
    });
});

describe('HOTEL_DB_CITY_SYNONYMS', () => {
    it('lists the canonical city among its own spellings', () => {
        // Otherwise a search for "Athens" would never look for "Athens".
        for (const [key, spellings] of Object.entries(HOTEL_DB_CITY_SYNONYMS)) {
            const city = key.split('|')[0];
            expect(spellings, key).toContain(city);
        }
    });

    it('has no duplicate spellings within an entry', () => {
        for (const [key, spellings] of Object.entries(HOTEL_DB_CITY_SYNONYMS)) {
            expect(new Set(spellings).size, key).toBe(spellings.length);
        }
    });

    it('supersedes any one-to-one mapping for the same city', () => {
        // Both tables define Athens, New Delhi, Ho Chi Minh City and Tokyo. The
        // synonyms must win, and must keep the localized name the old map chose.
        for (const key of Object.keys(HOTEL_DB_CITY_SYNONYMS)) {
            const mapped = HOTEL_DB_CITY_MAP[key];
            if (!mapped) continue;
            expect(HOTEL_DB_CITY_SYNONYMS[key], key).toContain(mapped);
        }
    });
});
