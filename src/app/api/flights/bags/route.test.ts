import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'duffel_test_abc' } }));

import { POST } from './route';

function post(body: unknown) {
    return POST(
        new Request('http://localhost/api/flights/bags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }) as any,
    );
}

const CHECKED_BAG = {
    id: 'ase_1',
    type: 'baggage',
    total_amount: '20.00',
    total_currency: 'USD',
    maximum_quantity: 1,
    metadata: { type: 'checked', maximum_weight_kg: 23 },
    passenger_ids: ['pas_1'],
    segment_ids: ['seg_1'],
};

describe('POST /api/flights/bags', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('reads bags from the offer fetched with return_available_services', async () => {
        // Duffel has no /air/offers/:id/available_services sub-resource: it 404s for
        // every offer, which this route reported as "offer expired" on every call.
        const fetchMock = vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ data: { id: 'off_1', available_services: [CHECKED_BAG] } }),
            { status: 200 },
        ));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const json = await (await post({ offerId: 'off_1', duffelPassengerIds: ['pas_1'] })).json();

        expect(fetchMock.mock.calls[0][0]).toBe('https://api.duffel.com/air/offers/off_1?return_available_services=true');
        expect(json.bagOptions).toEqual([{
            serviceId: 'ase_1',
            bagType: 'checked',
            price: 20,
            currency: 'USD',
            weightKg: 23,
            maxQuantity: 1,
            passengerIndex: 0,
            appliesToAllSegments: false,
        }]);
    });

    it('still reports an expired offer when Duffel no longer has it', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ errors: [{ code: 'not_found', message: 'Not found' }] }),
            { status: 404 },
        )));
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const json = await (await post({ offerId: 'off_gone', duffelPassengerIds: [] })).json();

        expect(json).toEqual({ success: false, errorCode: 'offer_expired' });
    });
});
