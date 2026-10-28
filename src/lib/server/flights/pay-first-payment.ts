import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { computeOrderTotal, quoteHash } from './flight-quote';
import type { withDuffelServicePrices } from './duffel-service-prices';

/**
 * Pay-first: the traveller has submitted the booking form. Quote the trip, make sure there is
 * exactly one live attempt for it, and hand back a PaymentIntent that only HOLDS the card.
 * Nothing is bought from the airline here — that happens after authorisation (see
 * settle-authorized-flight.ts), so a submit that is repeated, abandoned or raced costs nothing.
 */

export interface PayFirstInput {
    userId: string;
    /** The client payload; `flight._rawOffer` is the raw Duffel offer. Its prices are NOT trusted. */
    flight: any;
    /** Shallow copy of `flight` stored on the session (keeps `_rawOffer` for the later order). */
    sanitizedFlight: any;
    passengers: any[];
    contact: { email: string; [k: string]: any };
    seatServiceIds?: string[];
    bagServiceIds?: string[];
    displayCurrency?: string;
    /** The supplier's currency, lowercase. */
    settlementCurrency: string;
    /**
     * The offer's current bare fare as the SERVER read it from Duffel (revalidation's Price
     * Action), in the currency Duffel reported. This, never the browser's `total_amount`, is
     * what the traveller is charged for the fare. Absent or unusable means the trip is not priced.
     */
    liveFare?: { amount: number; currency: string };
    serverFarePolicy: any;
    bookingReference: string;
    brand: string;
    bundleHotelId?: string;
    expiresAt: string;
    duffelToken: string;
}

export interface PayFirstResponse { status: number; body: Record<string, unknown> }

export interface SessionRow {
    user_id: string;
    provider: 'duffel';
    booking_reference: string;
    flight: unknown;
    passengers: unknown;
    contact: unknown;
    idempotency_key: string;
    quote_hash: string;
    fare_policy: unknown;
    policy_source: string | null;
    policy_version: string | null;
    is_refundable: boolean | null;
    is_changeable: boolean | null;
    refund_penalty_amount: number | null;
    refund_penalty_currency: string | null;
    policy_locked: true;
    status: 'initiated';
    expires_at: string;
    seat_service_ids?: string[];
    seat_total?: number;
    bag_service_ids?: string[];
    bag_total?: number;
}

export interface StoredSession {
    sessionId: string;
    paymentIntentId: string | null;
    /** Always the stored session's own reference, so a retry sends Stripe identical parameters. */
    bookingReference: string;
}

export interface PaymentFields {
    payment_intent_id: string;
    currency: string;
    original_price: number;
    charged_price: number;
    markup_pct: number;
    payment_currency: string;
}

/** A live session for the same offer that belongs to a different exact attempt. */
export interface OtherAttempt {
    sessionId: string;
    status: string;
    paymentIntentId: string | null;
}

export interface SessionStore {
    /** The live session for this exact attempt (same user and quote hash), creating it if needed. */
    getOrCreate(row: SessionRow): Promise<StoredSession>;
    attachPayment(sessionId: string, fields: PaymentFields): Promise<void>;
    /**
     * Live, order-less sessions of this user for this offer whose quote hash differs from
     * `excludeHash`: earlier attempts the traveller has since edited, or already paid.
     */
    listOtherAttempts(userId: string, offerId: string, excludeHash: string): Promise<OtherAttempt[]>;
    /** Retire unpaid sessions (only `initiated` / `payment_initiated` ones are touched). */
    expireSessions(sessionIds: string[]): Promise<void>;
}

export interface IntentSummary { id: string; status: string; client_secret: string | null }

export interface PaymentGateway {
    createIntent(params: Record<string, unknown>, idempotencyKey: string): Promise<IntentSummary>;
    retrieveIntent(id: string): Promise<IntentSummary>;
    cancelIntent(id: string): Promise<void>;
}

export interface PayFirstDeps {
    withServicePrices: typeof withDuffelServicePrices;
    /** Strict currency conversion; throws when a rate is unavailable. */
    convert: (amount: number, from: string, to: string) => number;
    store: SessionStore;
    gateway: PaymentGateway;
}

