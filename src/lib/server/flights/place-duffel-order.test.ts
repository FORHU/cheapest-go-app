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

/** Every POST /air/orders throws `abort`; the order list returns `listed`. */
function timingOutFetch(abort: Error, listed: unknown[]) {
    let postCount = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.endsWith('/air/orders')) { postCount++; throw abort; }
        if (url.startsWith('https://api.duffel.com/air/orders?limit=50')) {
            return new Response(JSON.stringify({ data: listed }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
    });
    return { fetchMock, posts: () => postCount };
}

describe('placeDuffelOrder — an order that timed out but landed', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('adopts the raw order Duffel already created instead of throwing', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const landed = {
            id: 'ord_landed', booking_reference: 'ABC123', total_amount: '100.00', total_currency: 'USD',
            // 1s ahead on purpose: orderMatches tolerates only 1s of back-skew before the attempt began.
            created_at: new Date(Date.now() + 1000).toISOString(),
            slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }],
            passengers: [{ family_name: 'Sandbox' }],
            documents: [{ type: 'electronic_ticket', unique_identifier: '1234567890' }],
        };
        const { fetchMock, posts } = timingOutFetch(abort, [landed]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc',
            rawOffer: { ...RAW_OFFER, slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }] },
            passengers: PAX, total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-timeout',
        });

        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
            expect(result.order.id).toBe('ord_landed');
            expect(result.order.booking_reference).toBe('ABC123');
            expect(result.order.documents).toHaveLength(1);
            expect(result.order.slices).toBeDefined();
        }
        expect(posts()).toBe(1);
    });

    it('reports a timeout, and orders nothing more, when no landed order matches', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const { fetchMock, posts } = timingOutFetch(abort, []);
        vi.stubGlobal('fetch', fetchMock);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc',
            rawOffer: { ...RAW_OFFER, slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }] },
            passengers: PAX, total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-timeout-miss',
        });

        expect(result.kind).toBe('error');
        if (result.kind === 'error') expect(result.status).toBe(504);
        expect(posts()).toBe(1);
    });
});

describe('placeDuffelOrder — refreshing an expired offer', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    const segment = (departing: string) => ({
        marketing_carrier: { iata_code: 'PR' }, marketing_carrier_flight_number: '300',
        origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' },
        departing_at: departing, passengers: [{ cabin_class: 'economy' }],
    });
    const offer = (id: string, total: string, departing: string) => ({
        id, total_amount: total, total_currency: 'USD', passengers: [{ id: 'pas_1' }],
        slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' }, departure_date: departing.slice(0, 10), segments: [segment(departing)] }],
    });
    const chosen = offer('off_1', '100.00', '2026-11-01T06:00:00');

    function expiresThenSucceeds() {
        let calls = 0;
        return () => (++calls === 1
            ? { status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } }
            : { status: 201, body: { data: { id: 'ord_refreshed' } } });
    }

    it('books the same journey, not a different departure the same carrier happens to sell', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', expiresThenSucceeds()],
            // A 22:00 departure at exactly the chosen price would win a "closest price" sort.
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offer('off_wrong', '100.00', '2026-11-01T22:00:00'),
                offer('off_same', '104.00', '2026-11-01T06:00:00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: chosen, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-refresh',
        });

        expect(result.kind).toBe('success');
        expect(orders).toHaveLength(2);
        expect(orders[1].selected_offers).toEqual(['off_same']);
        expect(orders[1].payments[0].amount).toBe('104.00');
    });

    it('reports the flight unavailable rather than substituting a different one', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } })],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offer('off_wrong', '100.00', '2026-11-01T22:00:00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: chosen, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-none',
        });

        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
            expect(result.status).toBe(422);
            expect(result.data.errors[0].code).toBe('offer_no_longer_available');
        }
        expect(orders).toHaveLength(1);
    });

    it('does not buy a refreshed offer priced in a different currency from the original', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        // The same journey, but quoted in EUR: its number cannot be compared with the USD quote,
        // nor captured against a USD hold.
        const inEuro = { ...offer('off_eur', '95.00', '2026-11-01T06:00:00'), total_currency: 'EUR' };
        const orders = duffel([
            ['POST', '/air/orders', expiresThenSucceeds()],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [inEuro] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: chosen, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-currency',
        });

        expect(result.kind).toBe('error');
        expect(orders).toHaveLength(1);
    });

    it("keeps Duffel's own message when the first 422 was not an expiry", async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'validation_error', message: 'phone_number is invalid' }] } })],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offer('off_wrong', '100.00', '2026-11-01T22:00:00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: chosen, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-validation',
        });

        expect(result.kind).toBe('error');
        if (result.kind === 'error') expect(result.data.errors[0].message).toBe('phone_number is invalid');
        expect(orders).toHaveLength(1);
    });
});

