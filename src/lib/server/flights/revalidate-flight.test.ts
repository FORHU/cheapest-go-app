import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'duffel_test_token' } }));
vi.mock('@/lib/server/flights/mystifly-client', () => ({ mystiflyRequest: vi.fn() }));

import { revalidateFlight } from './revalidate-flight';

afterEach(() => vi.unstubAllGlobals());

function stubDuffelPriceAction(data: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })));
}

describe('revalidateFlight (Duffel)', () => {
    it('reports the live fare together with the currency Duffel priced it in', async () => {
        stubDuffelPriceAction({ total_amount: '100.00', total_currency: 'USD', conditions: {} });

        const res = await revalidateFlight({
            provider: 'duffel',
            flightPayload: { _rawOffer: { id: 'off_1' }, oldPrice: 100 },
        });

        expect(res).toMatchObject({ success: true, newPrice: 100, newCurrency: 'USD' });
    });

    it('puts the offer id in the Price Action URL as a single, encoded path segment', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { total_amount: '100.00', total_currency: 'USD', conditions: {} } }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await revalidateFlight({
            provider: 'duffel',
            flightPayload: { _rawOffer: { id: 'off_A/../off_B?x=1' }, oldPrice: 100 },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
            `https://api.duffel.com/air/offers/${encodeURIComponent('off_A/../off_B?x=1')}/actions/price`,
        );
    });

    it('does not claim a currency when it could not read a price', async () => {
        stubDuffelPriceAction({ conditions: {} });

        const res = await revalidateFlight({
            provider: 'duffel',
            flightPayload: { _rawOffer: { id: 'off_1' }, oldPrice: 100 },
        });

        expect(res.newPrice).toBeUndefined();
        expect(res.newCurrency).toBeUndefined();
    });
});
