import { describe, it, expect } from 'vitest';
import {
    PROVIDER_ATTEMPT_TIMEOUT_MS,
    PROVIDER_RETRY_BACKOFF_MS,
    PROVIDER_WORST_CASE_MS,
    PROVIDER_CEILING_MS,
    CLIENT_SEARCH_TIMEOUT_MS,
} from './search-budget';

/**
 * A flight search passes through three deadlines — the provider's own per-attempt
 * timeout, the orchestrator's ceiling on that provider, and the browser's abort.
 * They were once three independent numbers, and two of them landed on 12s: the
 * orchestrator's race cut off Duffel's retries at exactly the length of a single
 * attempt, so a slow first attempt returned zero offers and the page said
 * "No flights found". These hold the three in the order that makes them coherent.
 */
describe('search budget', () => {
    it('gives the retry ladder longer than one attempt', () => {
        expect(PROVIDER_WORST_CASE_MS).toBeGreaterThan(PROVIDER_ATTEMPT_TIMEOUT_MS);
    });

    it('accounts for every attempt and every backoff in the worst case', () => {
        const attempts = PROVIDER_RETRY_BACKOFF_MS.length + 1;
        const backoff = PROVIDER_RETRY_BACKOFF_MS.reduce((a, b) => a + b, 0);
        expect(PROVIDER_WORST_CASE_MS).toBe(attempts * PROVIDER_ATTEMPT_TIMEOUT_MS + backoff);
    });

    it('lets the whole ladder finish inside the orchestrator ceiling', () => {
        expect(PROVIDER_CEILING_MS).toBeGreaterThan(PROVIDER_WORST_CASE_MS);
    });

    it('lets the server answer before the browser gives up', () => {
        expect(CLIENT_SEARCH_TIMEOUT_MS).toBeGreaterThan(PROVIDER_CEILING_MS);
    });

    it('keeps the worst case inside a wait a traveller will sit through', () => {
        // The browser shows "still searching" at 15s. Past roughly half a minute the
        // spinner has lost the user, and an attempt that lands later buys nothing.
        expect(PROVIDER_WORST_CASE_MS).toBeLessThanOrEqual(30_000);
    });
});
