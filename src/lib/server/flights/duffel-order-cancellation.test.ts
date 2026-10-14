import { describe, it, expect } from 'vitest';
import { classifyOrderForCancellation } from './duffel-order-cancellation';

describe('classifyOrderForCancellation', () => {
    it('reads a cancelled order from its confirmed cancellation, with the refund Duffel recorded', () => {
        expect(classifyOrderForCancellation({
            cancelled_at: '2026-10-13T03:50:00Z',
            cancellation: {
                refund_amount: '110.00', refund_currency: 'USD', refund_to: 'balance',
                confirmed_at: '2026-10-13T03:50:00Z', expires_at: null,
            },
            available_actions: [],
        })).toEqual({
            kind: 'already_cancelled', refundAmount: 110, refundCurrency: 'USD', refundTo: 'balance',
            confirmedAt: '2026-10-13T03:50:00Z',
        });
    });

    it('still calls it cancelled when Duffel keeps listing "cancel" among the available actions', () => {
        // Duffel's own sample response shows exactly this combination.
        const state = classifyOrderForCancellation({
            cancelled_at: '2026-10-13T03:50:00Z',
            cancellation: { refund_amount: '110.00', refund_currency: 'USD', confirmed_at: '2026-10-13T03:50:00Z' },
            available_actions: ['cancel', 'change'],
        });
        expect(state.kind).toBe('already_cancelled');
    });

    it('reports an unknown refund as unknown, not as zero', () => {
        const state = classifyOrderForCancellation({
            cancelled_at: '2026-10-13T03:50:00Z',
            cancellation: { refund_amount: null, refund_currency: null, refund_to: 'awaiting_payment', confirmed_at: '2026-10-13T03:50:00Z' },
        });
        expect(state).toMatchObject({ kind: 'already_cancelled', refundAmount: null, refundTo: 'awaiting_payment' });
    });

    it('keeps an explicit zero refund as zero: that is a non-refundable fare, not an unknown', () => {
        const state = classifyOrderForCancellation({
            cancelled_at: '2026-10-13T03:50:00Z',
            cancellation: { refund_amount: '0.00', refund_currency: 'USD', confirmed_at: '2026-10-13T03:50:00Z' },
        });
        expect(state).toMatchObject({ kind: 'already_cancelled', refundAmount: 0 });
    });

    it('treats an order cancelled with no cancellation record (airline or Duffel did it) as cancelled, refund unknown', () => {
        expect(classifyOrderForCancellation({ cancelled_at: '2026-10-13T03:50:00Z', cancellation: null }))
            .toMatchObject({ kind: 'already_cancelled', refundAmount: null });
    });

    it('does not mistake a quote that was never confirmed for a cancellation', () => {
        // Refunding a customer for an order that is still live would be a loss with no way back.
        const state = classifyOrderForCancellation({
            cancelled_at: null,
            cancellation: { refund_amount: '110.00', refund_currency: 'USD', confirmed_at: null, expires_at: '2026-10-13T05:00:00Z' },
            available_actions: ['cancel'],
        });
        expect(state).toEqual({ kind: 'cancellable' });
    });

    it('is cancellable when Duffel offers the cancel action on a live order', () => {
        expect(classifyOrderForCancellation({ cancelled_at: null, cancellation: null, available_actions: ['cancel', 'change'] }))
            .toEqual({ kind: 'cancellable' });
    });

    it('is not cancellable via the API when the action is absent on a live order', () => {
        expect(classifyOrderForCancellation({ cancelled_at: null, cancellation: null, available_actions: ['change'] }))
            .toEqual({ kind: 'not_cancellable' });
        expect(classifyOrderForCancellation({ available_actions: [] })).toEqual({ kind: 'not_cancellable' });
        expect(classifyOrderForCancellation(undefined)).toEqual({ kind: 'not_cancellable' });
    });
});
