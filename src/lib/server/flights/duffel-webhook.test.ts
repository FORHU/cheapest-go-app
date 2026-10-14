import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyDuffelSignature, parseDuffelEvent } from './duffel-webhook';

const SECRET = 'whsec_test_secret';
const BODY = JSON.stringify({ id: 'wev_1', type: 'order_cancellation.confirmed', data: { object: { id: 'ore_1' } } });

/** The header Duffel documents: `t=<unix>,v1=<hex>`, signed over `<t>.<raw body>`. */
function sign(body: string, secret = SECRET, t = '1760330000') {
    const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return `t=${t},v1=${v1}`;
}

describe('verifyDuffelSignature', () => {
    it('accepts a body signed the way Duffel documents', () => {
        expect(verifyDuffelSignature(BODY, sign(BODY), SECRET)).toBe(true);
    });

    it('rejects a body that was changed after signing', () => {
        expect(verifyDuffelSignature(BODY.replace('ore_1', 'ore_2'), sign(BODY), SECRET)).toBe(false);
    });

    it('rejects a signature made with another secret', () => {
        expect(verifyDuffelSignature(BODY, sign(BODY, 'someone_elses_secret'), SECRET)).toBe(false);
    });

    it('rejects a timestamp that was swapped, since it is part of what is signed', () => {
        const header = sign(BODY).replace('t=1760330000', 't=1760339999');
        expect(verifyDuffelSignature(BODY, header, SECRET)).toBe(false);
    });

    it('rejects the old scheme: a bare HMAC of the body with no timestamp', () => {
        const bare = createHmac('sha256', SECRET).update(BODY).digest('hex');
        expect(verifyDuffelSignature(BODY, bare, SECRET)).toBe(false);
    });

    it('rejects a missing, empty or malformed header, and an empty secret', () => {
        expect(verifyDuffelSignature(BODY, null, SECRET)).toBe(false);
        expect(verifyDuffelSignature(BODY, '', SECRET)).toBe(false);
        expect(verifyDuffelSignature(BODY, 't=1760330000', SECRET)).toBe(false);
        expect(verifyDuffelSignature(BODY, 't=1760330000,v1=not-hex', SECRET)).toBe(false);
        expect(verifyDuffelSignature(BODY, sign(BODY), '')).toBe(false);
    });

    it('accepts any of several v1 values, as when a secret is being rotated', () => {
        const good = sign(BODY);
        const withStale = `${good},v1=${'0'.repeat(64)}`;
        expect(verifyDuffelSignature(BODY, withStale, SECRET)).toBe(true);
    });
});

describe('parseDuffelEvent', () => {
    it('reads a confirmed cancellation from data.object, with the order it belongs to', () => {
        const event = parseDuffelEvent({
            id: 'wev_1', type: 'order_cancellation.confirmed', live_mode: false,
            data: { object: {
                id: 'ore_1', order_id: 'ord_0000BBMAeol123GZFKyago', refund_amount: '114.96',
                refund_currency: 'USD', refund_to: 'balance', confirmed_at: '2026-10-13T03:50:00Z',
            } },
        });

        expect(event).toEqual({
            id: 'wev_1',
            type: 'order_cancellation.confirmed',
            orderId: 'ord_0000BBMAeol123GZFKyago',
            cancellation: { refundAmount: 114.96, refundCurrency: 'USD', refundTo: 'balance', confirmedAt: '2026-10-13T03:50:00Z' },
        });
    });

    it('does not treat the cancellation\'s own id as the order id', () => {
        const event = parseDuffelEvent({ id: 'wev_1', type: 'order_cancellation.confirmed', data: { object: { id: 'ore_1' } } });
        expect(event?.orderId).toBeNull();
    });

    it('reads an order event, where the order itself is the object', () => {
        const event = parseDuffelEvent({
            id: 'wev_2', type: 'order.created', data: { object: { id: 'ord_1', booking_reference: 'ABC123' } },
        });
        expect(event).toMatchObject({ type: 'order.created', orderId: 'ord_1', cancellation: null });
    });

    it('keeps an unknown refund unknown rather than turning it into zero', () => {
        const event = parseDuffelEvent({
            id: 'wev_3', type: 'order_cancellation.confirmed',
            data: { object: { id: 'ore_1', order_id: 'ord_1', refund_amount: null, refund_currency: null, refund_to: 'awaiting_payment', confirmed_at: '2026-10-13T03:50:00Z' } },
        });
        expect(event?.cancellation).toMatchObject({ refundAmount: null, refundTo: 'awaiting_payment' });
    });

    it('tolerates a flat payload with the resource directly under data', () => {
        const event = parseDuffelEvent({
            id: 'wev_4', type: 'order_cancellation.confirmed', data: { id: 'ore_1', order_id: 'ord_9', refund_amount: '5.00' },
        });
        expect(event).toMatchObject({ orderId: 'ord_9', cancellation: { refundAmount: 5 } });
    });

    it('returns null for something that is not an event', () => {
        expect(parseDuffelEvent(null)).toBeNull();
        expect(parseDuffelEvent('x')).toBeNull();
        expect(parseDuffelEvent({ data: {} })).toBeNull();
        expect(parseDuffelEvent({ type: 42 })).toBeNull();
    });
});
