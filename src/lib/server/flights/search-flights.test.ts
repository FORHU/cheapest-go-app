import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// saveSearch / cacheResults / logSearchAnalytics all reach the DB through createClient.
// searchFlights already swallows a rejected saveSearch, so failing it here keeps these
// tests on the provider timeout budget and off the persistence path.
vi.mock('@/utils/postgres/server', () => ({
    createClient: vi.fn(async () => {
        throw new Error('no db in test');
    }),
}));

vi.mock('@/utils/flight-utils', () => ({
    normalizedToFlightOffer: (r: any) => ({ offerId: r.offer_id }),
}));

const searchDuffel = vi.fn();
vi.mock('./providers/duffel', () => ({ searchDuffel: (p: any) => searchDuffel(p) }));

import { searchFlights, searchFlightsWithStatus } from './search-flights';

const PARAMS = {
    origin: 'CRK',
    destination: 'LHR',
    departureDate: '2026-09-23',
    adults: 1,
    children: 0,
    infants: 0,
    cabinClass: 'economy',
} as any;

/** A provider that answers with one offer after `ms`. */
function respondsAfter(ms: number) {
    return () =>
        new Promise((resolve) =>
            setTimeout(() => resolve([{ offer_id: 'off_1', provider: 'duffel' }]), ms),
        );
}

describe('searchFlights provider budget', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        searchDuffel.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps offers from a slow first attempt', async () => {
        // searchDuffel allows 12s per attempt. An answer at 12.4s is one it accepted,
        // so the orchestrator must not have already given up on it.
        searchDuffel.mockImplementation(respondsAfter(12_400));

        const promise = searchFlights(PARAMS);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(await promise).toHaveLength(1);
    });

    it('keeps offers from an attempt that only succeeds on retry', async () => {
        // 12s attempt, 1.5s backoff, then an attempt that lands quickly.
        searchDuffel.mockImplementation(respondsAfter(15_000));

        const promise = searchFlights(PARAMS);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(await promise).toHaveLength(1);
    });

    it('abandons a provider that never answers', async () => {
        searchDuffel.mockImplementation(() => new Promise(() => {}));

        const promise = searchFlights(PARAMS);
        await vi.advanceTimersByTimeAsync(120_000);

        expect(await promise).toEqual([]);
    });
});

describe('searchFlightsWithStatus', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        searchDuffel.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('names the provider that failed', async () => {
        // Zero offers because the provider broke is a different answer from zero
        // offers because nobody flies the route, and only one of them is worth
        // offering the traveller a retry for.
        searchDuffel.mockImplementation(() => new Promise(() => {}));

        const promise = searchFlightsWithStatus(PARAMS);
        await vi.advanceTimersByTimeAsync(120_000);

        expect(await promise).toEqual({ offers: [], failedProviders: ['Duffel'] });
    });

    it('names no failures when a provider answers with an empty route', async () => {
        searchDuffel.mockImplementation(async () => []);

        const promise = searchFlightsWithStatus(PARAMS);
        await vi.advanceTimersByTimeAsync(120_000);

        expect(await promise).toEqual({ offers: [], failedProviders: [] });
    });

    it('reports no failures when the provider answers with offers', async () => {
        searchDuffel.mockImplementation(async () => [{ offer_id: 'off_1', provider: 'duffel' }]);

        const promise = searchFlightsWithStatus(PARAMS);
        await vi.advanceTimersByTimeAsync(120_000);

        const result = await promise;
        expect(result.offers).toHaveLength(1);
        expect(result.failedProviders).toEqual([]);
    });
});
