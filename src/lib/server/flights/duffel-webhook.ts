import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Duffel's webhooks, as Duffel documents them (duffel.com/docs/guides/receiving-webhooks).
 *
 * - The signature is the `X-Duffel-Signature` header, `t=<unix>,v1=<hex>`, where `v1` is the
 *   HMAC-SHA256 of `<t>.<raw body>` keyed with the webhook's secret. The timestamp is part of what
 *   is signed, so it cannot be swapped.
 * - The event is `{ id, type, ..., data: { object: <the resource> } }`. Delivery is at least once and
 *   retried for 72 hours, so the same event can arrive more than once.
 * - Cancellations arrive as `order_cancellation.created` and `order_cancellation.confirmed`.
 */

export function verifyDuffelSignature(rawBody: string, header: string | null | undefined, secret: string): boolean {
    if (!header || !secret) return false;

    let timestamp = '';
    const signatures: string[] = [];
    for (const part of header.split(',')) {
        const [key, ...rest] = part.trim().split('=');
        const value = rest.join('=');
        if (key === 't') timestamp = value;
        else if (key === 'v1') signatures.push(value);
    }
    if (!timestamp || signatures.length === 0) return false;

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
    // More than one v1 may be present while a secret is being rotated; any match will do.
    return signatures.some(signature => {
        const given = Buffer.from(signature, 'hex');
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export interface DuffelEvent {
    /** `wev_…`, for logging and de-duplication. */
    id: string | null;
    type: string;
    /** The order this concerns, when the payload says which. Never a cancellation's own id. */
    orderId: string | null;
    /** Present for order_cancellation events. `refundAmount` null means Duffel recorded none. */
    cancellation: {
        refundAmount: number | null;
        refundCurrency: string | null;
        refundTo: string | null;
        confirmedAt: string | null;
    } | null;
}

export function parseDuffelEvent(payload: any): DuffelEvent | null {
    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') return null;

    // Documented as data.object. A flat payload (the resource directly under data) is tolerated.
    const resource = payload.data?.object ?? payload.data ?? {};
    const isCancellation = payload.type.startsWith('order_cancellation.');

    const idLooksLikeOrder = typeof resource.id === 'string' && resource.id.startsWith('ord_');
    const orderId: string | null =
        typeof resource.order_id === 'string' ? resource.order_id : (idLooksLikeOrder ? resource.id : null);

    let cancellation: DuffelEvent['cancellation'] = null;
    if (isCancellation) {
        const raw = resource.refund_amount;
        const amount = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
        cancellation = {
            refundAmount: Number.isFinite(amount) ? amount : null,
            refundCurrency: resource.refund_currency ?? null,
            refundTo: resource.refund_to ?? null,
            confirmedAt: resource.confirmed_at ?? null,
        };
    }

    return { id: typeof payload.id === 'string' ? payload.id : null, type: payload.type, orderId, cancellation };
}
