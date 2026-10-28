import { describe, it, expect } from 'vitest';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import {
    createPayFirstPayment,
    type PayFirstInput,
    type PayFirstDeps,
    type SessionRow,
    type StoredSession,
    type IntentSummary,
} from './pay-first-payment';

// ── Fakes ────────────────────────────────────────────────────────────────────

class FakeStore {
    sessions = new Map<string, { id: string; row: SessionRow; paymentIntentId: string | null; status: string }>();
    private n = 0;
    async getOrCreate(row: SessionRow): Promise<StoredSession> {
        const key = `${row.user_id}|${row.quote_hash}`;
        const live = [...this.sessions.values()].find(s => `${s.row.user_id}|${s.row.quote_hash}` === key && s.status !== 'expired');
        if (live) return { sessionId: live.id, created: false, paymentIntentId: live.paymentIntentId, bookingReference: live.row.booking_reference };
        const id = `sess_${++this.n}`;
        this.sessions.set(id, { id, row, paymentIntentId: null, status: 'initiated' });
        return { sessionId: id, created: true, paymentIntentId: null, bookingReference: row.booking_reference };
    }
    async attachPayment(sessionId: string, fields: { payment_intent_id: string }) {
        const s = this.sessions.get(sessionId)!;
        s.paymentIntentId = fields.payment_intent_id;
        s.status = 'payment_initiated';
    }
    async supersedeOthers(userId: string, offerId: string, keep: string) {
        const out: string[] = [];
        for (const s of this.sessions.values()) {
            const sameOffer = (s.row.flight as any)?._rawOffer?.id === offerId;
            if (s.id !== keep && s.row.user_id === userId && sameOffer && s.status !== 'expired') {
                s.status = 'expired';
                if (s.paymentIntentId) out.push(s.paymentIntentId);
            }
        }
        return out;
    }
}

class FakeGateway {
    intents = new Map<string, IntentSummary & { params: any }>();
    byKey = new Map<string, string>();
    createCalls: Array<{ params: any; key: string }> = [];
    cancelled: string[] = [];
    async createIntent(params: any, key: string): Promise<IntentSummary> {
        this.createCalls.push({ params, key });
        const existing = this.byKey.get(key);
        if (existing) return this.intents.get(existing)!;
        const id = `pi_${this.intents.size + 1}`;
        const intent = { id, status: 'requires_payment_method', client_secret: `${id}_secret`, params };
        this.intents.set(id, intent);
        this.byKey.set(key, id);
        return intent;
    }
    async retrieveIntent(id: string) { return this.intents.get(id)!; }
    async cancelIntent(id: string) { this.cancelled.push(id); this.intents.get(id)!.status = 'canceled'; }
}

const rawOffer = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }], available_services: [{ id: 'ase_bag', total_amount: '20.00' }] };

function makeInput(over: Partial<PayFirstInput> = {}): PayFirstInput {
    const flight = { price: 100, currency: 'USD', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: rawOffer };
    return {
        userId: 'user_1', flight, sanitizedFlight: { ...flight },
        passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }],
        contact: { email: 'ana@example.com', phone: '9171234567', countryCode: '63' },
        displayCurrency: 'USD', settlementCurrency: 'usd',
        serverFarePolicy: null, bookingReference: 'CG-REF-1', brand: 'cheapestgo',
        expiresAt: '2026-10-28T12:00:00.000Z', duffelToken: 'duffel_test_x',
        ...over,
    };
}

function makeDeps(over: Partial<PayFirstDeps> = {}) {
    const store = new FakeStore();
    const gateway = new FakeGateway();
    const deps: PayFirstDeps = {
        withServicePrices: async (offer: any) => offer,
        convert: (amount: number) => amount, // same-currency: identity
        store, gateway,
        ...over,
    };
    return { deps, store, gateway };
}

