import { describe, it, expect, vi } from 'vitest';
import { finaliseDuffelAuthorised, type ClaimedSession, type FinaliseDeps, type SessionStore } from './finalise-authorised';

const OFFER = {
    id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }],
    slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' }, segments: [] }],
};

const intent = (over: Record<string, unknown> = {}) => ({
    id: 'pi_1', status: 'requires_capture', currency: 'usd', amount: 11_000, amount_capturable: 11_000,
    metadata: { captureFlow: 'authorise_first', bookingSessionId: 'sess_1', provider: 'duffel' },
    ...over,
});

const session = (over: Partial<ClaimedSession> = {}): ClaimedSession => ({
    id: 'sess_1', userId: 'user_1', flight: { _rawOffer: OFFER },
    passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'F', type: 'ADT' }],
    contact: { email: 'ana@example.com', phone: '10-1234-5678', countryCode: '82' },
    seatServiceIds: null, bagServiceIds: null, confirmedPrice: null, idempotencyKey: 'idem-1',
    duffelPreOrderId: null, previousClaimAt: null, ...over,
});

const ORDER = { id: 'ord_1', booking_reference: 'ABC123', documents: [], total_amount: '100.00', total_currency: 'USD' };

function harness(opts: {
    session?: ClaimedSession | null;
    pi?: Record<string, unknown>;
    deps?: Partial<FinaliseDeps>;
    store?: Partial<SessionStore>;
} = {}) {
    const log: string[] = [];
    const store: SessionStore = {
        claim: vi.fn(async () => { log.push('claim'); return opts.session === undefined ? session() : opts.session; }),
        bookingFor: vi.fn(async () => null),
        stakeOrder: vi.fn(async () => { log.push('stake'); }),
        recordOrder: vi.fn(async () => { log.push('record'); }),
        release: vi.fn(async () => { log.push('release'); }),
        fail: vi.fn(async () => { log.push('fail'); }),
        otherLiveOrder: vi.fn(async () => false),
        ...opts.store,
    };
    const deps: FinaliseDeps = {
        stripe: {
            paymentIntents: {
                retrieve: vi.fn(async () => opts.pi ?? intent()),
                capture: vi.fn(async () => { log.push('capture'); return {}; }),
                cancel: vi.fn(async () => ({})),
            },
        } as any,
        store,
        duffelToken: 'duffel_test_abc',
        priceTolerance: 0.5,
        placeOrder: vi.fn(async () => {
            log.push('place');
            return { kind: 'success', order: ORDER, finalTotal: '100.00', finalCurrency: 'USD', usedOffer: OFFER };
        }) as any,
        cancelOrder: vi.fn(async () => { log.push('cancel_order'); return true; }),
        findOrderSince: vi.fn(async () => null),
        servicePrices: vi.fn(async (offer: any) => offer),
        fetchOrder: vi.fn(async () => null),
        createBooking: vi.fn(async () => {
            log.push('book');
            return { success: true, bookingId: 'bk_1', pnr: 'ABC123', status: 'pnr_created' };
        }),
        markFailed: vi.fn(async () => { log.push('mark_failed'); }),
        notify: vi.fn(),
        quote: vi.fn(() => ({ stripeAmount: 10_500 })) as any,
        ...opts.deps,
    };
    return { log, store, deps };
}

const input = { sessionId: 'sess_1', paymentIntentId: 'pi_1' };

