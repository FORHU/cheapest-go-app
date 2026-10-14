import type Stripe from 'stripe';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe as defaultStripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { createAdminClient } from '@/utils/postgres/admin';
import { fromStripeAmount, getFlightPriceTolerance } from '@/lib/pricing';
import { createNotification } from '@/lib/server/admin/notify';
import { captureFlowOf } from './capture-flow';
import { computeOrderTotal } from './duffel-order-total';
import { buildDuffelOrderPassengers, toE164Phone } from './duffel-order-passengers';
import { mapDuffelOrderFailure } from './duffel-order-errors';
import { placeDuffelOrder } from './place-duffel-order';
import { quoteFlightCharge } from './flight-charge';
import { cancelDuffelOrder } from './duffel-cancel';
import { findOrderFromTimedOutAttempt } from './duffel-order-reconcile';
import { withDuffelServicePrices } from './duffel-service-prices';
import { withBookedItinerary } from './duffel-order-segments';
import { createBooking, markFailed } from './create-booking';
import { REUSE_WINDOW_MS } from './preorder-reuse';
import type { FinaliseOutcome, PriceChange, SessionFailure } from './authorised-outcome';

/**
 * Finalise a Duffel PaymentIntent whose card has been authorised (ADR-0050).
 *
 * The order is bought only now, so a declined card never costs us a ticket. This runs from the
 * Stripe webhook, from /confirm as its fallback, and from auto-recover; the claim below is what
 * makes any two of them place one order. Every refusal releases the hold and records why, so the
 * traveller is told the card was not charged.
 */

/**
 * A claim older than this may be taken over. An order attempt can legitimately run 130s plus one
 * 130s retry after a price change, so anything younger may still be a live attempt.
 */
const STALE_CLAIM_MS = 8 * 60 * 1000;

export interface ClaimedSession {
    id: string;
    userId: string;
    flight: any;
    passengers: any[];
    contact: any;
    seatServiceIds: string[] | null;
    bagServiceIds: string[] | null;
    confirmedPrice: number | null;
    idempotencyKey: string | null;
    duffelPreOrderId: string | null;
    /** When a previous claim began, if this claim took one over. */
    previousClaimAt: string | null;
}

export interface SessionStore {
    /** Atomically take the session to `ordering`, or null when it is held elsewhere or done. */
    claim(sessionId: string, staleAfterMs: number): Promise<ClaimedSession | null>;
    bookingFor(sessionId: string): Promise<{ id: string; pnr: string | null; status: string } | null>;
    /** The smallest possible write: tie an order to the session before anything else can fail. */
    stakeOrder(sessionId: string, orderId: string): Promise<void>;
    /** Write the order onto the session and hand it back to `payment_authorized`. */
    recordOrder(sessionId: string, fields: {
        orderId: string; pnr: string; tickets: string[]; ticketed: boolean;
        flight: any; originalPrice: number; chargedPrice: number;
    }): Promise<void>;
    /** Give a claim back without deciding anything. */
    release(sessionId: string): Promise<void>;
    fail(sessionId: string, failure: SessionFailure): Promise<void>;
    /** Does this traveller already hold an order for this offer and these passengers? */
    otherLiveOrder(args: {
        userId: string; offerId: string; excludeSessionId: string; passengers: any[]; windowMs: number;
    }): Promise<boolean>;
}

export interface FinaliseDeps {
    stripe: { paymentIntents: Pick<Stripe.PaymentIntentsResource, 'retrieve' | 'capture' | 'cancel'> };
    store: SessionStore;
    duffelToken: string | undefined;
    priceTolerance: number;
    placeOrder: typeof placeDuffelOrder;
    cancelOrder: typeof cancelDuffelOrder;
    findOrderSince: typeof findOrderFromTimedOutAttempt;
    servicePrices: typeof withDuffelServicePrices;
    fetchOrder: (token: string, orderId: string) => Promise<any | null>;
    createBooking: typeof createBooking;
    markFailed: (sessionId: string, paymentIntentId: string, reason: string) => Promise<void>;
    notify: (title: string, body: string) => void;
    quote: typeof quoteFlightCharge;
}

