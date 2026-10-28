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