describe('finaliseDuffelAuthorised', () => {
    it('buys the order, ties it to the session, then captures, then records the booking', async () => {
        const h = harness();
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'booked', bookingId: 'bk_1', pnr: 'ABC123', status: 'pnr_created', alreadyBooked: false });
        expect(h.log).toEqual(['claim', 'place', 'stake', 'record', 'capture', 'book']);
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalledWith(
            'pi_1', { amount_to_capture: 10_500 }, { idempotencyKey: 'flight-capture-sess_1' },
        );
    });

    it('captures the lower amount when the order came to less than was authorised', async () => {
        const h = harness({ deps: { quote: vi.fn(() => ({ stripeAmount: 9_000 })) as any } });
        await finaliseDuffelAuthorised(input, h.deps);
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalledWith('pi_1', { amount_to_capture: 9_000 }, expect.anything());
    });

    it('never captures more than was authorised: a small rise is ours to absorb', async () => {
        const h = harness({ deps: { quote: vi.fn(() => ({ stripeAmount: 11_400 })) as any } });
        await finaliseDuffelAuthorised(input, h.deps);
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalledWith('pi_1', { amount_to_capture: 11_000 }, expect.anything());
    });

    it('releases the hold when the offer is gone, and never captures', async () => {
        const h = harness({ deps: {
            placeOrder: vi.fn(async () => ({ kind: 'error', status: 422, data: { errors: [{ code: 'offer_no_longer_available' }] } })) as any,
        } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'flight_unavailable' });
        expect(h.log).toEqual(['claim', 'fail', 'mark_failed']);
        expect(h.store.fail).toHaveBeenCalledWith('sess_1', { errorCode: 'flight_unavailable' });
    });

    it('releases the hold on a price rise and says what the new fare is', async () => {
        const priceChange = { oldPrice: 100, newPrice: 110, currency: 'USD' };
        const h = harness({ deps: { placeOrder: vi.fn(async () => ({ kind: 'price_changed', ...priceChange })) as any } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'price_changed', priceChange });
        expect(h.store.fail).toHaveBeenCalledWith('sess_1', { errorCode: 'price_changed', priceChange });
        expect(h.deps.stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('treats a replaced offer as unavailable: the traveller has to choose again', async () => {
        const h = harness({ deps: { placeOrder: vi.fn(async () => ({ kind: 'offer_replaced', newOfferId: 'o2', newOffer: {} })) as any } });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'refused', errorCode: 'flight_unavailable' });
    });

    it('gives the seat back, and says so, when the order was bought but the money would not move', async () => {
        const h = harness({ deps: {
            stripe: { paymentIntents: {
                retrieve: vi.fn(async () => intent()),
                capture: vi.fn(async () => { throw new Error('card_declined'); }),
                cancel: vi.fn(async () => ({})),
            } } as any,
        } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'booking_failed' });
        expect(h.deps.cancelOrder).toHaveBeenCalledWith('duffel_test_abc', 'ord_1', expect.any(String));
        expect(h.deps.notify).toHaveBeenCalled();
        expect(h.log).not.toContain('book');
    });

    it('does not refuse a booking that exists but could not be recorded after the money moved', async () => {
        const h = harness({ deps: { createBooking: vi.fn(async () => ({ success: false, error: 'db down' })) as any } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'in_progress' });
        expect(h.deps.notify).toHaveBeenCalled();
        expect(h.store.fail).not.toHaveBeenCalled();
    });

    it('refuses a duplicate: this traveller already holds an order for these passengers', async () => {
        const h = harness({ store: { otherLiveOrder: vi.fn(async () => true) } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'duplicate_booking' });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('refuses before ordering when the phone number can never be accepted', async () => {
        const h = harness({ session: session({ contact: { email: 'a@b.co', phone: '12' } }) });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'refused', errorCode: 'phone_number_invalid' });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('places nothing when another path already booked the session', async () => {
        const h = harness({ session: null, store: { bookingFor: vi.fn(async () => ({ id: 'bk_9', pnr: 'ZZZ999', status: 'ticketed' })) } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'booked', bookingId: 'bk_9', pnr: 'ZZZ999', status: 'ticketed', alreadyBooked: true });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('reports in_progress when the claim is held elsewhere and nothing is booked yet', async () => {
        const h = harness({ session: null });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'in_progress' });
    });

    it('leaves a card that is not authorised alone', async () => {
        const h = harness({ pi: intent({ status: 'requires_payment_method' }) });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'not_authorised', reason: 'requires_payment_method' });
        expect(h.store.claim).not.toHaveBeenCalled();
    });

    it('leaves an intent that was not created for this flow alone', async () => {
        const h = harness({ pi: intent({ metadata: { provider: 'duffel', bookingSessionId: 'sess_1' } }) });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'not_authorised', reason: 'wrong_flow' });
    });

    it('records the booking, without claiming or ordering, when the money was already captured', async () => {
        const h = harness({ pi: intent({ status: 'succeeded' }) });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toMatchObject({ kind: 'booked', bookingId: 'bk_1' });
        expect(h.store.claim).not.toHaveBeenCalled();
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('resumes an order the session already holds instead of buying another', async () => {
        const h = harness({
            session: session({ duffelPreOrderId: 'ord_9' }),
            deps: { fetchOrder: vi.fn(async () => ({ ...ORDER, id: 'ord_9' })) },
        });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toMatchObject({ kind: 'booked' });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
        expect(h.store.stakeOrder).toHaveBeenCalledWith('sess_1', 'ord_9');
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalled();
    });

    it('adopts an order the previous claimer placed but never recorded', async () => {
        const h = harness({
            session: session({ previousClaimAt: '2026-10-12T10:00:00.000Z' }),
            deps: { findOrderSince: vi.fn(async () => ({ ...ORDER, id: 'ord_late' })) },
        });
        await finaliseDuffelAuthorised(input, h.deps);

        expect(h.deps.placeOrder).not.toHaveBeenCalled();
        expect(h.store.stakeOrder).toHaveBeenCalledWith('sess_1', 'ord_late');
    });

    it('hands the claim back, and rethrows, when something unexpected goes wrong', async () => {
        const h = harness({ deps: { placeOrder: vi.fn(async () => { throw new Error('socket hang up'); }) as any } });
        await expect(finaliseDuffelAuthorised(input, h.deps)).rejects.toThrow('socket hang up');
        expect(h.store.release).toHaveBeenCalledWith('sess_1');
    });
});