export async function finaliseDuffelAuthorised(
    input: { sessionId: string; paymentIntentId: string },
    overrides: Partial<FinaliseDeps> = {},
): Promise<FinaliseOutcome> {
    const d = resolveDeps(overrides);
    const { sessionId, paymentIntentId } = input;

    const pi = await d.stripe.paymentIntents.retrieve(paymentIntentId);
    if (captureFlowOf(pi.metadata as Record<string, string>) !== 'authorise_first' || pi.metadata?.bookingSessionId !== sessionId) {
        return { kind: 'not_authorised', reason: 'wrong_flow' };
    }

    // Captured already: the booking only has to be recorded, which createBooking does once.
    if (pi.status === 'succeeded') {
        return fromBooking(await d.createBooking({ sessionId, paymentIntentId }));
    }
    if (pi.status !== 'requires_capture') {
        return { kind: 'not_authorised', reason: pi.status };
    }

    const session = await d.store.claim(sessionId, STALE_CLAIM_MS);
    if (!session) {
        const booking = await d.store.bookingFor(sessionId);
        if (booking && booking.status !== 'failed') {
            return { kind: 'booked', bookingId: booking.id, pnr: booking.pnr ?? undefined, status: booking.status, alreadyBooked: true };
        }
        return { kind: 'in_progress' };
    }

    try {
        return await orderAndCapture(session, pi, d);
    } catch (err) {
        // Unexpected: hand the claim back so the sweep can try again. Anything already bought is
        // tied to the session (staked) before the first step that could throw.
        await d.store.release(sessionId).catch(() => { /* best effort */ });
        throw err;
    }
}

async function orderAndCapture(session: ClaimedSession, pi: Stripe.PaymentIntent, d: FinaliseDeps): Promise<FinaliseOutcome> {
    const refuse = async (errorCode: string, priceChange?: PriceChange): Promise<FinaliseOutcome> => {
        await d.store.fail(session.id, { errorCode, ...(priceChange ? { priceChange } : {}) });
        // Cancels the intent (releases the hold) and records the failed booking row the polling reads.
        await d.markFailed(session.id, pi.id, errorCode);
        return { kind: 'refused', errorCode, ...(priceChange ? { priceChange } : {}) };
    };

    const token = d.duffelToken;
    const rawOffer0 = session.flight?._rawOffer;
    if (!token || !rawOffer0?.id) return refuse('flight_unavailable');

    const seats = session.seatServiceIds ?? undefined;
    const bags = session.bagServiceIds ?? undefined;

    // The posted offer is a search result and carries no service prices; ask Duffel for them.
    const rawOffer = await d.servicePrices(rawOffer0, seats, bags, token);
    const computed = computeOrderTotal(rawOffer, seats, bags);
    const currency: string = rawOffer.total_currency ?? 'USD';

    const phone = toE164Phone(session.contact ?? {});
    if (!phone.ok) return refuse('phone_number_invalid');

    let order: any = null;
    let orderTotal = computed.total;
    let orderCurrency = currency;

    // 1. An order this session already holds: an earlier claimer got that far.
    if (session.duffelPreOrderId) {
        order = await d.fetchOrder(token, session.duffelPreOrderId);
    }

    // 2. Nothing held, but a claimer that died may have bought one we never heard about.
    if (!order && session.previousClaimAt) {
        const slices: any[] = rawOffer.slices ?? [];
        order = await d.findOrderSince(token, {
            sinceIso: session.previousClaimAt,
            origin: slices[0]?.origin?.iata_code ?? '',
            destination: slices[slices.length - 1]?.destination?.iata_code ?? '',
            totalAmount: computed.total,
            currency,
            familyName: session.passengers?.[0]?.lastName || undefined,
        });
    }

    if (order) {
        orderTotal = String(order.total_amount ?? computed.total);
        orderCurrency = String(order.total_currency ?? currency);
    } else {
        // 3. Buy it, unless this traveller already holds this journey from another session.
        const duplicate = await d.store.otherLiveOrder({
            userId: session.userId, offerId: rawOffer0.id, excludeSessionId: session.id,
            passengers: session.passengers ?? [], windowMs: REUSE_WINDOW_MS,
        });
        if (duplicate) return refuse('duplicate_booking');

        const placed = await d.placeOrder({
            duffelToken: token,
            rawOffer,
            passengers: buildDuffelOrderPassengers({
                passengers: session.passengers ?? [], contact: session.contact ?? {}, rawOffer, e164: phone.e164,
            }),
            total: computed.total,
            currency,
            seatServiceIds: seats,
            bagServiceIds: bags,
            confirmedPrice: session.confirmedPrice ?? undefined,
            priceTolerance: d.priceTolerance,
            idempotencyKey: session.idempotencyKey ?? crypto.randomUUID(),
        });

        if (placed.kind === 'price_changed') {
            return refuse('price_changed', { oldPrice: placed.oldPrice, newPrice: placed.newPrice, currency: placed.currency });
        }
        // Seats and bags cannot carry to a re-quoted offer; the traveller has to choose again.
        if (placed.kind === 'offer_replaced') return refuse('flight_unavailable');
        if (placed.kind === 'error') {
            return refuse(mapDuffelOrderFailure(placed.status, placed.data).errorCode ?? 'booking_failed');
        }

        order = placed.order;
        orderTotal = placed.finalTotal;
        orderCurrency = placed.finalCurrency;
    }

    // The order exists and is ours. Tie it to the session before anything else can fail, so the
    // orphan sweep can always find it.
    await d.store.stakeOrder(session.id, order.id);

    const charge = d.quote({ baseTotal: parseFloat(orderTotal), baseCurrency: orderCurrency, chargeCurrency: pi.currency });
    const authorised = pi.amount_capturable || pi.amount;
    // We can take less than was authorised, never more. A rise within tolerance is absorbed.
    const captureAmount = Math.min(authorised, charge.stripeAmount);

    const tickets: string[] = (order.documents ?? [])
        .filter((doc: any) => doc.type === 'electronic_ticket')
        .map((doc: any) => doc.unique_identifier as string);

    await d.store.recordOrder(session.id, {
        orderId: order.id,
        pnr: order.booking_reference ?? order.id,
        tickets,
        ticketed: tickets.length > 0,
        flight: withBookedItinerary(session.flight, order),
        originalPrice: parseFloat(orderTotal),
        chargedPrice: fromStripeAmount(captureAmount, pi.currency),
    });

    try {
        await d.stripe.paymentIntents.capture(
            pi.id,
            { amount_to_capture: captureAmount },
            { idempotencyKey: `flight-capture-${session.id}` },
        );
    } catch (err: any) {
        // Authorised, ticketed, and the money would not move. Giving the seat back is the only
        // way to leave nothing owed. Cancelling an instant order may not recover the fare (fare
        // rules decide), so this tells the team instead of assuming.
        const released = await d.cancelOrder(token, order.id, 'capture failed after the order was placed');
        d.notify(
            'Flight capture failed after ordering',
            `Session ${session.id} (PI ${pi.id}): the card was authorised and Duffel order ${order.id} was placed, ` +
            `but capture failed (${err?.message ?? 'unknown'}). Order cancellation ${released ? 'succeeded' : 'FAILED — cancel it by hand'}.`,
        );
        return refuse('booking_failed');
    }

    const booked = await d.createBooking({ sessionId: session.id, paymentIntentId: pi.id });
    if (!booked.success && !booked.alreadyBooked) {
        // Money moved and an order exists. Refusing here would refund a live ticket. Leave it
        // for auto-recover, which records it, and tell the team.
        d.notify(
            'Flight booked but not recorded',
            `Session ${session.id} (PI ${pi.id}) is captured and ordered (${order.id}) but the booking row ` +
            `could not be written (${booked.error ?? 'unknown'}). Auto-recover will retry; do not refund.`,
        );
        return { kind: 'in_progress' };
    }
    return fromBooking(booked);
}

