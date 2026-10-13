import { describe, it, expect, vi, afterEach } from 'vitest';
import { placeDuffelOrder } from './place-duffel-order';

const RAW_OFFER = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }] };
const PAX = [{ id: 'pas_1', given_name: 'Test', family_name: 'Sandbox' }];

/** Routes fetch by method + URL prefix; records every /air/orders body. */
function duffel(routes: Array<[string, string, () => { status: number; body: unknown }]>) {
    const orderBodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/air/orders')) orderBodies.push(JSON.parse(String(init!.body)).data);
        const route = routes.find(([m, p]) => m === method && url.startsWith(`https://api.duffel.com${p}`));
        if (!route) return new Response('{}', { status: 404 });
        const { status, body } = route[2]();
        return new Response(JSON.stringify(body), { status });
    }));
    return orderBodies;
}

function priceChangesOnFirstOrder() {
    let calls = 0;
    return () => (++calls === 1
        ? { status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } }
        : { status: 201, body: { data: { id: 'ord_1' } } });
}

// What Duffel's price action really answers (checked against the sandbox): the new
// fare and `available_services: []` — no bags, and seats are never on an offer anyway.
const PRICE_ACTION: [string, string, () => { status: number; body: unknown }] =
    ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '105.00', total_currency: 'USD', available_services: [] } } })];

describe('placeDuffelOrder — fare changes while ordering', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('re-prices the selected bag instead of charging it at zero', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', priceChangesOnFirstOrder()],
            PRICE_ACTION,
            ['GET', '/air/offers/off_1?return_available_services=true', () => ({ status: 200, body: { data: { id: 'off_1', available_services: [{ id: 'ase_bag', type: 'baggage', total_amount: '20.00' }] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW_OFFER, passengers: PAX, total: '120.00', currency: 'USD',
            bagServiceIds: ['ase_bag'], priceTolerance: 10, idempotencyKey: 'idem-1',
        });

        expect(result.kind).toBe('success');
        expect(orders[1].payments[0].amount).toBe('125.00');
        expect(orders[1].services).toEqual([{ id: 'ase_bag', quantity: 1 }]);
    });

    it('re-prices a selected seat from the seat map', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', priceChangesOnFirstOrder()],
            PRICE_ACTION,
            ['GET', '/air/seat_maps?offer_id=off_1', () => ({ status: 200, body: { data: [{ cabins: [{ rows: [{ sections: [{ elements: [
                { type: 'seat', available_services: [{ id: 'ase_seat', passenger_id: 'pas_1', total_amount: '12.50' }] },
            ] }] }] }] }] } })],
        ]);

        await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW_OFFER, passengers: PAX, total: '112.50', currency: 'USD',
            seatServiceIds: ['ase_seat'], priceTolerance: 10, idempotencyKey: 'idem-2',
        });

        expect(orders[1].payments[0].amount).toBe('117.50');
    });
});

// ── Equivalence with /api/flights/book ──────────────────────────────────────────

const segment = (over: Record<string, unknown> = {}) => ({
    marketing_carrier: { iata_code: 'EK' },
    marketing_carrier_flight_number: '332',
    origin: { iata_code: 'MNL' },
    destination: { iata_code: 'ICN' },
    departing_at: '2026-11-20T08:00:00',
    ...over,
});

/** An offer with a real itinerary, so refresh and reconciliation have something to compare. */
const offerFor = (id: string, total: string, segmentOver: Record<string, unknown> = {}) => ({
    id,
    total_amount: total,
    total_currency: 'USD',
    passengers: [{ id: 'pas_1' }],
    slices: [{
        origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' },
        segments: [segment(segmentOver)],
    }],
});

const inOrder = (...responses: Array<{ status: number; body: unknown }>) => {
    let i = 0;
    return () => responses[Math.min(i++, responses.length - 1)];
};

describe('placeDuffelOrder — matches what /book does', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('adopts the raw order a timed-out attempt created, instead of reading fields it does not have', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const method = init?.method ?? 'GET';
            if (method === 'POST' && url.endsWith('/air/orders')) {
                // Never answers; only the abort ends it.
                return new Promise<Response>((_, reject) => {
                    init!.signal!.addEventListener('abort', () =>
                        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
                });
            }
            if (method === 'GET' && url.startsWith('https://api.duffel.com/air/orders?limit=50')) {
                return new Response(JSON.stringify({ data: [{
                    id: 'ord_late', booking_reference: 'ABC123',
                    created_at: new Date(Date.now() + 1000).toISOString(),
                    total_amount: '100.00', total_currency: 'USD',
                    slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' } }],
                    passengers: [{ family_name: 'Sandbox' }],
                    documents: [{ type: 'electronic_ticket', unique_identifier: '1234567890123' }],
                }] }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        }));

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: offerFor('off_1', '100.00'), passengers: PAX,
            total: '100.00', currency: 'USD', priceTolerance: 0.5, idempotencyKey: 'idem-t', orderTimeoutMs: 10,
        });

        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
            expect(result.order.id).toBe('ord_late');
            expect(result.order.booking_reference).toBe('ABC123');
        }
    });

    it('re-quotes only offers for the same flights, not the one nearest in price', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', inOrder(
                { status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } },
                { status: 201, body: { data: { id: 'ord_ok' } } },
            )],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offerFor('off_other_flight', '100.50', { departing_at: '2026-11-20T22:00:00' }),
                offerFor('off_same_flight', '104.00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: offerFor('off_1', '100.00'), passengers: PAX,
            total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-p',
        });

        expect(result.kind).toBe('success');
        expect(orders[1].selected_offers).toEqual(['off_same_flight']);
    });

    it('says unavailable when no offer is the same journey, rather than substituting one', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } })],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offerFor('off_other_flight', '100.50', { departing_at: '2026-11-20T22:00:00' }),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: offerFor('off_1', '100.00'), passengers: PAX,
            total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-n',
        });

        expect(result.kind).toBe('error');
        // The caller maps this failure to a code, so it has to say why we were refreshing.
        if (result.kind === 'error') {
            expect(result.status).toBe(422);
            expect(result.data?.errors?.[0]?.code).toBe('offer_no_longer_available');
        }
        expect(orders).toHaveLength(1);
    });

    it('reports a price change in bare fares, with ancillaries kept out of it', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } })],
            ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '150.00', total_currency: 'USD', available_services: [] } } })],
            ['GET', '/air/offers/off_1?return_available_services=true', () => ({ status: 200, body: { data: { id: 'off_1', available_services: [{ id: 'ase_bag', type: 'baggage', total_amount: '20.00' }] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW_OFFER, passengers: PAX, total: '120.00', currency: 'USD',
            bagServiceIds: ['ase_bag'], priceTolerance: 10, idempotencyKey: 'idem-b',
        });

        // 100 -> 150 is the fare. The 20 bag is on both sides and is not part of the change.
        expect(result).toEqual({ kind: 'price_changed', oldPrice: 100, newPrice: 150, currency: 'USD' });
    });

    it('still reports a price change when the retries are spent and the order keeps being refused', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } })],
            ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '100.50', total_currency: 'USD', available_services: [] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW_OFFER, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-u',
        });

        expect(result).toEqual({ kind: 'price_changed', oldPrice: 100, newPrice: 100.5, currency: 'USD' });
    });
});
