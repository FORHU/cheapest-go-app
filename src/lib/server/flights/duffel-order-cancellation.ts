/**
 * What Duffel says about an order, in the terms cancelling needs.
 *
 * An order cancelled outside this app (in Duffel's dashboard, by the airline, by Duffel) is not a
 * cancellable order and not a missing one: it is already done, and the only work left on our side
 * is to take the refund Duffel recorded and give the traveller their share back.
 *
 * Duffel documents a cancelled order as carrying its confirmed cancellation at `cancellation`
 * (refund amount, currency, where the refund went) and a `cancelled_at` timestamp. It does NOT
 * document `available_actions` for a cancelled order, and its own sample response lists `cancel`
 * on one, so that field is only consulted for an order that is not cancelled.
 */

export type DuffelOrderCancelState =
    | {
        kind: 'already_cancelled';
        /** What Duffel refunded, or null when it recorded no amount. Null is not zero. */
        refundAmount: number | null;
        refundCurrency: string | null;
        refundTo: string | null;
        confirmedAt: string | null;
    }
    | { kind: 'cancellable' }
    | { kind: 'not_cancellable' };

export function classifyOrderForCancellation(order: any): DuffelOrderCancelState {
    const cancellation = order?.cancellation ?? null;

    // Cancelled means a timestamp on the order, or a cancellation that was actually confirmed.
    // A quote that was created and never confirmed also hangs off the order, and refunding a
    // traveller for a ticket that is still live would be a loss with no way back.
    const cancelled = Boolean(order?.cancelled_at) || Boolean(cancellation?.confirmed_at);

    if (cancelled) {
        const raw = cancellation?.refund_amount;
        const amount = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
        return {
            kind: 'already_cancelled',
            refundAmount: Number.isFinite(amount) ? amount : null,
            refundCurrency: cancellation?.refund_currency ?? null,
            refundTo: cancellation?.refund_to ?? null,
            confirmedAt: cancellation?.confirmed_at ?? order?.cancelled_at ?? null,
        };
    }

    const actions: unknown = order?.available_actions;
    return Array.isArray(actions) && actions.includes('cancel') ? { kind: 'cancellable' } : { kind: 'not_cancellable' };
}
