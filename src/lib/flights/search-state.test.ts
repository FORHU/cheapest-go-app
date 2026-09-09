import { describe, it, expect } from 'vitest';
import { searchStateFromResponse } from './search-state';

/**
 * The results page used to read every 200 the same way: no offers meant "No flights
 * found", whether Duffel had answered with an empty route or had not answered at all.
 * A provider outage therefore arrived as a finding rather than a fault, with no retry
 * offered — which is what made the flights look like they had vanished after a back
 * navigation re-ran the search.
 */
describe('searchStateFromResponse', () => {
    it('shows the offers when there are offers', () => {
        const state = searchStateFromResponse({
            success: true,
            providersFailed: false,
            data: { offers: [{ offerId: 'off_1' }] },
        });
        expect(state).toEqual({ status: 'success', offers: [{ offerId: 'off_1' }] });
    });

    it('calls an empty route empty', () => {
        expect(
            searchStateFromResponse({ success: true, providersFailed: false, data: { offers: [] } }),
        ).toEqual({ status: 'empty' });
    });

    it('calls a provider outage an outage, not an empty route', () => {
        expect(
            searchStateFromResponse({ success: true, providersFailed: true, data: { offers: [] } }),
        ).toEqual({ status: 'provider_error' });
    });

    it('still shows offers when one provider failed but another answered', () => {
        const state = searchStateFromResponse({
            success: true,
            providersFailed: false,
            failedProviders: ['Mystifly'],
            data: { offers: [{ offerId: 'off_1' }] },
        });
        expect(state.status).toBe('success');
    });

    it('reports an outright failure with the reason given', () => {
        expect(searchStateFromResponse({ success: false, error: 'Too many requests.' })).toEqual({
            status: 'error',
            message: 'Too many requests.',
        });
    });

    it('reports an outright failure that gave no reason', () => {
        expect(searchStateFromResponse({ success: false })).toEqual({
            status: 'error',
            message: 'Search failed',
        });
    });

    it('treats a response with no data at all as an outage rather than an empty route', () => {
        // A malformed 200 is a broken search. Calling it "no flights" tells the
        // traveller something false about the route.
        expect(searchStateFromResponse({ success: true, providersFailed: true })).toEqual({
            status: 'provider_error',
        });
    });
});
