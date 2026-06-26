/**
 * TDD – Cycle 1: cache TTL helpers
 * Tests are against exported pure functions only; no DB or TGX calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// These exports don't exist yet — tests will be RED until implemented.
import { isPopularCity, getEffectiveTtl } from '@/lib/server/stays/travelgatex/search';

describe('isPopularCity', () => {
    it('returns true for exact popular city names', () => {
        expect(isPopularCity('Tokyo')).toBe(true);
        expect(isPopularCity('Bangkok')).toBe(true);
        expect(isPopularCity('Seoul')).toBe(true);
        expect(isPopularCity('Singapore')).toBe(true);
        expect(isPopularCity('Paris')).toBe(true);
        expect(isPopularCity('London')).toBe(true);
        expect(isPopularCity('New York')).toBe(true);
        expect(isPopularCity('Dubai')).toBe(true);
        expect(isPopularCity('Barcelona')).toBe(true);
        expect(isPopularCity('Bali')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(isPopularCity('tokyo')).toBe(true);
        expect(isPopularCity('LONDON')).toBe(true);
        expect(isPopularCity('bAnGkOk')).toBe(true);
    });

    it('returns false for non-popular cities', () => {
        expect(isPopularCity('Wichita')).toBe(false);
        expect(isPopularCity('Busan')).toBe(false);
        expect(isPopularCity('')).toBe(false);
    });
});

describe('getEffectiveTtl', () => {
    const origStandard = process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES;
    const origPopular  = process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES;

    afterEach(() => {
        // Restore env after each test
        if (origStandard === undefined) delete process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES;
        else process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES = origStandard;

        if (origPopular === undefined) delete process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES;
        else process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES = origPopular;
    });

    it('defaults to 120 min for standard cities', () => {
        delete process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES;
        delete process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES;
        expect(getEffectiveTtl('Wichita')).toBe(120);
    });

    it('defaults to 360 min for popular cities', () => {
        delete process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES;
        delete process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES;
        expect(getEffectiveTtl('Tokyo')).toBe(360);
    });

    it('respects HOTEL_SEARCH_CACHE_TTL_MINUTES override', () => {
        process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES = '90';
        expect(getEffectiveTtl('Busan')).toBe(90);
    });

    it('respects HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES override', () => {
        process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES = '480';
        expect(getEffectiveTtl('Paris')).toBe(480);
    });

    it('returns standard TTL when cityName is undefined', () => {
        delete process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES;
        expect(getEffectiveTtl()).toBe(120);
    });
});
