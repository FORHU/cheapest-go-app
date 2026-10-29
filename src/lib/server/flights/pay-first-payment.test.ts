import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import {
    createPayFirstPayment,
    type PayFirstInput,
    type PayFirstDeps,
    type SessionRow,
    type StoredSession,
    type PaymentFields,
    type IntentSummary,
} from './pay-first-payment';

// ── Fakes ────────────────────────────────────────────────────────────────────

const LIVE = ['initiated', 'payment_initiated', 'payment_authorized', 'processing'];

interface FakeSession {
    id: string;
    row: SessionRow;
    paymentIntentId: string | null;
    status: string;
    /** Mirrors `duffel_pre_order_id IS NOT NULL`. */
    hasOrder: boolean;
    /** The fields attachPayment saved. */
    payment?: PaymentFields;
}

class FakeStore {
    sessions = new Map<string, FakeSession>();
    private n = 0;
    async getOrCreate(row: SessionRow): Promise<StoredSession> {
        const key = `${row.user_id}|${row.quote_hash}`;
        const live = [...this.sessions.values()].find(s => `${s.row.user_id}|${s.row.quote_hash}` === key && LIVE.includes(s.status));
        if (live) return { sessionId: live.id, paymentIntentId: live.paymentIntentId, bookingReference: live.row.booking_reference };
        const id = `sess_${++this.n}`;
        this.sessions.set(id, { id, row, paymentIntentId: null, status: 'initiated', hasOrder: false });
        return { sessionId: id, paymentIntentId: null, bookingReference: row.booking_reference };
    }
    // Enforces the real guard (`... AND status = 'initiated'`): a session that has moved on rejects.
    async attachPayment(sessionId: string, fields: PaymentFields) {
        const s = this.sessions.get(sessionId);
        if (!s || s.status !== 'initiated') throw new Error('Booking session is no longer open for payment');
        s.paymentIntentId = fields.payment_intent_id;
        s.status = 'payment_initiated';
        s.payment = fields;
    }
    async getPaymentIntentId(sessionId: string): Promise<string | null> {
        return this.sessions.get(sessionId)?.paymentIntentId ?? null;
    }
    async listOtherAttempts(userId: string, offerId: string, excludeHash: string) {
        return [...this.sessions.values()]
            .filter(s => s.row.user_id === userId
                && (s.row.flight as any)?._rawOffer?.id === offerId
                && s.row.quote_hash !== excludeHash
                && LIVE.includes(s.status))
            .map(s => ({ sessionId: s.id, status: s.status, paymentIntentId: s.paymentIntentId, hasOrder: s.hasOrder }));
    }
    // Returns only the rows it actually transitioned, like `UPDATE ... RETURNING`.
    async expireSessions(ids: string[]) {
        const moved: Array<{ sessionId: string; paymentIntentId: string | null }> = [];
        for (const id of ids) {
            const s = this.sessions.get(id);
            if (s && (s.status === 'initiated' || s.status === 'payment_initiated')) {
                s.status = 'expired';
                moved.push({ sessionId: id, paymentIntentId: s.paymentIntentId });
            }
        }
        return moved;
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

const ANA = [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }];
const ANNA = [{ firstName: 'Anna', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }];

function makeInput(over: Partial<PayFirstInput> = {}): PayFirstInput {
    const flight = { price: 100, currency: 'USD', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: rawOffer };
    return {
        userId: 'user_1', flight, sanitizedFlight: { ...flight },
        passengers: ANA,
        contact: { email: 'ana@example.com', phone: '9171234567', countryCode: '63' },
        displayCurrency: 'USD', settlementCurrency: 'usd',
        // The server's own price for the offer (from revalidation), in the offer's currency.
        liveFare: { amount: 100, currency: 'USD' },
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
        ensureRates: async () => {},
        store, gateway,
        ...over,
    };
    return { deps, store, gateway };
}

const expectedMinor = (base: number) => toStripeAmount(applyMarkup(base, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice, 'usd');

// ── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => vi.restoreAllMocks());

/** Everything the spy was called with, flattened to one searchable string. */
const logged = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(c => c.map(a => (a instanceof Error ? a.message : String(a))).join(' ')).join('\n');

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

    it('normalises the passenger email sent to Stripe', async () => {
        const { deps, gateway } = makeDeps();
        await createPayFirstPayment(makeInput({ contact: { email: '  Ana@Example.COM ', phone: '9171234567', countryCode: '63' } }), deps);
        expect(gateway.createCalls[0].params.metadata.passengerEmail).toBe('ana@example.com');
    });

    it('describes a round trip by its outbound slice, not first-to-last segment', async () => {
        const { deps, gateway } = makeDeps();
        const flight = {
            price: 100, currency: 'USD', _rawOffer: rawOffer,
            segments: [
                { origin: 'MNL', destination: 'HKG', segmentIndex: 0 },
                { origin: 'HKG', destination: 'NRT', segmentIndex: 0 },
                { origin: 'NRT', destination: 'MNL', segmentIndex: 1 },
            ],
        };
        await createPayFirstPayment(makeInput({ flight, sanitizedFlight: { ...flight } }), deps);
        expect(gateway.createCalls[0].params.description).toBe('CG-REF-1 · MNL → NRT');
    });

    // ── I1: the server prices the trip, never the browser ────────────────────

    describe('server-side pricing', () => {
        it('REGRESSION: a client-supplied tiny total cannot shrink the hold, and the stored offer carries the server fare', async () => {
            const { deps, store, gateway } = makeDeps();
            const cheap = { ...rawOffer, total_amount: '1.00' };
            const flight = { price: 1, currency: 'USD', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: cheap };
            const res = await createPayFirstPayment(
                makeInput({ flight, sanitizedFlight: { ...flight }, liveFare: { amount: 100, currency: 'USD' } }), deps);

            expect(res.status).toBe(200);
            expect(gateway.createCalls[0].params.amount).toBe(expectedMinor(100));
            expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('100.00');

            const stored = (store.sessions.get('sess_1')!.row.flight as any)._rawOffer;
            expect(stored.total_amount).toBe('100.00');
            expect(stored.total_currency).toBe('USD');
            expect(stored.id).toBe('off_1');
            expect(stored.passengers).toEqual([{ id: 'pas_1' }]);
            // The stored offer is not given services the traveller did not select.
            expect(stored.available_services).toEqual(cheap.available_services);
        });

        it('uses a live fare HIGHER than the client sent', async () => {
            const { deps, gateway } = makeDeps();
            await createPayFirstPayment(makeInput({ liveFare: { amount: 130, currency: 'USD' } }), deps);
            expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('130.00');
            expect(gateway.createCalls[0].params.amount).toBe(expectedMinor(130));
        });

        it('uses a lower live fare', async () => {
            const { deps, gateway } = makeDeps();
            await createPayFirstPayment(makeInput({ liveFare: { amount: 90, currency: 'USD' } }), deps);
            expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('90.00');
        });

        it('adds selected extras on top of the live fare, not the client fare', async () => {
            const { deps, gateway } = makeDeps();
            await createPayFirstPayment(makeInput({ liveFare: { amount: 130, currency: 'usd' }, bagServiceIds: ['ase_bag'] }), deps);
            expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('150.00');
            expect(gateway.createCalls[0].params.metadata.baseCurrency).toBe('usd');
        });

        it.each([
            ['missing', undefined],
            ['zero', { amount: 0, currency: 'USD' }],
            ['negative', { amount: -5, currency: 'USD' }],
            ['not a number', { amount: NaN, currency: 'USD' }],
            ['infinite', { amount: Infinity, currency: 'USD' }],
            ['without a currency', { amount: 100, currency: '' }],
        ])('refuses with FARE_UNCONFIRMED and creates nothing when the live fare is %s', async (_label, liveFare) => {
            const { deps, store, gateway } = makeDeps();
            const res = await createPayFirstPayment(makeInput({ liveFare: liveFare as any }), deps);
            expect(res.status).toBe(502);
            expect(res.body).toMatchObject({ success: false, code: 'FARE_UNCONFIRMED' });
            expect(store.sessions.size).toBe(0);
            expect(gateway.createCalls).toHaveLength(0);
        });

        it('answers 409 flight_unavailable and creates nothing when the client offer currency differs from the live one', async () => {
            const { deps, store, gateway } = makeDeps();
            const res = await createPayFirstPayment(makeInput({ liveFare: { amount: 100, currency: 'EUR' } }), deps);
            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ success: false, errorCode: 'flight_unavailable' });
            expect(store.sessions.size).toBe(0);
            expect(gateway.createCalls).toHaveLength(0);
        });

        it('compares currencies case-insensitively', async () => {
            const { deps } = makeDeps();
            const res = await createPayFirstPayment(makeInput({ liveFare: { amount: 100, currency: 'usd' } }), deps);
            expect(res.status).toBe(200);
        });
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

    // A -> B -> A: the traveller changes a detail and then changes it back. The hash matches the
    // expired first attempt again, but it must be a fresh attempt with its own intent, not Stripe's
    // cached (cancelled) one for the old idempotency key.
    it('REGRESSION: changing a detail and changing it back gets a new session and a new PaymentIntent', async () => {
        const { deps, store, gateway } = makeDeps();

        const a1 = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
        const b = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
        const a2 = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);

        expect(store.sessions.get(a1.body.sessionId as string)!.status).toBe('expired');
        expect(a2.status).toBe(200);
        expect(a2.body.sessionId).not.toBe(a1.body.sessionId);
        expect(a2.body.paymentIntentId).not.toBe(a1.body.paymentIntentId);
        expect(a2.body.paymentIntentId).not.toBe(b.body.paymentIntentId);
        expect(gateway.intents.get(a2.body.paymentIntentId as string)!.status).toBe('requires_payment_method');
        expect(gateway.createCalls).toHaveLength(3);
        expect(new Set(gateway.createCalls.map(c => c.key)).size).toBe(3);
    });

