import { describe, it, expect, beforeEach } from 'vitest';
import type { FlightOffer } from '@/types/flights';
import {
    searchCacheKey,
    readSearchCache,
    writeSearchCache,
    SEARCH_CACHE_TTL_MS,
} from './search-cache';

const KEY_PARTS = {
    origin: 'CEB',
    destination: 'MNL',
    departureDate: '2026-09-20',
    adults: 1,
    children: 0,
    infants: 0,
    cabinClass: 'economy',
};

const OFFERS = [{ offerId: 'off_1' }, { offerId: 'off_2' }] as unknown as FlightOffer[];

describe('searchCacheKey', () => {
    it('is stable for the same search', () => {
        expect(searchCacheKey(KEY_PARTS)).toBe(searchCacheKey({ ...KEY_PARTS }));
    });

    it('changes when any leg of the search changes', () => {
        const base = searchCacheKey(KEY_PARTS);
        expect(searchCacheKey({ ...KEY_PARTS, destination: 'NRT' })).not.toBe(base);
        expect(searchCacheKey({ ...KEY_PARTS, departureDate: '2026-09-21' })).not.toBe(base);
        expect(searchCacheKey({ ...KEY_PARTS, adults: 2 })).not.toBe(base);
        expect(searchCacheKey({ ...KEY_PARTS, cabinClass: 'business' })).not.toBe(base);
        expect(searchCacheKey({ ...KEY_PARTS, returnDate: '2026-09-27' })).not.toBe(base);
    });
});

describe('search result cache', () => {
    beforeEach(() => sessionStorage.clear());

    it('round-trips a successful result', () => {
        const key = searchCacheKey(KEY_PARTS);
        writeSearchCache(key, OFFERS, 1_000);
        expect(readSearchCache(key, 1_000)).toEqual(OFFERS);
    });

    it('returns null for a search it has never seen', () => {
        expect(readSearchCache(searchCacheKey(KEY_PARTS))).toBeNull();
    });

    it('expires entries older than the TTL', () => {
        const key = searchCacheKey(KEY_PARTS);
        writeSearchCache(key, OFFERS, 0);
        expect(readSearchCache(key, SEARCH_CACHE_TTL_MS + 1)).toBeNull();
        // and the stale row is dropped rather than left to rot
        expect(sessionStorage.getItem(key)).toBeNull();
    });

    it('serves an entry that is still inside the TTL', () => {
        const key = searchCacheKey(KEY_PARTS);
        writeSearchCache(key, OFFERS, 0);
        expect(readSearchCache(key, SEARCH_CACHE_TTL_MS - 1)).toEqual(OFFERS);
    });

    it('never stores or serves an empty result', () => {
        const key = searchCacheKey(KEY_PARTS);
        writeSearchCache(key, [], 1_000);
        expect(sessionStorage.getItem(key)).toBeNull();
        expect(readSearchCache(key, 1_000)).toBeNull();
    });

    it('treats a corrupt entry as a miss', () => {
        const key = searchCacheKey(KEY_PARTS);
        sessionStorage.setItem(key, '{not json');
        expect(readSearchCache(key)).toBeNull();
    });

    it('survives sessionStorage being unavailable', () => {
        const key = searchCacheKey(KEY_PARTS);
        const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            get() {
                throw new Error('sessionStorage is disabled');
            },
        });
        try {
            expect(() => writeSearchCache(key, OFFERS)).not.toThrow();
            expect(readSearchCache(key)).toBeNull();
        } finally {
            if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
        }
    });
});
