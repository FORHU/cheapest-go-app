import { describe, it, expect, vi } from 'vitest';
import { settleAuthorizedFlight, type SettleDeps, type SettleInput } from './settle-authorized-flight';

const rawOffer = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }], available_services: [] };

const session = {
    id: 'sess_1',
    flight: { _rawOffer: rawOffer, segments: [] },
    passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }],
    contact: { email: 'ana@example.com', phone: '9171234567', countryCode: '63' },
    seat_service_ids: null,
    bag_service_ids: null,
};
const input: SettleInput = { session, paymentIntentId: 'pi_1', duffelToken: 'duffel_test_x', priceTolerance: 0.5 };

const payFirstIntent = (over: Record<string, unknown> = {}) => ({
    id: 'pi_1', status: 'requires_capture', amount: 11_000, currency: 'usd',
    metadata: { payFirst: 'true', quotedTotal: '100.00', baseCurrency: 'usd', flatInBase: '0' } as Record<string, string>,
    ...over,
});

const rawOrder = {
    id: 'ord_1', booking_reference: 'ABC123', total_amount: '100.00', total_currency: 'USD',
    documents: [{ type: 'electronic_ticket', unique_identifier: 'T1' }], slices: [],
};

function makeDeps(over: Partial<SettleDeps> = {}) {
    const calls: string[] = [];
    const deps: SettleDeps = {
        retrievePaymentIntent: vi.fn(async () => payFirstIntent()),
        capturePaymentIntent: vi.fn(async () => { calls.push('capture'); }),
        withServicePrices: vi.fn(async (offer: any) => offer),
        placeOrder: vi.fn(async () => { calls.push('place'); return { kind: 'success' as const, order: rawOrder, finalTotal: '100.00', finalCurrency: 'USD', usedOffer: rawOffer }; }),
        cancelOrder: vi.fn(async () => { calls.push('cancelOrder'); return true; }),
        saveOrder: vi.fn(async () => { calls.push('save'); }),
        ...over,
    };
    return { deps, calls };
}

describe('settleAuthorizedFlight', () => {
    it('places the order, records it, then captures — in that order', async () => {
        const { deps, calls } = makeDeps();
        const r = await settleAuthorizedFlight(input, deps);

        expect(r).toMatchObject({ kind: 'settled', capturedMinor: 11_000, order: { orderId: 'ord_1', pnr: 'ABC123', tickets: ['T1'], isTicketed: true } });
        expect(calls).toEqual(['place', 'save', 'capture']);
        expect(deps.capturePaymentIntent).toHaveBeenCalledWith('pi_1', 11_000);
    });

    it('uses a key that is stable per session so a racing second caller cannot buy twice', async () => {
        const { deps } = makeDeps();
        await settleAuthorizedFlight(input, deps);
        expect((deps.placeOrder as any).mock.calls[0][0].idempotencyKey).toBe('flight-order-sess_1');
    });

    it('captures less when the airline order was cheaper than the quote', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'success' as const, order: { ...rawOrder, total_amount: '90.00' }, finalTotal: '90.00', finalCurrency: 'USD', usedOffer: rawOffer })),
        });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r.kind).toBe('settled');
        const captured = (deps.capturePaymentIntent as any).mock.calls[0][1] as number;
        expect(captured).toBeLessThan(11_000);
        expect(captured).toBeGreaterThan(0);
    });

    it('fails with flight_unavailable and touches no money when the airline will not sell it', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'error' as const, status: 422, data: { errors: [{ code: 'offer_no_longer_available' }] } })),
        });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'flight_unavailable' });
        expect(deps.saveOrder).not.toHaveBeenCalled();
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('fails with price_changed when the fare rose beyond tolerance', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'price_changed' as const, oldPrice: 100, newPrice: 120, currency: 'USD' })),
        });
        expect(await settleAuthorizedFlight(input, deps)).toMatchObject({ kind: 'failed', code: 'price_changed' });
    });

    it('asks the traveller to re-select extras when the offer had to be replaced', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'offer_replaced' as const, newOfferId: 'off_2', newOffer: {} })),
        });
        expect(await settleAuthorizedFlight(input, deps)).toMatchObject({ kind: 'failed', code: 'offer_replaced_seats_cleared' });
    });

    it('cancels the airline order if the capture is refused', async () => {
        const { deps, calls } = makeDeps({ capturePaymentIntent: vi.fn(async () => { throw new Error('card_declined'); }) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(calls).toContain('cancelOrder');
        expect((deps.cancelOrder as any).mock.calls[0][0]).toBe('ord_1');
    });

    it('cancels the order if it cannot be recorded against the session', async () => {
        const { deps } = makeDeps({ saveOrder: vi.fn(async () => { throw new Error('db down'); }) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.cancelOrder).toHaveBeenCalled();
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('cancels the order if it settled in a different currency than was quoted', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'success' as const, order: rawOrder, finalTotal: '100.00', finalCurrency: 'EUR', usedOffer: rawOffer })),
        });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.cancelOrder).toHaveBeenCalled();
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('does not capture a payment that was already captured', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ status: 'succeeded' })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'settled', capturedMinor: null });
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('refuses a payment that is not pay-first, so legacy sessions keep their old behaviour', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ metadata: {} })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'not_pay_first' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });

    it('refuses a payment that is neither authorised nor captured', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ status: 'requires_payment_method' })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });

    it('refuses an authorisation with no usable amount before buying anything', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ amount: 0 })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });

    it('fails with phone_number_invalid before calling the airline', async () => {
        const { deps } = makeDeps();
        const r = await settleAuthorizedFlight({ ...input, session: { ...session, contact: { ...session.contact, phone: '12' } } }, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'phone_number_invalid' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });
});
