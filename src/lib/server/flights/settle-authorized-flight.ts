import { applyMarkup, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { computeOrderTotal } from './flight-quote';
import { decideCapture } from './capture-decision';
import { buildDuffelOrderPassengers } from './duffel-order-passengers';
import { mapDuffelOrderError } from './duffel-order-error';
import type { placeDuffelOrder } from './place-duffel-order';
import type { withDuffelServicePrices } from './duffel-service-prices';

/**
 * The card is authorised and no airline order exists yet. Buy it, record it, then take the money.
 *
 * Order matters and is the point of the design:
 *   1. place the order            — if this fails nothing has moved; the caller releases the hold
 *   2. record it on the session   — before anything else can fail (so it is findable by the sweep)
 *   3. capture                    — only now does the traveller pay; if THIS fails, undo the order
 *
 * Runs under createBooking's session lock, so the webhook and /confirm cannot both reach it.
 */

export interface PlacedOrder {
    orderId: string;
    pnr: string;
    tickets: string[];
    isTicketed: boolean;
    orderTotal: string;
    orderCurrency: string;
    rawOrder: any;
}

export type SettleResult =
    | { kind: 'settled'; order: PlacedOrder; /** null when the payment was already captured. */ capturedMinor: number | null }
    | { kind: 'failed'; code: string; message: string };

export interface SettlePaymentIntent {
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
}

export interface SettleDeps {
    retrievePaymentIntent(id: string): Promise<SettlePaymentIntent>;
    capturePaymentIntent(id: string, amountToCaptureMinor: number): Promise<void>;
    withServicePrices: typeof withDuffelServicePrices;
    placeOrder: typeof placeDuffelOrder;
    cancelOrder(orderId: string, reason: string): Promise<boolean>;
    saveOrder(sessionId: string, order: PlacedOrder, flight: any): Promise<void>;
}

export interface SettleSession {
    id: string;
    passengers: any[];
    contact: any;
    flight: any;
    seat_service_ids?: string[] | null;
    bag_service_ids?: string[] | null;
}

export interface SettleInput {
    session: SettleSession;
    paymentIntentId: string;
    duffelToken: string;
    /** Absolute rise (supplier currency) treated as unchanged — getFlightPriceTolerance(). */
    priceTolerance: number;
}

const fail = (code: string, message: string): SettleResult => ({ kind: 'failed', code, message });

export async function settleAuthorizedFlight(input: SettleInput, deps: SettleDeps): Promise<SettleResult> {
    const { session, paymentIntentId, duffelToken, priceTolerance } = input;

    const pi = await deps.retrievePaymentIntent(paymentIntentId);
    // Only a PaymentIntent this flow created may trigger an order. Anything else is a legacy
    // session whose missing order is a fault to report, not something to quietly buy.
    if (pi.metadata?.payFirst !== 'true') return fail('not_pay_first', 'Payment is not a pay-first payment.');
    if (pi.status !== 'requires_capture' && pi.status !== 'succeeded') {
        return fail('booking_failed', `Payment is not authorised (status: ${pi.status}).`);
    }
    // decideCapture trusts its inputs, so check the hold BEFORE buying anything: a hold that is
    // not a positive whole number of minor units cannot be captured and must not cost an order.
    if (pi.status === 'requires_capture' && !(Number.isSafeInteger(pi.amount) && pi.amount > 0)) {
        return fail('booking_failed', 'The authorised amount is not valid.');
    }

    const rawOffer = session.flight?._rawOffer;
    if (!rawOffer?.id) return fail('booking_failed', 'The stored flight offer is missing.');

    const seatIds = session.seat_service_ids ?? [];
    const bagIds = session.bag_service_ids ?? [];

    // The stored offer has no service prices. Ask Duffel again, now, so the order total matches
    // what Duffel will validate the payment against.
    let priced: any;
    try {
        priced = await deps.withServicePrices(rawOffer, seatIds, bagIds, duffelToken);
    } catch {
        return fail('seats_unavailable', 'The seats or bags you selected are no longer available.');
    }

    const { total } = computeOrderTotal(priced, seatIds, bagIds, true);
    const built = buildDuffelOrderPassengers(priced, session.passengers, session.contact);
    if (!built.ok) return fail(built.code, built.message);

    const placed = await deps.placeOrder({
        duffelToken,
        rawOffer: priced,
        passengers: built.passengers,
        total,
        currency: priced.total_currency,
        seatServiceIds: seatIds,
        bagServiceIds: bagIds,
        priceTolerance,
        // Stable per session: a second path reaching here with the same key is the same order.
        idempotencyKey: `flight-order-${session.id}`,
    });

    if (placed.kind === 'price_changed') return fail('price_changed', 'The fare changed while we were confirming your booking.');
    if (placed.kind === 'offer_replaced') return fail('offer_replaced_seats_cleared', 'The fare was refreshed, so your seat and bag selections were cleared.');
    if (placed.kind === 'error') {
        const mapped = mapDuffelOrderError(placed.status, placed.data);
        return fail(mapped.code, mapped.message);
    }

    // ── From here an airline order exists and must be undone on any failure ──
    const raw = placed.order;
    const tickets: string[] = (raw.documents ?? [])
        .filter((d: any) => d.type === 'electronic_ticket')
        .map((d: any) => d.unique_identifier as string);
    const order: PlacedOrder = {
        orderId: raw.id,
        // `||`, not `??`: a booking_reference of '' must still fall back to the order id.
        pnr: raw.booking_reference || raw.id,
        tickets,
        isTicketed: tickets.length > 0,
        orderTotal: placed.finalTotal,
        orderCurrency: placed.finalCurrency,
        rawOrder: raw,
    };

    // The quote was in one currency; an order in another would be captured against the wrong unit.
    const quotedCurrency = (pi.metadata.baseCurrency ?? '').toLowerCase();
    if (quotedCurrency && order.orderCurrency.toLowerCase() !== quotedCurrency) {
        console.error(`[settle] CURRENCY DRIFT: quoted in ${quotedCurrency}, order settled in ${order.orderCurrency}.`);
        await deps.cancelOrder(order.orderId, 'order currency differs from the quote');
        return fail('booking_failed', 'The airline settled in a different currency than quoted.');
    }

    try {
        await deps.saveOrder(session.id, order, session.flight);
    } catch (err: any) {
        console.error(`[settle] could not record order ${order.orderId}:`, err?.message ?? err);
        await deps.cancelOrder(order.orderId, 'could not record the order against its session');
        return fail('booking_failed', 'We could not record your booking.');
    }

    if (pi.status === 'succeeded') return { kind: 'settled', order, capturedMinor: null };

    // ── Take the money ───────────────────────────────────────────────────────
    const flat = Number(pi.metadata.flatInBase);
    const decision = decideCapture({
        authorizedMinor: pi.amount,
        quotedBase: Number(pi.metadata.quotedTotal),
        finalBase: Number(order.orderTotal),
        tolerance: priceTolerance,
        chargedFor: base => applyMarkup(base, FLIGHT_MARKUP_SPEC, Number.isFinite(flat) ? flat : 0).chargedPrice,
    });

    if (decision.kind === 'release') {
        await deps.cancelOrder(order.orderId, 'fare rose beyond tolerance after the card was authorised');
        return fail(decision.code, 'The fare changed while we were confirming your booking.');
    }

    try {
        await deps.capturePaymentIntent(pi.id, decision.amountMinor);
    } catch (err: any) {
        console.error(`[settle] capture of ${pi.id} failed after order ${order.orderId} was placed:`, err?.message ?? err);
        await deps.cancelOrder(order.orderId, 'payment capture failed');
        return fail('booking_failed', 'We could not take the payment for your booking.');
    }

    return { kind: 'settled', order, capturedMinor: decision.amountMinor };
}