/** PaymentIntent states in which the traveller can still enter or confirm a card. */
const AWAITING_CARD = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);
/** States in which the card has been authorised or charged: a booking is in progress. */
const PAID_OR_PAYING = new Set(['requires_capture', 'processing', 'succeeded']);
/** Session statuses in which an earlier attempt is already paid or being booked. */
const BUSY_SESSION = new Set(['payment_authorized', 'processing']);

/** A new attempt is started at most this many times when the one in hand turns out to be dead. */
const MAX_ATTEMPTS = 2;

const round2 = (n: number) => Math.round(n * 100) / 100;
const fail = (status: number, body: Record<string, unknown>): PayFirstResponse => ({ status, body: { success: false, ...body } });
const pending = (): PayFirstResponse => fail(409, {
    errorCode: 'booking_pending',
    error: 'Your payment is already being processed. We will email you when the booking is confirmed.',
});

export async function createPayFirstPayment(input: PayFirstInput, deps: PayFirstDeps): Promise<PayFirstResponse> {
    const rawOffer = input.flight?._rawOffer;
    if (!rawOffer?.id) return fail(400, { error: 'Duffel offer data missing — cannot book.' });

    // ── The server's price for the fare ──────────────────────────────────────
    // The offer posted here came from the browser, so its total_amount / total_currency are not
    // evidence of anything. The fare is the figure the server read from Duffel; without one
    // there is nothing safe to charge.
    const live = input.liveFare;
    const liveCurrency = String(live?.currency ?? '').trim();
    if (!live || typeof live.amount !== 'number' || !Number.isFinite(live.amount) || live.amount <= 0 || !liveCurrency) {
        return fail(502, { error: 'We could not confirm the current fare. Please try again.', code: 'FARE_UNCONFIRMED' });
    }
    const baseCurrency = liveCurrency.toLowerCase();
    if (String(rawOffer.total_currency ?? '').trim().toLowerCase() !== baseCurrency) {
        return fail(409, { errorCode: 'flight_unavailable', error: 'This fare is no longer available. Please search again.' });
    }

    const seatIds = input.seatServiceIds ?? [];
    const bagIds = input.bagServiceIds ?? [];

    // The offer posted here is a search result and never carries services, so extras would
    // price at zero. Ask Duffel for the selected ones (fetched by offer id, so trusted).
    let priced: any;
    try {
        priced = await deps.withServicePrices(rawOffer, seatIds, bagIds, input.duffelToken);
    } catch (err: any) {
        return fail(502, { error: err?.message ?? 'Could not price the selected extras.' });
    }

    // ── Quote ────────────────────────────────────────────────────────────────
    // Only the extras are read from `priced`; its own total is the browser's and is ignored.
    const { seatExtra, bagExtra } = computeOrderTotal(priced, seatIds, bagIds, true);
    // The server's fare is always the one charged, whether it is above or below what the
    // traveller was shown (a rise was already refused by /book's revalidation gate).
    const quotedTotal = round2(live.amount + seatExtra + bagExtra);

    // The markup's flat part is USD (Duffel's order fee and Stripe's $0.30), so it is converted
    // into the supplier currency first. Dropped, not thrown, if that fails: failing a sale over
    // a few cents is the wrong trade.
    let flat = FLIGHT_MARKUP_SPEC.flat;
    try {
        flat = deps.convert(FLIGHT_MARKUP_SPEC.flat, 'usd', baseCurrency);
    } catch (err: any) {
        flat = 0;
        console.error(`[pay-first] Could not convert the flat markup USD→${baseCurrency} (${err?.message}) — charging the proportional part only.`);
    }
    const pricing = applyMarkup(quotedTotal, FLIGHT_MARKUP_SPEC, flat);

    const chargeCurrency = String(input.displayCurrency || input.settlementCurrency).toLowerCase();
    let chargePrice: number;
    try {
        chargePrice = chargeCurrency !== baseCurrency
            ? round2(deps.convert(pricing.chargedPrice, baseCurrency, chargeCurrency.toUpperCase()))
            : pricing.chargedPrice;
    } catch (err: any) {
        console.error(`[pay-first] FX conversion failed (${baseCurrency}→${chargeCurrency}):`, err?.message);
        // Nothing has been created yet, so there is nothing to undo.
        return fail(503, {
            error: 'Currency conversion is temporarily unavailable. Please try again shortly.',
            code: 'FX_UNAVAILABLE',
        });
    }
    const amountMinor = toStripeAmount(chargePrice, chargeCurrency);

    // ── One live attempt per exact quote ─────────────────────────────────────
    const hash = quoteHash({
        offerId: rawOffer.id,
        passengers: input.passengers,
        seatServiceIds: seatIds,
        bagServiceIds: bagIds,
        // The Duffel order is built from the stored session, which a reused session never
        // refreshes — so contact data is part of the attempt's identity (see quoteHash).
        contact: input.contact,
        chargeCurrency,
        amountMinor,
    });

    // The later order is built from the stored session, so the offer kept on it carries the
    // server's fare. Nothing else on the offer is touched (no services are added to it).
    const trustedFlight = {
        ...input.sanitizedFlight,
        _rawOffer: { ...rawOffer, total_amount: live.amount.toFixed(2), total_currency: liveCurrency.toUpperCase() },
    };

    const policy = input.serverFarePolicy as any;
    const row: SessionRow = {
        user_id: input.userId,
        provider: 'duffel',
        booking_reference: input.bookingReference,
        flight: trustedFlight,
        passengers: input.passengers,
        contact: input.contact,
        idempotency_key: hash,
        quote_hash: hash,
        fare_policy: policy ?? null,
        policy_source: policy?.policySource ?? null,
        policy_version: policy?.policyVersion ?? null,
        is_refundable: policy?.isRefundable ?? null,
        is_changeable: policy?.isChangeable ?? null,
        refund_penalty_amount: policy?.refundPenaltyAmount ?? null,
        refund_penalty_currency: policy?.refundPenaltyCurrency ?? null,
        policy_locked: true,
        status: 'initiated',
        expires_at: input.expiresAt,
        ...(seatIds.length ? { seat_service_ids: seatIds, seat_total: seatExtra } : {}),
        ...(bagIds.length ? { bag_service_ids: bagIds, bag_total: bagExtra } : {}),
    };

    // ── Earlier attempts for this offer ──────────────────────────────────────
    // The hash includes the amount and every edited detail, so a resubmit after paying can hash
    // differently. Whatever is paid or paying blocks a second attempt outright (a second one
    // would buy a second ticket); the rest are stale and are retired once this attempt is saved.
    let others: OtherAttempt[];
    try {
        others = await deps.store.listOtherAttempts(input.userId, rawOffer.id, hash);
    } catch (err: any) {
        console.error('[pay-first] could not look up earlier attempts:', err?.message ?? err);
        return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
    }
    const stale: Array<{ sessionId: string; paymentIntentId: string | null; intentStatus: string | null }> = [];
    for (const other of others) {
        if (BUSY_SESSION.has(other.status)) return pending();
        let intentStatus: string | null = null;
        if (other.paymentIntentId) {
            try {
                intentStatus = (await deps.gateway.retrieveIntent(other.paymentIntentId)).status;
            } catch (err: any) {
                // Cannot tell whether that card was authorised: assume it was.
                console.error('[pay-first] could not read an earlier PaymentIntent:', err?.message ?? err);
                return pending();
            }
            if (PAID_OR_PAYING.has(intentStatus)) return pending();
        }
        stale.push({ sessionId: other.sessionId, paymentIntentId: other.paymentIntentId, intentStatus });
    }

    // ── The session and its PaymentIntent ────────────────────────────────────
    let stored!: StoredSession;
    let intent!: IntentSummary;
    let attach = true;
    for (let attempt = 1; ; attempt++) {
        try {
            stored = await deps.store.getOrCreate(row);
        } catch (err: any) {
            console.error('[pay-first] could not create a booking session:', err?.message ?? err);
            return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
        }

        let dead = false;
        try {
            if (stored.paymentIntentId) {
                // A repeat submit. Reuse the hold if the traveller can still pay it; once the card
                // is authorised the booking is in progress and must not be started again.
                intent = await deps.gateway.retrieveIntent(stored.paymentIntentId);
                attach = false;
                if (intent.status === 'canceled') dead = true;
                else if (!AWAITING_CARD.has(intent.status)) return pending();
            } else {
                attach = true;
                // Outbound slice only: segments carry their slice index, so the outbound is every
                // segment sharing the first one's index (a round trip must not read "MNL → MNL").
                const segs: any[] = input.flight?.segments ?? [];
                const outboundIdx = segs[0]?.segmentIndex ?? 0;
                const outbound = segs.filter(sg => (sg?.segmentIndex ?? 0) === outboundIdx);
                const first = outbound[0] ?? segs[0];
                const last = outbound[outbound.length - 1] ?? segs[segs.length - 1];
                // The idempotency key comes from the session, not the quote hash: getOrCreate yields
                // one session per live attempt (stable across retries of it), whereas the hash recurs
                // when a traveller edits a detail and changes it back (A -> B -> A) and would replay
                // the cancelled intent.
                intent = await deps.gateway.createIntent({
                    amount: amountMinor,
                    currency: chargeCurrency,
                    // Hold the card; take the money only once the airline order exists.
                    capture_method: 'manual',
                    metadata: {
                        bookingReference: stored.bookingReference,
                        brand: input.brand,
                        bookingSessionId: stored.sessionId,
                        provider: 'duffel',
                        userId: input.userId,
                        passengerEmail: String(input.contact.email ?? '').trim().toLowerCase(),
                        originalPrice: String(pricing.originalPrice),
                        markupRate: String(pricing.markupRate),
                        markupAmount: String(pricing.markupAmount),
                        // What the post-authorisation step needs to place the order and size the capture.
                        payFirst: 'true',
                        quotedTotal: quotedTotal.toFixed(2),
                        baseCurrency,
                        flatInBase: String(flat),
                        ...(input.bundleHotelId ? { bundleHotelId: input.bundleHotelId, type: 'flight_bundle' } : { type: 'flight' }),
                    },
                    description: `${stored.bookingReference} · ${first?.origin ?? ''} → ${last?.destination ?? ''}`,
                }, `flight-pi-${input.userId}-${stored.sessionId}`);
                if (intent.status === 'canceled') dead = true;
            }
        } catch (err: any) {
            console.error('[pay-first] could not create the PaymentIntent:', err?.message ?? err);
            return fail(502, { error: 'Payment could not be started. Your card was not charged. Please try again.' });
        }

        if (!dead) break;

        // The hold is gone, so this session can never be paid. Retire it so the next getOrCreate
        // starts a fresh attempt (with its own idempotency key) instead of returning it again.
        await deps.store.expireSessions([stored.sessionId]).catch(() => {});
        if (attempt >= MAX_ATTEMPTS) {
            console.error('[pay-first] two attempts in a row came back with a cancelled PaymentIntent');
            return fail(502, { error: 'Payment could not be started. Your card was not charged. Please try again.' });
        }
    }

    if (attach) {
        try {
            await deps.store.attachPayment(stored.sessionId, {
                payment_intent_id: intent.id,
                currency: baseCurrency,
                original_price: pricing.originalPrice,
                charged_price: chargePrice,
                markup_pct: pricing.markupRate,
                payment_currency: chargeCurrency.toUpperCase(),
            });
        } catch (err: any) {
            console.error('[pay-first] could not save the PaymentIntent on the session:', err?.message ?? err);
            // Release the hold and retire the session, or the next submit would be handed this
            // session (no intent saved) and a Stripe replay of the cancelled intent.
            await deps.gateway.cancelIntent(intent.id).catch(() => {});
            await deps.store.expireSessions([stored.sessionId]).catch(() => {});
            return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
        }
    }

    // A changed detail (a corrected name, a different bag) makes the earlier unpaid attempt
    // unpayable. Retire it and release its hold so it does not linger as an unexplained
    // Incomplete in Stripe. Best effort: none of this affects the attempt we are returning.
    if (stale.length) {
        try {
            await deps.store.expireSessions(stale.map(s => s.sessionId));
        } catch (err: any) {
            console.warn('[pay-first] could not retire superseded sessions:', err?.message ?? err);
        }
        for (const s of stale) {
            if (s.paymentIntentId && s.intentStatus !== 'canceled') {
                await deps.gateway.cancelIntent(s.paymentIntentId).catch(() => {});
            }
        }
    }

    return { status: 200, body: { success: true, clientSecret: intent.client_secret, sessionId: stored.sessionId, paymentIntentId: intent.id } };
}