function fromBooking(result: Awaited<ReturnType<typeof createBooking>>): FinaliseOutcome {
    if (result.success) {
        return {
            kind: 'booked', bookingId: result.bookingId, pnr: result.pnr, status: result.status,
            alreadyBooked: result.alreadyBooked === true,
        };
    }
    return result.alreadyBooked ? { kind: 'in_progress' } : { kind: 'refused', errorCode: 'booking_failed' };
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function fetchDuffelOrder(token: string, orderId: string): Promise<any | null> {
    try {
        const res = await fetch(`https://api.duffel.com/air/orders/${encodeURIComponent(orderId)}`, {
            headers: { Authorization: `Bearer ${token}`, 'Duffel-Version': 'v2' },
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const order = (await res.json())?.data;
        return order?.id && !order.cancelled_at ? order : null;
    } catch {
        return null;
    }
}

/** Submitted passengers, compared by name and date of birth, order-insensitive. */
function samePassengers(a: any[], b: any[]): boolean {
    const key = (p: any) => `${String(p?.firstName ?? '').trim().toLowerCase()}|${String(p?.lastName ?? '').trim().toLowerCase()}|${String(p?.birthDate ?? '').trim()}`;
    const left = (a ?? []).map(key).sort();
    const right = (b ?? []).map(key).sort();
    return left.length === right.length && left.every((k, i) => k === right[i]);
}

export function sqlSessionStore(sql: ReturnType<typeof getSqlAdmin>): SessionStore {
    return {
        async claim(sessionId, staleAfterMs) {
            const rows = await sql<any[]>`
                WITH prev AS (
                    SELECT id, status, updated_at FROM booking_sessions WHERE id = ${sessionId} FOR UPDATE
                )
                UPDATE booking_sessions s
                   SET status = 'ordering', updated_at = now()
                  FROM prev
                 WHERE s.id = prev.id
                   AND (prev.status IN ('initiated', 'payment_initiated', 'payment_authorized')
                        OR (prev.status = 'ordering'
                            AND prev.updated_at < now() - make_interval(secs => ${staleAfterMs / 1000})))
                RETURNING s.id, s.user_id AS "userId", s.flight, s.passengers, s.contact,
                          s.seat_service_ids AS "seatServiceIds", s.bag_service_ids AS "bagServiceIds",
                          s.confirmed_price AS "confirmedPrice", s.idempotency_key AS "idempotencyKey",
                          s.duffel_pre_order_id AS "duffelPreOrderId",
                          CASE WHEN prev.status = 'ordering' THEN prev.updated_at END AS "previousClaimAt"`;
            const row = rows[0];
            if (!row) return null;
            return {
                ...row,
                confirmedPrice: row.confirmedPrice == null ? null : Number(row.confirmedPrice),
                previousClaimAt: row.previousClaimAt ? new Date(row.previousClaimAt).toISOString() : null,
            };
        },

        async bookingFor(sessionId) {
            const rows = await sql<{ id: string; pnr: string | null; status: string }[]>`
                SELECT id, pnr, status FROM flight_bookings WHERE session_id = ${sessionId} LIMIT 1`;
            return rows[0] ?? null;
        },

        async stakeOrder(sessionId, orderId) {
            await sql`UPDATE booking_sessions SET duffel_pre_order_id = ${orderId} WHERE id = ${sessionId}`;
        },

        async recordOrder(sessionId, f) {
            await sql`
                UPDATE booking_sessions
                   SET duffel_pre_order_id = ${f.orderId},
                       duffel_pre_order_pnr = ${f.pnr},
                       duffel_pre_order_tickets = ${f.tickets}::text[],
                       duffel_pre_order_ticketed = ${f.ticketed},
                       flight = ${sql.json(f.flight as any)}::jsonb,
                       original_price = ${f.originalPrice},
                       charged_price = ${f.chargedPrice},
                       status = 'payment_authorized',
                       updated_at = now()
                 WHERE id = ${sessionId}`;
        },

        async release(sessionId) {
            await sql`
                UPDATE booking_sessions SET status = 'payment_authorized', updated_at = now()
                 WHERE id = ${sessionId} AND status = 'ordering'`;
        },

        async fail(sessionId, failure) {
            await sql`UPDATE booking_sessions SET failure = ${sql.json(failure as any)}::jsonb WHERE id = ${sessionId}`;
        },

        async otherLiveOrder({ userId, offerId, excludeSessionId, passengers, windowMs }) {
            const since = new Date(Date.now() - windowMs).toISOString();
            const rows = await sql<{ passengers: any[] }[]>`
                SELECT passengers FROM booking_sessions
                 WHERE user_id = ${userId} AND id <> ${excludeSessionId}
                   AND duffel_pre_order_id IS NOT NULL
                   AND status NOT IN ('failed', 'expired')
                   AND created_at >= ${since}
                   AND flight #>> '{_rawOffer,id}' = ${offerId}`;
            return rows.some(r => samePassengers(r.passengers, passengers));
        },
    };
}

/**
 * How each dependency is built when the caller does not supply it. Each is a factory, called only
 * for what was not overridden: the real ones reach for the database and Stripe, and a caller that
 * injects everything must not need either to exist.
 */
const defaultFactories: { [K in keyof FinaliseDeps]: () => FinaliseDeps[K] } = {
    stripe: () => defaultStripe as any,
    store: () => sqlSessionStore(getSqlAdmin()),
    duffelToken: () => env.DUFFEL_TOKEN,
    priceTolerance: () => getFlightPriceTolerance(),
    placeOrder: () => placeDuffelOrder,
    cancelOrder: () => cancelDuffelOrder,
    findOrderSince: () => findOrderFromTimedOutAttempt,
    servicePrices: () => withDuffelServicePrices,
    fetchOrder: () => fetchDuffelOrder,
    createBooking: () => createBooking,
    markFailed: () => (sessionId, paymentIntentId, reason) =>
        markFailed(getSqlAdmin(), createAdminClient(), sessionId, paymentIntentId, reason),
    notify: () => (title, body) => { void createNotification(title, body, 'booking'); },
    quote: () => quoteFlightCharge,
};

function resolveDeps(overrides: Partial<FinaliseDeps>): FinaliseDeps {
    const resolved: Record<string, unknown> = {};
    for (const key of Object.keys(defaultFactories) as (keyof FinaliseDeps)[]) {
        resolved[key] = overrides[key] !== undefined ? overrides[key] : defaultFactories[key]();
    }
    return resolved as unknown as FinaliseDeps;
}
