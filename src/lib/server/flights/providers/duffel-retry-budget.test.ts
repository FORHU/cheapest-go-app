import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'test_token' } }));
vi.mock('@/lib/server/api-logger', () => ({ logApiCall: vi.fn() }));

import { searchDuffel } from './duffel';
import { PROVIDER_RETRY_BACKOFF_MS, PROVIDER_WORST_CASE_MS } from '@/lib/flights/search-budget';

const PARAMS = {
    origin: 'CRK',
    destination: 'LHR',
    // Far future — searchDuffel rejects past dates before it ever calls fetch.
    departureDate: '2099-01-01',
    adults: 1,
    children: 0,
    infants: 0,
    cabinClass: 'economy',
} as any;

describe('searchDuffel retry ladder', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('spends no more attempts than the shared budget allows for', async () => {
        // A traveller is watching a spinner. The ladder has to fit the budget the
        // orchestrator and the browser were both sized against — an extra attempt
        // that only lands after the user has given up costs a search and buys nothing.
        let attempts = 0;
        vi.stubGlobal('fetch', () => {
            attempts++;
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            return Promise.reject(err);
        });

        const promise = searchDuffel(PARAMS);
        await vi.advanceTimersByTimeAsync(PROVIDER_WORST_CASE_MS * 2);
        await promise;

        expect(attempts).toBe(PROVIDER_RETRY_BACKOFF_MS.length + 1);
    });

    it('waits the shared backoff schedule between attempts', async () => {
        // Fake timers mock Date.now, so each attempt can stamp itself exactly.
        const attemptAt: number[] = [];
        vi.stubGlobal('fetch', () => {
            attemptAt.push(Date.now());
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            return Promise.reject(err);
        });

        const promise = searchDuffel(PARAMS);
        await vi.advanceTimersByTimeAsync(PROVIDER_WORST_CASE_MS * 2);
        await promise;

        const gaps = attemptAt.slice(1).map((t, i) => t - attemptAt[i]);
        expect(gaps).toEqual([...PROVIDER_RETRY_BACKOFF_MS]);
    });
});