describe('placeDuffelOrder — a price_changed retry that times out', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    const RAW = { ...RAW_OFFER, slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }] };

    /** 1st order POST: 422 price_changed. Price Action: 105.00. 2nd order POST: throws. */
    function retryThrows(thrown: Error, listed: unknown[]) {
        const urls: string[] = [];
        let posts = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            urls.push(url);
            const method = init?.method ?? 'GET';
            if (method === 'POST' && url.endsWith('/air/orders')) {
                if (++posts === 1) return new Response(JSON.stringify({ errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] }), { status: 422 });
                throw thrown;
            }
            if (method === 'POST' && url.startsWith('https://api.duffel.com/air/offers/off_1/actions/price')) {
                return new Response(JSON.stringify({ data: { id: 'off_1', total_amount: '105.00', total_currency: 'USD', available_services: [] } }), { status: 200 });
            }
            if (url.startsWith('https://api.duffel.com/air/orders?limit=50')) {
                return new Response(JSON.stringify({ data: listed }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        }));
        return { orderPosts: () => posts, offerRequests: () => urls.filter(u => u.includes('/air/offer_requests')).length };
    }

    const landed = () => ({
        id: 'ord_retry_landed', booking_reference: 'XYZ789', total_amount: '105.00', total_currency: 'USD',
        // 1s ahead on purpose: orderMatches tolerates only 1s of back-skew.
        created_at: new Date(Date.now() + 1000).toISOString(),
        slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }],
        passengers: [{ family_name: 'Sandbox' }],
        documents: [],
    });

    it('adopts the order the retry created instead of re-booking the itinerary', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = retryThrows(Object.assign(new Error('aborted'), { name: 'AbortError' }), [landed()]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-retry-landed',
        });

        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
            expect(result.order.id).toBe('ord_retry_landed');
            expect(result.finalTotal).toBe('105.00');
        }
        expect(seen.orderPosts()).toBe(2);
        expect(seen.offerRequests()).toBe(0);
    });

    it('reports a timeout, not an expired offer, when the retry did not land', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = retryThrows(Object.assign(new Error('aborted'), { name: 'AbortError' }), []);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-retry-miss',
        });

        expect(result.kind).toBe('error');
        if (result.kind === 'error') expect(result.status).toBe(504);
        expect(seen.orderPosts()).toBe(2);
        expect(seen.offerRequests()).toBe(0);
    });

    it('treats a non-abort failure of the retry the same way', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = retryThrows(new TypeError('fetch failed'), []);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-retry-neterr',
        });

        expect(result.kind).toBe('error');
        if (result.kind === 'error') expect(result.status).toBe(504);
        expect(seen.orderPosts()).toBe(2);
        expect(seen.offerRequests()).toBe(0);
    });
});

