import { describe, it, expect, vi, afterEach } from 'vitest';
import { withDuffelServicePrices } from './duffel-service-prices';

// A search-result offer: Duffel never includes available_services on these.
const SEARCH_OFFER = { id: 'off_1', total_amount: '229.15', total_currency: 'USD', passengers: [{ id: 'pas_1' }] };

const BAG = { id: 'ase_bag', type: 'baggage', total_amount: '20.00', total_currency: 'USD' };
const SEAT = { id: 'ase_seat', passenger_id: 'pas_1', total_amount: '12.50', total_currency: 'USD' };

function seatMapWith(...services: unknown[]) {
    return [{
        id: 'sea_1',
        cabins: [{ rows: [{ sections: [{ elements: [
            { type: 'seat', designator: '1A', available_services: services },
            { type: 'lavatory' },
        ] }] }] }],
    }];
}

function duffel(routes: Record<string, unknown>) {
    const fetchMock = vi.fn(async (url: string) => {
        const path = Object.keys(routes).find(p => url.startsWith(`https://api.duffel.com${p}`));
        if (!path) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify({ data: routes[path] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('withDuffelServicePrices', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('leaves the offer alone when nothing extra was selected', async () => {
        const fetchMock = duffel({});
        const offer = await withDuffelServicePrices(SEARCH_OFFER, [], [], 'duffel_test_abc');
        expect(offer).toBe(SEARCH_OFFER);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('prices a selected bag from the offer fetched with its services', async () => {
        const fetchMock = duffel({ '/air/offers/off_1?return_available_services=true': { ...SEARCH_OFFER, available_services: [BAG] } });

        const offer = await withDuffelServicePrices(SEARCH_OFFER, [], ['ase_bag'], 'duffel_test_abc');

        expect(offer.available_services).toEqual([BAG]);
        expect(offer.id).toBe('off_1');
        expect(fetchMock.mock.calls.map(c => c[0])).not.toContain(expect.stringContaining('seat_maps'));
    });

    it('prices a selected seat from the seat map — Duffel never lists seats on the offer', async () => {
        duffel({ '/air/seat_maps?offer_id=off_1': seatMapWith(SEAT) });

        const offer = await withDuffelServicePrices(SEARCH_OFFER, ['ase_seat'], [], 'duffel_test_abc');

        expect(offer.available_services).toEqual([expect.objectContaining({ id: 'ase_seat', total_amount: '12.50' })]);
    });

    it('prices seats and bags together when both were selected', async () => {
        duffel({
            '/air/offers/off_1?return_available_services=true': { ...SEARCH_OFFER, available_services: [BAG] },
            '/air/seat_maps?offer_id=off_1': seatMapWith(SEAT),
        });

        const offer = await withDuffelServicePrices(SEARCH_OFFER, ['ase_seat'], ['ase_bag'], 'duffel_test_abc');

        expect(offer.available_services.map((s: any) => s.id).sort()).toEqual(['ase_bag', 'ase_seat']);
    });

    it('refuses to guess when Duffel will not quote the extras', async () => {
        // Placing the order anyway would send a payment Duffel rejects
        // (payment_amount_does_not_match_order_amount).
        duffel({});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(withDuffelServicePrices(SEARCH_OFFER, [], ['ase_bag'], 'duffel_test_abc'))
            .rejects.toThrow(/seats or bags/i);
    });
});
