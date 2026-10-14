import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * What /api/flights/book may do to our Duffel balance, and when.
 *
 * Order-first (the flag off) buys the ticket before the card is asked. Authorise-first (the flag
 * on) must not buy anything in this request: it only holds the card, and the ticket is bought
 * later, once the hold exists (finalise-authorised.ts). The first test is the rule; the second is
 * the control that shows this test can tell the two flows apart.
 */

const h = vi.hoisted(() => ({
    sessionInserts: [] as any[],
    sessionUpdates: [] as any[],
    piCreate: vi.fn(),
    piCancel: vi.fn(),
    events: [] as string[],
}));

// A chainable query builder that records what is written to booking_sessions.
function builder(table: string) {
    const chain: any = {
        insert: (row: any) => { if (table === 'booking_sessions') h.sessionInserts.push(row); return chain; },
        update: (row: any) => { if (table === 'booking_sessions') h.sessionUpdates.push(row); return chain; },
        select: () => chain, eq: () => chain, neq: () => chain, in: () => chain, not: () => chain,
        gte: () => chain, lt: () => chain, order: () => chain, limit: () => chain,
        single: async () => ({ data: { id: 'sess_test' }, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return chain;
}

vi.mock('@/utils/postgres/admin', () => ({ createAdminClient: () => ({ from: (table: string) => builder(table) }) }));
vi.mock('@/lib/db/postgres', () => ({ getSqlAdmin: () => () => Promise.resolve([]) }));
vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: async () => ({ user: { id: 'user_1' }, error: null }) }));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: async () => ({ success: true }) }));
vi.mock('@/lib/server/csrf', () => ({ checkCsrf: () => null }));
vi.mock('@/lib/server/api-logger', () => ({ logApiCall: () => {} }));
vi.mock('@/utils/env', () => ({ env: { DUFFEL_TOKEN: 'duffel_test_abc' } }));
vi.mock('@/lib/stripe/server', () => ({
    stripe: { paymentIntents: { create: (...a: unknown[]) => h.piCreate(...a), cancel: (...a: unknown[]) => h.piCancel(...a) } },
}));
vi.mock('@/lib/currency', () => ({
    convertCurrencyStrict: (amount: number) => amount,
    refreshExchangeRates: async () => {},
}));
vi.mock('@/lib/server/flights/revalidate-flight', () => ({
    revalidateFlight: async () => ({ success: true, seatsAvailable: true, priceChanged: false }),
}));

import { POST } from './route';

const RAW_OFFER = {
    id: 'off_1', total_amount: '100.00', total_currency: 'USD',
    passengers: [{ id: 'pas_1' }],
    slices: [{
        origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' },
        segments: [{
            marketing_carrier: { iata_code: 'EK' }, marketing_carrier_flight_number: '332',
            origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' },
            departing_at: '2026-12-20T08:00:00',
        }],
    }],
};

const payload = (over: Record<string, unknown> = {}) => ({
    provider: 'duffel',
    flight: {
        price: { total: 100, currency: 'USD' }, currency: 'USD',
        segments: [{ origin: 'MNL', destination: 'ICN', segmentIndex: 0 }],
        _rawOffer: RAW_OFFER,
    },
    passengers: [{
        type: 'ADT', firstName: 'Ana', lastName: 'Cruz', gender: 'F', birthDate: '1990-01-01',
        nationality: 'PH', passport: 'P1234567', passportExpiry: '2035-01-01',
    }],
    contact: { email: 'ana@example.com', phone: '1012345678', countryCode: '82' },
    idempotencyKey: 'idem-1',
    ...over,
});

