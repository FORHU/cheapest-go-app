import { describe, expect, it } from 'vitest';
import { receiptCancellation, receiptDiscount, fareBreakdown } from './receipt-details';

/**
 * A receipt is read by people who were never on the booking and is filed by finance
 * teams, so the rule these cover is that it never states a term it does not hold.
 * Absent terms stay absent, and a tiered schedule is never flattened into a single
 * free-cancellation date — the mistake ADR-0023 exists to prevent.
 */

describe('receiptCancellation — hotels', () => {
    it('reads free cancellation with its deadline when exactly one is recorded', () => {
        const result = receiptCancellation(
            {
                policy_type: 'free_cancellation',
                cancellation_policy: { cancelPolicyInfos: [{ cancelTime: '2026-10-01T12:00:00Z', amount: 0 }] },
            },
            true,
        );

        expect(result).toEqual({ kind: 'free', until: '2026-10-01T12:00:00Z' });
    });

    it('gives no deadline when the schedule has several, rather than picking one', () => {
        const result = receiptCancellation(
            {
                policy_type: 'free_cancellation',
                cancellation_policy: {
                    cancelPolicyInfos: [
                        { cancelTime: '2026-10-01T12:00:00Z', amount: 0 },
                        { cancelTime: '2026-10-05T12:00:00Z', amount: 50 },
                    ],
                },
            },
            true,
        );

        expect(result).toEqual({ kind: 'free', until: null });
    });

    it('gives no deadline when the recorded time is unusable', () => {
        const result = receiptCancellation(
            { policy_type: 'free_cancellation', cancellation_policy: { cancelPolicyInfos: [{ cancelTime: 'soon' }] } },
            true,
        );

        expect(result).toEqual({ kind: 'free', until: null });
    });

    it('keeps a tiered policy tiered', () => {
        // Collapsing tiers into free_cancellation is what ADR-0023 was written about.
        expect(receiptCancellation({ policy_type: 'tiered' }, true)).toEqual({ kind: 'tiered' });
    });

    it('says nothing when the booking records no policy', () => {
        expect(receiptCancellation({}, true)).toBeNull();
    });
});

describe('receiptCancellation — flights', () => {
    it('reports a refundable fare', () => {
        expect(receiptCancellation({ fare_policy: { isRefundable: true } }, false)).toEqual({ kind: 'refundable' });
    });

    it('reports a non-refundable fare', () => {
        expect(receiptCancellation({ fare_policy: { isRefundable: false } }, false)).toEqual({ kind: 'non_refundable' });
    });

    it('stays silent when the airline rules were never recorded', () => {
        // Absent is not the same as non-refundable.
        expect(receiptCancellation({ fare_policy: {} }, false)).toBeNull();
        expect(receiptCancellation({}, false)).toBeNull();
    });
});

describe('fareBreakdown', () => {
    it('splits the charge so the rows account for all of it', () => {
        // 700 fare + 84 of tax and fee = the 784 actually charged. Derived from the
        // total rather than read from the supplier's tax, so a platform fee sitting
        // between them cannot make the rows stop adding up.
        expect(fareBreakdown(784, 700, 'USD', 'USD')).toEqual({ fare: 700, taxesAndFees: 84 });
    });

    it('says nothing when the booking recorded no fare', () => {
        // Every booking taken before Duffel's base_amount was parsed.
        expect(fareBreakdown(784, null, 'USD', 'USD')).toBeNull();
        expect(fareBreakdown(784, 0, 'USD', 'USD')).toBeNull();
    });

    it('refuses a fare that is not inside the total', () => {
        // Equal leaves nothing to itemise; above means the two figures disagree and
        // neither can be trusted onto a receipt.
        expect(fareBreakdown(784, 784, 'USD', 'USD')).toBeNull();
        expect(fareBreakdown(784, 900, 'USD', 'USD')).toBeNull();
        expect(fareBreakdown(784, -10, 'USD', 'USD')).toBeNull();
    });

    it('refuses a fare quoted in another currency', () => {
        // The mistake that read a 600,000 PHP credit line as $600,000 elsewhere in
        // this codebase. On a receipt it would render as a wild markup.
        expect(fareBreakdown(784, 700, 'PHP', 'USD')).toBeNull();
        expect(fareBreakdown(784, 700, null, 'USD')).toBeNull();
    });

    it('ignores case when comparing currencies', () => {
        expect(fareBreakdown(784, 700, 'usd', 'USD')).toEqual({ fare: 700, taxesAndFees: 84 });
    });
});

describe('receiptDiscount', () => {
    it('reports a voucher and its code', () => {
        expect(receiptDiscount({ discount_amount: 500, voucher_code: 'WELCOME' })).toEqual({
            amount: 500,
            code: 'WELCOME',
        });
    });

    it('reports a discount with no code', () => {
        expect(receiptDiscount({ discount_amount: 500 })).toEqual({ amount: 500, code: null });
    });

    it('says nothing when no discount was applied', () => {
        expect(receiptDiscount({ discount_amount: 0 })).toBeNull();
        expect(receiptDiscount({})).toBeNull();
    });

    it('ignores a non-numeric amount rather than printing NaN on a receipt', () => {
        expect(receiptDiscount({ discount_amount: 'free' })).toBeNull();
    });
});