    it('a corrected name is a new attempt: the old session is expired and its hold cancelled', async () => {
        const { deps, store, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        const corrected = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

        expect(corrected.body.sessionId).not.toBe(first.body.sessionId);
        expect(store.sessions.get(first.body.sessionId as string)!.status).toBe('expired');
        expect(gateway.cancelled).toEqual([first.body.paymentIntentId]);
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

    // ── I2: never a second attempt while an earlier one is paid or paying ────

    describe('earlier attempts for the same offer', () => {
        it('REGRESSION: a differently-hashed resubmit while an earlier session is payment_authorized is booking_pending', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            store.sessions.get(first.body.sessionId as string)!.status = 'payment_authorized';

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(again.body).toMatchObject({ success: false, errorCode: 'booking_pending' });
            expect(store.sessions.size).toBe(1);
            expect(gateway.createCalls).toHaveLength(1);
        });

        it('is booking_pending while an earlier session is processing', async () => {
            const { deps, store } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            store.sessions.get(first.body.sessionId as string)!.status = 'processing';

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(store.sessions.size).toBe(1);
        });

        it('REGRESSION: is booking_pending when an earlier different-hash intent has authorised the card, even if the webhook has not moved the session yet', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            gateway.intents.get(first.body.paymentIntentId as string)!.status = 'requires_capture';

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(again.body).toMatchObject({ errorCode: 'booking_pending' });
            expect(store.sessions.size).toBe(1);
            expect(gateway.createCalls).toHaveLength(1);
            expect(gateway.cancelled).toEqual([]);
        });

        it('is booking_pending when an earlier intent has already succeeded', async () => {
            const { deps, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            gateway.intents.get(first.body.paymentIntentId as string)!.status = 'succeeded';
            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
        });

        it('fails safe (booking_pending) when the state of an earlier intent cannot be read', async () => {
            const { deps, store, gateway } = makeDeps();
            await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            gateway.retrieveIntent = async () => { throw new Error('stripe down'); };

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(again.body).toMatchObject({ errorCode: 'booking_pending' });
            expect(store.sessions.size).toBe(1);
            expect(gateway.createCalls).toHaveLength(1);
        });

        it('retires an earlier different-hash attempt that still awaits a card, and cancels its hold', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

            expect(second.status).toBe(200);
            expect(store.sessions.get(first.body.sessionId as string)!.status).toBe('expired');
            expect(store.sessions.get(second.body.sessionId as string)!.status).toBe('payment_initiated');
            expect(gateway.cancelled).toEqual([first.body.paymentIntentId]);
        });

        it('retires an earlier attempt that never got an intent, without a cancel call', async () => {
            const { deps, store, gateway } = makeDeps();
            // A session that was created but whose intent never attached.
            await store.getOrCreate({ ...makeInput() as any, user_id: 'user_1', quote_hash: 'old', booking_reference: 'R0', flight: { _rawOffer: rawOffer } } as SessionRow);
            const res = await createPayFirstPayment(makeInput(), deps);

            expect(res.status).toBe(200);
            expect(store.sessions.get('sess_1')!.status).toBe('expired');
            expect(gateway.cancelled).toEqual([]);
        });

        it('does not cancel an earlier intent that is already cancelled', async () => {
            const { deps, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            gateway.intents.get(first.body.paymentIntentId as string)!.status = 'canceled';
            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(second.status).toBe(200);
            expect(gateway.cancelled).toEqual([]);
        });

        it('ignores attempts by other travellers or for other offers', async () => {
            const { deps, store } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ userId: 'user_2' }), deps);
            store.sessions.get(first.body.sessionId as string)!.status = 'payment_authorized';
            const mine = await createPayFirstPayment(makeInput({ userId: 'user_1', passengers: ANNA }), deps);
            expect(mine.status).toBe(200);
        });
    });

    // ── R1: only ever cancel a hold this request actually retired ────────────

    describe('retiring superseded attempts', () => {
        it('REGRESSION: does not cancel a stale hold that was authorised in another tab after the attempts were listed', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            const staleSession = first.body.sessionId as string;
            const staleIntent = first.body.paymentIntentId as string;

            // The card is entered in the other tab between the list and the retire.
            const realExpire = store.expireSessions.bind(store);
            store.expireSessions = async (ids: string[]) => {
                gateway.intents.get(staleIntent)!.status = 'requires_capture';
                return realExpire(ids);
            };
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});

            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

            expect(second.status).toBe(200);
            expect(gateway.cancelled).toEqual([]);
            expect(gateway.intents.get(staleIntent)!.status).toBe('requires_capture');
            // Loud, and names what to look at: the webhook path has to deal with that attempt.
            expect(logged(err)).toContain(staleSession);
            expect(logged(err)).toContain(staleIntent);
        });

        it('cancels nothing, and still answers 200, when the sessions cannot be retired', async () => {
            const { deps, store, gateway } = makeDeps();
            await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            store.expireSessions = async () => { throw new Error('db down'); };
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

            expect(second.status).toBe(200);
            expect(gateway.cancelled).toEqual([]);
            expect(logged(warn)).toContain('db down');
        });

        it('does not cancel the hold of a session the retire did not transition (it moved on after the list)', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            const staleSession = first.body.sessionId as string;
            const staleIntent = first.body.paymentIntentId as string;

            // Listed as awaiting a card; authorised (session moved on) before the retire runs.
            const realList = store.listOtherAttempts.bind(store);
            store.listOtherAttempts = async (userId: string, offerId: string, excludeHash: string) => {
                const found = await realList(userId, offerId, excludeHash);
                store.sessions.get(staleSession)!.status = 'payment_authorized';
                return found;
            };

            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

            expect(second.status).toBe(200);
            expect(store.sessions.get(staleSession)!.status).toBe('payment_authorized');
            // The intent still looks cancellable, so only "the retire did not return it" holds this back.
            expect(gateway.intents.get(staleIntent)!.status).toBe('requires_payment_method');
            expect(gateway.cancelled).toEqual([]);
        });

        it('cancels the hold a session picked up between the list and the retire', async () => {
            const { deps, store, gateway } = makeDeps();
            // Listed without an intent...
            const old = await store.getOrCreate({ ...makeInput() as any, user_id: 'user_1', quote_hash: 'old', booking_reference: 'R0', flight: { _rawOffer: rawOffer } } as SessionRow);
            const realList = store.listOtherAttempts.bind(store);
            store.listOtherAttempts = async (userId: string, offerId: string, excludeHash: string) => {
                const found = await realList(userId, offerId, excludeHash);
                expect(found.map(f => f.paymentIntentId)).toEqual([null]);
                // ...then that attempt attaches its card hold before it is retired.
                const late = await gateway.createIntent({}, 'late-key');
                const s = store.sessions.get(old.sessionId)!;
                s.paymentIntentId = late.id;
                s.status = 'payment_initiated';
                return found;
            };

            const res = await createPayFirstPayment(makeInput(), deps);

            expect(res.status).toBe(200);
            expect(store.sessions.get(old.sessionId)!.status).toBe('expired');
            expect(gateway.cancelled).toEqual(['pi_1']);
        });

        it('leaves a stale hold alone when its fresh state cannot be read', async () => {
            const { deps, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            const staleIntent = first.body.paymentIntentId as string;

            // Readable when the attempts are checked, unreadable by the time of the retire.
            const realRetrieve = gateway.retrieveIntent.bind(gateway);
            let reads = 0;
            gateway.retrieveIntent = async (id: string) => {
                if (id === staleIntent && ++reads > 1) throw new Error('stripe blip');
                return realRetrieve(id);
            };
            const err = vi.spyOn(console, 'error').mockImplementation(() => {});

            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

            expect(second.status).toBe(200);
            expect(reads).toBe(2);
            expect(gateway.cancelled).toEqual([]);
            expect(logged(err)).toContain(staleIntent);
        });
    });

    // ── R2: an attempt that already holds an airline order is never retired ──

    describe('earlier attempts that already hold an airline order', () => {
        it('is booking_pending while an order-bearing earlier session is processing', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            const s = store.sessions.get(first.body.sessionId as string)!;
            s.status = 'processing';
            s.hasOrder = true;

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(again.body).toMatchObject({ errorCode: 'booking_pending' });
            expect(store.sessions.size).toBe(1);
            expect(gateway.createCalls).toHaveLength(1);
        });

        it('is booking_pending when an order-bearing earlier session has an authorised intent', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            store.sessions.get(first.body.sessionId as string)!.hasOrder = true;
            gateway.intents.get(first.body.paymentIntentId as string)!.status = 'requires_capture';

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(store.sessions.size).toBe(1);
            expect(gateway.cancelled).toEqual([]);
        });

        it('fails safe (booking_pending) when the intent of an order-bearing earlier session cannot be read', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            store.sessions.get(first.body.sessionId as string)!.hasOrder = true;
            gateway.retrieveIntent = async () => { throw new Error('stripe down'); };

            const again = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);
            expect(again.status).toBe(409);
            expect(store.sessions.size).toBe(1);
        });

        it('REGRESSION: starts the new attempt but neither expires an order-bearing session that still awaits a card nor cancels its hold', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput({ passengers: ANA }), deps);
            const orderBearing = first.body.sessionId as string;
            store.sessions.get(orderBearing)!.hasOrder = true;

            const second = await createPayFirstPayment(makeInput({ passengers: ANNA }), deps);

            expect(second.status).toBe(200);
            expect(second.body.sessionId).not.toBe(orderBearing);
            expect(store.sessions.get(orderBearing)!.status).toBe('payment_initiated');
            expect(gateway.cancelled).toEqual([]);
            expect(gateway.intents.get(first.body.paymentIntentId as string)!.status).toBe('requires_payment_method');
        });
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

    // ── I3: a cancelled intent must not leave the attempt stuck ──────────────

    describe('recovering from a dead attempt', () => {
        it('cancels the hold, expires the session and says the card was not charged if the session cannot be saved', async () => {
            const { deps, store, gateway } = makeDeps();
            store.attachPayment = async () => { throw new Error('db down'); };
            const res = await createPayFirstPayment(makeInput(), deps);
            expect(res.status).toBe(500);
            expect(String(res.body.error)).toMatch(/not charged/i);
            expect(gateway.cancelled).toEqual(['pi_1']);
            expect(store.sessions.get('sess_1')!.status).toBe('expired');
        });

        it('REGRESSION: after a failed save, submitting the same trip again succeeds with a new session and a new intent', async () => {
            const { deps, store, gateway } = makeDeps();
            const realAttach = store.attachPayment.bind(store);
            let calls = 0;
            store.attachPayment = async (id: string, f: any) => {
                if (calls++ === 0) throw new Error('db down');
                return realAttach(id, f);
            };

            const failed = await createPayFirstPayment(makeInput(), deps);
            expect(failed.status).toBe(500);

            const retry = await createPayFirstPayment(makeInput(), deps);
            expect(retry.status).toBe(200);
            expect(retry.body.sessionId).toBe('sess_2');
            expect(retry.body.paymentIntentId).toBe('pi_2');
            expect(new Set(gateway.createCalls.map(c => c.key)).size).toBe(2);
        });

        it('replaces an existing session whose intent has been cancelled', async () => {
            const { deps, store, gateway } = makeDeps();
            const first = await createPayFirstPayment(makeInput(), deps);
            gateway.intents.get(first.body.paymentIntentId as string)!.status = 'canceled';

            const again = await createPayFirstPayment(makeInput(), deps);
            expect(again.status).toBe(200);
            expect(again.body.sessionId).not.toBe(first.body.sessionId);
            expect(again.body.paymentIntentId).not.toBe(first.body.paymentIntentId);
            expect(store.sessions.get(first.body.sessionId as string)!.status).toBe('expired');
            expect(gateway.createCalls).toHaveLength(2);
        });

        it('starts a fresh attempt once when createIntent hands back a cancelled intent', async () => {
            const { deps, store, gateway } = makeDeps();
            const real = gateway.createIntent.bind(gateway);
            let n = 0;
            gateway.createIntent = async (params: any, key: string) => {
                if (n++ === 0) {
                    gateway.createCalls.push({ params, key });
                    return { id: 'pi_dead', status: 'canceled', client_secret: null };
                }
                return real(params, key);
            };

            const res = await createPayFirstPayment(makeInput(), deps);
            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBe('sess_2');
            expect(store.sessions.get('sess_1')!.status).toBe('expired');
            expect(gateway.createCalls).toHaveLength(2);
            expect(new Set(gateway.createCalls.map(c => c.key)).size).toBe(2);
        });

        it('gives up with 502 if the fresh attempt is cancelled too', async () => {
            const { deps, gateway } = makeDeps();
            gateway.createIntent = async (params: any, key: string) => {
                gateway.createCalls.push({ params, key });
                return { id: 'pi_dead', status: 'canceled', client_secret: null };
            };

            const res = await createPayFirstPayment(makeInput(), deps);
            expect(res.status).toBe(502);
            expect(String(res.body.error)).toMatch(/not charged/i);
            expect(gateway.createCalls).toHaveLength(2);
        });

        // ── R3: two identical submits racing for the same session ────────────

        it('REGRESSION: a concurrent identical submit that loses the attach race shares the winner\'s intent instead of cancelling it', async () => {
            const { deps, store, gateway } = makeDeps();
            const winner = await createPayFirstPayment(makeInput(), deps);

            // The loser read the session before the winner attached: its getOrCreate saw no intent
            // yet, so it asks Stripe for one under the same key and is handed the winner's.
            const realGetOrCreate = store.getOrCreate.bind(store);
            store.getOrCreate = async (row: SessionRow) => ({ ...(await realGetOrCreate(row)), paymentIntentId: null });

            const loser = await createPayFirstPayment(makeInput(), deps);

            expect(loser.status).toBe(200);
            expect(loser.body).toMatchObject({ success: true, sessionId: winner.body.sessionId, paymentIntentId: winner.body.paymentIntentId, clientSecret: 'pi_1_secret' });
            expect(gateway.cancelled).toEqual([]);
            expect(store.sessions.get('sess_1')!.status).toBe('payment_initiated');
            expect(gateway.intents.get('pi_1')!.status).toBe('requires_payment_method');
            expect(new Set(gateway.createCalls.map(c => c.key)).size).toBe(1);
        });

        it.each([
            ['the session holds a different intent', async () => 'pi_other'],
            ['the session has no intent', async () => null],
            ['the session cannot be re-read', async () => { throw new Error('db down'); }],
        ])('still cancels its own hold and retires the session when the save fails and %s', async (_label, reread) => {
            const { deps, store, gateway } = makeDeps();
            store.attachPayment = async () => { throw new Error('db down'); };
            store.getPaymentIntentId = reread as any;

            const res = await createPayFirstPayment(makeInput(), deps);

            expect(res.status).toBe(500);
            expect(String(res.body.error)).toMatch(/not charged/i);
            expect(gateway.cancelled).toEqual(['pi_1']);
            expect(store.sessions.get('sess_1')!.status).toBe('expired');
        });

        // ── R6: a failed retire is never silent ──────────────────────────────

        it('logs a warning when the session cannot be retired after a failed save', async () => {
            const { deps, store } = makeDeps();
            store.attachPayment = async () => { throw new Error('attach failed'); };
            store.expireSessions = async () => { throw new Error('expire failed'); };
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const res = await createPayFirstPayment(makeInput(), deps);

            expect(res.status).toBe(500);
            expect(logged(warn)).toContain('expire failed');
        });

        it('logs a warning when a dead session cannot be retired', async () => {
            const { deps, store, gateway } = makeDeps();
            gateway.createIntent = async (params: any, key: string) => {
                gateway.createCalls.push({ params, key });
                return { id: 'pi_dead', status: 'canceled', client_secret: null };
            };
            store.expireSessions = async () => { throw new Error('expire failed'); };
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const res = await createPayFirstPayment(makeInput(), deps);

            expect(res.status).toBe(502);
            expect(logged(warn)).toContain('expire failed');
        });
    });

    // ── R4: the offer id ends up in a URL, so it must look like an offer id ──

    describe('offer id', () => {
        const withOfferId = (id: string) => {
            const flight = { price: 100, currency: 'USD', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: { ...rawOffer, id } };
            return makeInput({ flight, sanitizedFlight: { ...flight } });
        };

        it.each(['off_A/../off_B', 'off_', 'off_a b', 'off_1?x=1', 'ord_123', '../off_1', 'off_1\n'])(
            'rejects %j with 400 before pricing or creating anything', async (id) => {
                const priced = vi.fn(async (offer: any) => offer);
                const { deps, store, gateway } = makeDeps({ withServicePrices: priced as any });

                const res = await createPayFirstPayment(withOfferId(id), deps);

                expect(res.status).toBe(400);
                expect(res.body).toMatchObject({ success: false });
                expect(priced).not.toHaveBeenCalled();
                expect(store.sessions.size).toBe(0);
                expect(gateway.createCalls).toHaveLength(0);
            });

        it('accepts a Duffel-shaped offer id', async () => {
            const { deps } = makeDeps();
            const res = await createPayFirstPayment(withOfferId('off_0000AbCdEfGh1234'), deps);
            expect(res.status).toBe(200);
        });
    });

    // ── R5: a cold instance has no live rates until someone fetches them ─────

    describe('exchange rates', () => {
        it('makes sure rates are loaded once, before any conversion', async () => {
            const events: string[] = [];
            const { deps } = makeDeps({
                ensureRates: async () => { events.push('ensure'); },
                convert: (amount: number) => { events.push('convert'); return amount; },
            });

            const res = await createPayFirstPayment(makeInput({ displayCurrency: 'PHP' }), deps);

            expect(res.status).toBe(200);
            expect(events.filter(e => e === 'ensure')).toHaveLength(1);
            expect(events.filter(e => e === 'convert').length).toBeGreaterThanOrEqual(2);
            expect(events[0]).toBe('ensure');
        });

        it('carries on with what it has, and says so, when rates cannot be loaded', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const { deps, gateway } = makeDeps({
                ensureRates: async () => { throw new Error('rates provider down'); },
            });

            const res = await createPayFirstPayment(makeInput(), deps);

            expect(res.status).toBe(200);
            expect(gateway.createCalls).toHaveLength(1);
            expect(logged(warn)).toContain('rates provider down');
        });
    });

    // ── R7: what the quote is built from ─────────────────────────────────────

    describe('quote inputs', () => {
        const RATES: Record<string, number> = { USD: 1, PHP: 50, EUR: 0.9, KRW: 1300 };
        const convertWithRates = (amount: number, from: string, to: string) => {
            const f = from.toUpperCase();
            const t = to.toUpperCase();
            if (f === t) return amount;
            return (amount / RATES[f]) * RATES[t];
        };
        const round2 = (n: number) => Math.round(n * 100) / 100;

        it('charges in the display currency at the converted price and records it', async () => {
            const { deps, store, gateway } = makeDeps({ convert: convertWithRates });
            const res = await createPayFirstPayment(makeInput({ displayCurrency: 'PHP' }), deps);

            const usd = applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat);
            const php = round2(usd.chargedPrice * 50);
            expect(res.status).toBe(200);
            const { params } = gateway.createCalls[0];
            expect(params.currency).toBe('php');
            expect(params.amount).toBe(toStripeAmount(php, 'php'));
            expect(params.amount).not.toBe(expectedMinor(100));
            expect(store.sessions.get('sess_1')!.payment).toMatchObject({
                payment_currency: 'PHP', currency: 'usd', charged_price: php, original_price: usd.originalPrice, markup_pct: usd.markupRate,
            });
        });

        it('sends a zero-decimal charge currency in whole units, not hundredths', async () => {
            const { deps, gateway } = makeDeps({ convert: convertWithRates });
            const res = await createPayFirstPayment(makeInput({ displayCurrency: 'KRW' }), deps);

            const krw = round2(applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice * 1300);
            expect(res.status).toBe(200);
            const { params } = gateway.createCalls[0];
            expect(params.currency).toBe('krw');
            expect(params.amount).toBe(toStripeAmount(krw, 'krw'));
            expect(params.amount).toBe(Math.round(krw));
            expect(params.amount).not.toBe(Math.round(krw * 100));
        });

        it('prices a non-USD supplier fare with the flat part converted into that currency', async () => {
            const convert = vi.fn(convertWithRates);
            const eurOffer = { ...rawOffer, total_currency: 'EUR' };
            const flight = { price: 100, currency: 'EUR', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: eurOffer };
            const { deps, store, gateway } = makeDeps({ convert });

            const res = await createPayFirstPayment(makeInput({
                flight, sanitizedFlight: { ...flight },
                liveFare: { amount: 100, currency: 'EUR' }, settlementCurrency: 'eur', displayCurrency: 'EUR',
            }), deps);

            const flatEur = convertWithRates(FLIGHT_MARKUP_SPEC.flat, 'usd', 'eur');
            expect(res.status).toBe(200);
            expect(convert).toHaveBeenCalledTimes(1);
            expect(convert).toHaveBeenCalledWith(FLIGHT_MARKUP_SPEC.flat, 'usd', 'eur');
            const { params } = gateway.createCalls[0];
            expect(params.currency).toBe('eur');
            expect(params.amount).toBe(toStripeAmount(applyMarkup(100, FLIGHT_MARKUP_SPEC, flatEur).chargedPrice, 'eur'));
            expect(params.metadata).toMatchObject({ baseCurrency: 'eur', quotedTotal: '100.00', flatInBase: String(flatEur) });
            expect((store.sessions.get('sess_1')!.row.flight as any)._rawOffer).toMatchObject({ total_amount: '100.00', total_currency: 'EUR' });
        });

        it('REGRESSION: prices extras from the server\'s services, never the prices the browser sent', async () => {
            const clientOffer = { ...rawOffer, available_services: [{ id: 'ase_bag', total_amount: '1.00' }] };
            const flight = { price: 100, currency: 'USD', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: clientOffer };
            const priced = vi.fn(async (offer: any) => ({ ...offer, available_services: [{ id: 'ase_bag', total_amount: '35.00' }] }));
            const { deps, store, gateway } = makeDeps({ withServicePrices: priced as any });

            const res = await createPayFirstPayment(makeInput({ flight, sanitizedFlight: { ...flight }, bagServiceIds: ['ase_bag'] }), deps);

            expect(res.status).toBe(200);
            expect(priced).toHaveBeenCalledWith(expect.objectContaining({ id: 'off_1' }), [], ['ase_bag'], 'duffel_test_x');
            expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('135.00');
            expect(gateway.createCalls[0].params.amount).toBe(expectedMinor(135));
            expect(store.sessions.get('sess_1')!.row.bag_total).toBe(35);
        });
    });

    it('rejects an offer with no Duffel id', async () => {
        const { deps } = makeDeps();
        const res = await createPayFirstPayment(makeInput({ flight: { segments: [] } }), deps);
        expect(res.status).toBe(400);
    });
});
