import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/rate-limit', () => ({
    rateLimit: vi.fn(async () => ({ success: true })),
}));

const searchFlightsWithStatus = vi.fn();
vi.mock('@/lib/server/flights/search-flights', () => ({
    searchFlightsWithStatus: (p: any) => searchFlightsWithStatus(p),
}));

import { POST } from './route';

function post(body: unknown) {
    return POST(
        new Request('http://localhost/api/flights/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }) as any,
    );
}

const QUERY = {
    origin: 'CRK',
    destination: 'LHR',
    departureDate: '2099-01-01',
    passengers: { adults: 1, children: 0, infants: 0 },
    cabinClass: 'economy',
    tripType: 'one-way',
};

describe('POST /api/flights/search', () => {
    beforeEach(() => searchFlightsWithStatus.mockReset());

    it('flags a provider outage so the page can offer a retry', async () => {
        searchFlightsWithStatus.mockResolvedValue({ offers: [], failedProviders: ['Duffel'] });

        const json = await (await post(QUERY)).json();

        expect(json.providersFailed).toBe(true);
    });

    it('does not flag a route that genuinely has no flights', async () => {
        searchFlightsWithStatus.mockResolvedValue({ offers: [], failedProviders: [] });

        const json = await (await post(QUERY)).json();

        expect(json.success).toBe(true);
        expect(json.providersFailed).toBe(false);
        expect(json.data.offers).toEqual([]);
    });

    it('does not flag a partial failure that still returned offers', async () => {
        // One provider down while another answers is a complete-enough search — the
        // traveller has flights to look at and nothing to retry.
        searchFlightsWithStatus.mockResolvedValue({
            offers: [{ offerId: 'off_1', provider: 'duffel', price: { total: 100 } }],
            failedProviders: ['Mystifly'],
        });

        const json = await (await post(QUERY)).json();

        expect(json.success).toBe(true);
        expect(json.providersFailed).toBe(false);
        expect(json.data.offers).toHaveLength(1);
    });
});