describe('placeDuffelOrder — unknown outcome of an order POST (thrown error or 5xx)', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    const RAW = { ...RAW_OFFER, slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }] };
    const priceChanged = () => new Response(JSON.stringify({ errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] }), { status: 422 });
    const serverError = () => new Response(JSON.stringify({ errors: [{ code: 'airline_unknown_error', message: 'upstream blew up' }] }), { status: 500 });

    /** The n-th POST /air/orders runs posts[n]; a function that throws simulates a dropped connection. */
    function scripted(posts: Array<() => Response>, listed: unknown[]) {
        const urls: string[] = [];
        let orderPosts = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            urls.push(url);
            const method = init?.method ?? 'GET';
            if (method === 'POST' && url.endsWith('/air/orders')) return posts[orderPosts++]();
            if (method === 'POST' && url.startsWith('https://api.duffel.com/air/offers/off_1/actions/price')) {
                return new Response(JSON.stringify({ data: { id: 'off_1', total_amount: '105.00', total_currency: 'USD', available_services: [] } }), { status: 200 });
            }
            if (url.startsWith('https://api.duffel.com/air/orders?limit=50')) {
                return new Response(JSON.stringify({ data: listed }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        }));
        return { orderPosts: () => orderPosts, offerRequests: () => urls.filter(u => u.includes('/air/offer_requests')).length };
    }

    const landed = (total: string) => ({
        id: 'ord_landed', booking_reference: 'LND123', total_amount: total, total_currency: 'USD',
        // 1s ahead on purpose: orderMatches tolerates only 1s of back-skew.
        created_at: new Date(Date.now() + 1000).toISOString(),
        slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }],
        passengers: [{ family_name: 'Sandbox' }],
        documents: [],
    });

    const run = (key: string) => placeDuffelOrder({
        duffelToken: 'duffel_test_abc', rawOffer: RAW, passengers: PAX, total: '100.00', currency: 'USD',
        priceTolerance: 10, idempotencyKey: key,
    });
    const quiet = () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    };

    it('adopts a landed order when the first POST dies with a non-abort error', async () => {
        quiet();
        const seen = scripted([() => { throw new TypeError('fetch failed'); }], [landed('100.00')]);
        const result = await run('idem-d1');
        expect(result.kind).toBe('success');
        if (result.kind === 'success') expect(result.order.id).toBe('ord_landed');
        expect(seen.orderPosts()).toBe(1);
        expect(seen.offerRequests()).toBe(0);
    });

    it('reports a timeout, without ordering again, when that error left no order behind', async () => {
        quiet();
        const seen = scripted([() => { throw new TypeError('fetch failed'); }], []);
        const result = await run('idem-d2');
        expect(result.kind).toBe('error');
        if (result.kind === 'error') expect(result.status).toBe(504);
        expect(seen.orderPosts()).toBe(1);
        expect(seen.offerRequests()).toBe(0);
    });

    it('adopts a landed order when the first POST answers 5xx', async () => {
        quiet();
        const seen = scripted([serverError], [landed('100.00')]);
        const result = await run('idem-e1');
        expect(result.kind).toBe('success');
        if (result.kind === 'success') expect(result.order.id).toBe('ord_landed');
        expect(seen.orderPosts()).toBe(1);
        expect(seen.offerRequests()).toBe(0);
    });

    it('surfaces the real 5xx, unchanged, when the first POST left no order behind', async () => {
        quiet();
        const seen = scripted([serverError], []);
        const result = await run('idem-e2');
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
            expect(result.status).toBe(500);
            expect(result.data.errors[0].message).toBe('upstream blew up');
        }
        expect(seen.orderPosts()).toBe(1);
        expect(seen.offerRequests()).toBe(0);
    });

    it('adopts a landed order when the price_changed retry answers 5xx', async () => {
        quiet();
        const seen = scripted([priceChanged, serverError], [landed('105.00')]);
        const result = await run('idem-e3');
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
            expect(result.order.id).toBe('ord_landed');
            expect(result.finalTotal).toBe('105.00');
        }
        expect(seen.orderPosts()).toBe(2);
        expect(seen.offerRequests()).toBe(0);
    });

    it('surfaces the real 5xx, unchanged, when the price_changed retry left no order behind', async () => {
        quiet();
        const seen = scripted([priceChanged, serverError], []);
        const result = await run('idem-e4');
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
            expect(result.status).toBe(500);
            expect(result.data.errors[0].message).toBe('upstream blew up');
        }
        expect(seen.orderPosts()).toBe(2);
        expect(seen.offerRequests()).toBe(0);
    });
});