const book = (body: unknown) => POST(new Request('http://localhost/api/flights/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}) as any);

/** Every Duffel request that would move money or hold a seat. */
const orderRequests = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([url, init]) =>
        typeof url === 'string' && url.endsWith('/air/orders') && (init as RequestInit | undefined)?.method === 'POST');

beforeEach(() => {
    h.sessionInserts.length = 0;
    h.sessionUpdates.length = 0;
    h.events.length = 0;
    h.piCreate.mockReset();
    h.piCancel.mockReset();
    h.piCreate.mockImplementation(async () => {
        h.events.push('card');
        return { id: 'pi_1', client_secret: 'secret_1' };
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function duffelThatRecords() {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === 'string' && url.endsWith('/air/orders') && init?.method === 'POST') {
            h.events.push('duffel_order');
            return new Response(JSON.stringify({ data: {
                id: 'ord_1', booking_reference: 'ABC123', documents: [], total_amount: '100.00',
                total_currency: 'USD', passengers: [{ given_name: 'Ana', family_name: 'Cruz' }], slices: [],
            } }), { status: 201 });
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('POST /api/flights/book — authorise-first', () => {
    it('holds the card and buys nothing: Duffel is not asked for an order at all', async () => {
        vi.stubEnv('DUFFEL_MANUAL_CAPTURE', 'on');
        const fetchMock = duffelThatRecords();

        const res = await book(payload());
        const json = await res.json();

        expect(json).toMatchObject({ success: true, clientSecret: 'secret_1', paymentIntentId: 'pi_1' });
        // The rule: no order, so no Duffel credit spent, at this point.
        expect(orderRequests(fetchMock)).toHaveLength(0);
        expect(h.events).toEqual(['card']);
    });

    it('asks the card for a hold, not a charge, and stamps the intent so later steps route by it', async () => {
        vi.stubEnv('DUFFEL_MANUAL_CAPTURE', 'on');
        duffelThatRecords();

        await book(payload());

        expect(h.piCreate).toHaveBeenCalledTimes(1);
        const [params] = h.piCreate.mock.calls[0];
        expect(params.capture_method).toBe('manual');
        expect(params.metadata.captureFlow).toBe('authorise_first');
        expect(params.amount).toBeGreaterThan(0);
    });

    it('prices the hold from the offer on the server, with no order to take the number from', async () => {
        vi.stubEnv('DUFFEL_MANUAL_CAPTURE', 'on');
        duffelThatRecords();

        // A client claiming a far lower price changes nothing: the amount comes from the offer.
        await book(payload({ flight: { ...payload().flight, price: { total: 1, currency: 'USD' } } }));

        const [params] = h.piCreate.mock.calls[0];
        const { applyMarkup, FLIGHT_MARKUP_SPEC, toStripeAmount } = await import('@/lib/pricing');
        const expected = toStripeAmount(applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice, 'usd');
        expect(params.amount).toBe(expected);
    });

    it('records what ordering will need later, and no order id', async () => {
        vi.stubEnv('DUFFEL_MANUAL_CAPTURE', 'on');
        duffelThatRecords();

        await book(payload({ confirmedPrice: 100 }));

        const finalUpdate = h.sessionUpdates.find(u => u.payment_intent_id === 'pi_1');
        expect(finalUpdate).toMatchObject({ capture_method: 'manual', confirmed_price: 100, status: 'payment_initiated' });
        expect(finalUpdate).not.toHaveProperty('duffel_pre_order_id');
    });

    it('refuses a phone number Duffel would reject before anyone is asked for a card', async () => {
        vi.stubEnv('DUFFEL_MANUAL_CAPTURE', 'on');
        const fetchMock = duffelThatRecords();

        // Five digits passes the form schema; stripped of leading zeros there is no number left.
        const res = await book(payload({ contact: { email: 'ana@example.com', phone: '00000', countryCode: '82' } }));

        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ success: false, errorCode: 'phone_number_invalid' });
        expect(h.piCreate).not.toHaveBeenCalled();
        expect(orderRequests(fetchMock)).toHaveLength(0);
    });
});

describe('POST /api/flights/book — order-first (the control)', () => {
    it('buys the ticket BEFORE it asks the card, which is the loss authorise-first removes', async () => {
        // No flag: today's behaviour. If this ever stops being true the test above proves nothing.
        const fetchMock = duffelThatRecords();

        const json = await (await book(payload())).json();

        expect(json).toMatchObject({ success: true });
        expect(orderRequests(fetchMock)).toHaveLength(1);
        expect(h.events).toEqual(['duffel_order', 'card']);
        expect(h.piCreate.mock.calls[0][0].capture_method).toBe('automatic');
    });
});
