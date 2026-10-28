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
    /** The client payload; `flight._rawOffer` is the raw Duffel offer. */
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
    /** Revalidation's live fare, used only when it is LOWER than the offer's. */
    liveBaseTotal?: number;
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
    /** False when an identical live attempt already existed. */
    created: boolean;
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

export interface SessionStore {
    getOrCreate(row: SessionRow): Promise<StoredSession>;
    attachPayment(sessionId: string, fields: PaymentFields): Promise<void>;
    /** Expire OTHER unpaid, order-less sessions for this offer; returns their PaymentIntent ids. */
    supersedeOthers(userId: string, offerId: string, keepSessionId: string): Promise<string[]>;
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const fail = (status: number, body: Record<string, unknown>): PayFirstResponse => ({ status, body: { success: false, ...body } });

export async function createPayFirstPayment(input: PayFirstInput, deps: PayFirstDeps): Promise<PayFirstResponse> {
    const rawOffer = input.flight?._rawOffer;
    if (!rawOffer?.id) return fail(400, { error: 'Duffel offer data missing — cannot book.' });

    const seatIds = input.seatServiceIds ?? [];
    const bagIds = input.bagServiceIds ?? [];

    // The offer posted here is a search result and never carries services, so extras would
    // price at zero. Ask Duffel for the selected ones.
    let priced: any;
    try {
        priced = await deps.withServicePrices(rawOffer, seatIds, bagIds, input.duffelToken);
    } catch (err: any) {
        return fail(502, { error: err?.message ?? 'Could not price the selected extras.' });
    }

    // ── Quote ────────────────────────────────────────────────────────────────
    const { base, seatExtra, bagExtra } = computeOrderTotal(priced, seatIds, bagIds, true);
    // A fare that has dropped is adopted (else we would charge the old price while Duffel bills
    // the lower one). A rise never gets here: /book's revalidation gate already refused it.
    const baseFare = input.liveBaseTotal !== undefined && input.liveBaseTotal > 0 && input.liveBaseTotal < base
        ? input.liveBaseTotal
        : base;
    const quotedTotal = round2(baseFare + seatExtra + bagExtra);
    const baseCurrency = String(priced.total_currency || input.settlementCurrency).toLowerCase();

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

    const policy = input.serverFarePolicy as any;
    const row: SessionRow = {
        user_id: input.userId,
        provider: 'duffel',
        booking_reference: input.bookingReference,
        flight: input.sanitizedFlight,
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

    let stored: StoredSession;
    try {
        stored = await deps.store.getOrCreate(row);
    } catch (err: any) {
        console.error('[pay-first] could not create a booking session:', err?.message ?? err);
        return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
    }

    // ── The PaymentIntent ────────────────────────────────────────────────────
    let intent: IntentSummary;
    let attach = true;
    try {
        if (stored.paymentIntentId) {
            // A repeat submit. Reuse the hold if the traveller can still pay it; once the card
            // is authorised the booking is in progress and must not be started again.
            intent = await deps.gateway.retrieveIntent(stored.paymentIntentId);
            attach = false;
            if (!AWAITING_CARD.has(intent.status)) {
                return fail(409, {
                    errorCode: 'booking_pending',
                    error: 'Your payment is already being processed. We will email you when the booking is confirmed.',
                });
            }
        } else {
            const first = input.flight?.segments?.[0];
            const last = input.flight?.segments?.[input.flight.segments.length - 1];
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
                    passengerEmail: input.contact.email,
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
            }, `flight-pi-${input.userId}-${hash}`);
        }
    } catch (err: any) {
        console.error('[pay-first] could not create the PaymentIntent:', err?.message ?? err);
        return fail(502, { error: 'Payment could not be started. Your card was not charged. Please try again.' });
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
            await deps.gateway.cancelIntent(intent.id).catch(() => {});
            return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
        }
    }

    // A changed detail (a corrected name, a different bag) makes the earlier unpaid attempt
    // unpayable. Retire it and release its hold so it does not linger as an unexplained
    // Incomplete in Stripe.
    try {
        const stale = await deps.store.supersedeOthers(input.userId, rawOffer.id, stored.sessionId);
        for (const piId of stale) await deps.gateway.cancelIntent(piId).catch(() => {});
    } catch (err: any) {
        console.warn('[pay-first] could not retire superseded sessions:', err?.message ?? err);
    }

    return { status: 200, body: { success: true, clientSecret: intent.client_secret, sessionId: stored.sessionId, paymentIntentId: intent.id } };
}