const expectedMinor = (base: number) => toStripeAmount(applyMarkup(base, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice, 'usd');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createPayFirstPayment', () => {
    it('creates one manual-capture intent for the marked-up quote and buys nothing', async () => {
        const { deps, gateway } = makeDeps();
        const res = await createPayFirstPayment(makeInput(), deps);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, sessionId: 'sess_1', paymentIntentId: 'pi_1', clientSecret: 'pi_1_secret' });
        const { params } = gateway.createCalls[0];
        expect(params.capture_method).toBe('manual');
        expect(params.amount).toBe(expectedMinor(100));
        expect(params.metadata).toMatchObject({ payFirst: 'true', provider: 'duffel', bookingSessionId: 'sess_1', quotedTotal: '100.00', baseCurrency: 'usd' });
        expect(params.metadata.duffelOrderId).toBeUndefined();
    });

    it('prices selected extras from the offer own services', async () => {
        const { deps, gateway } = makeDeps();
        await createPayFirstPayment(makeInput({ bagServiceIds: ['ase_bag'] }), deps);
        expect(gateway.createCalls[0].params.amount).toBe(expectedMinor(120));
        expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('120.00');
    });

    it('adopts a lower live fare from revalidation but never a higher one', async () => {
        const lower = makeDeps();
        await createPayFirstPayment(makeInput({ liveBaseTotal: 90 }), lower.deps);
        expect(lower.gateway.createCalls[0].params.metadata.quotedTotal).toBe('90.00');

        const higher = makeDeps();
        await createPayFirstPayment(makeInput({ liveBaseTotal: 130 }), higher.deps);
        expect(higher.gateway.createCalls[0].params.metadata.quotedTotal).toBe('100.00');
    });

    // The original bug: click confirm, press back while it submits, submit again.
    it('REGRESSION: a repeat submit of the same trip shares one session and one PaymentIntent', async () => {
        const { deps, store, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        const second = await createPayFirstPayment(makeInput(), deps);

        expect(second.status).toBe(200);
        expect(second.body.sessionId).toBe(first.body.sessionId);
        expect(second.body.paymentIntentId).toBe(first.body.paymentIntentId);
        expect(store.sessions.size).toBe(1);
        expect(gateway.createCalls).toHaveLength(1);
    });

    it('a corrected name is a new attempt: the old session is expired and its hold cancelled', async () => {
        const { deps, store, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        const corrected = await createPayFirstPayment(makeInput({
            passengers: [{ firstName: 'Anna', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }],
        }), deps);

        expect(corrected.body.sessionId).not.toBe(first.body.sessionId);
        expect(store.sessions.get(first.body.sessionId as string)!.status).toBe('expired');
        expect(gateway.cancelled).toEqual([first.body.paymentIntentId]);
    });

    // A -> B -> A: the traveller changes a detail and then changes it back. The hash matches the
    // expired first attempt again, but it must be a fresh attempt with its own intent, not Stripe's
    // cached (cancelled) one for the old idempotency key.
    it('REGRESSION: changing a detail and changing it back gets a new session and a new PaymentIntent', async () => {
        const { deps, store, gateway } = makeDeps();
        const ana = [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }];
        const anna = [{ firstName: 'Anna', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }];

        const a1 = await createPayFirstPayment(makeInput({ passengers: ana }), deps);
        const b = await createPayFirstPayment(makeInput({ passengers: anna }), deps);
        const a2 = await createPayFirstPayment(makeInput({ passengers: ana }), deps);

        expect(store.sessions.get(a1.body.sessionId as string)!.status).toBe('expired');
        expect(a2.status).toBe(200);
        expect(a2.body.sessionId).not.toBe(a1.body.sessionId);
        expect(a2.body.paymentIntentId).not.toBe(a1.body.paymentIntentId);
        expect(a2.body.paymentIntentId).not.toBe(b.body.paymentIntentId);
        expect(gateway.intents.get(a2.body.paymentIntentId as string)!.status).toBe('requires_payment_method');
        expect(gateway.createCalls).toHaveLength(3);
        expect(new Set(gateway.createCalls.map(c => c.key)).size).toBe(3);
    });

    it('a corrected phone number is a new attempt, so an order is never built from stale contact data', async () => {
        const { deps } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        const fixed = await createPayFirstPayment(makeInput({
            contact: { email: 'ana@example.com', phone: '9179999999', countryCode: '63' },
        }), deps);
        expect(fixed.body.sessionId).not.toBe(first.body.sessionId);
    });

    it('answers booking_pending instead of creating anything once the card is already authorised', async () => {
        const { deps, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        gateway.intents.get(first.body.paymentIntentId as string)!.status = 'requires_capture';

        const again = await createPayFirstPayment(makeInput(), deps);
        expect(again.status).toBe(409);
        expect(again.body).toMatchObject({ success: false, errorCode: 'booking_pending' });
        expect(gateway.createCalls).toHaveLength(1);
    });

    it('refuses before creating a session when the charge currency cannot be converted', async () => {
        const { deps, store, gateway } = makeDeps({
            convert: (amount: number, from: string, to: string) => {
                if (from.toLowerCase() === to.toLowerCase()) return amount;
                throw new Error('no rate');
            },
        });
        const res = await createPayFirstPayment(makeInput({ displayCurrency: 'PHP' }), deps);
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ code: 'FX_UNAVAILABLE' });
        expect(store.sessions.size).toBe(0);
        expect(gateway.createCalls).toHaveLength(0);
    });

    it('cancels the hold and says the card was not charged if the session cannot be saved', async () => {
        const { deps, store, gateway } = makeDeps();
        store.attachPayment = async () => { throw new Error('db down'); };
        const res = await createPayFirstPayment(makeInput(), deps);
        expect(res.status).toBe(500);
        expect(String(res.body.error)).toMatch(/not charged/i);
        expect(gateway.cancelled).toEqual(['pi_1']);
    });

    it('rejects an offer with no Duffel id', async () => {
        const { deps } = makeDeps();
        const res = await createPayFirstPayment(makeInput({ flight: { segments: [] } }), deps);
        expect(res.status).toBe(400);
    });
});
