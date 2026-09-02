import { describe, expect, it } from 'vitest';
import { statusIntent, statusBadgeClass } from './bookingStatus';

/**
 * The badge used to colour by substring — `includes('confirm')`, then `includes('pend')`,
 * then `includes('refund')`, else red — which got 8 of the 18 schema statuses wrong.
 * These pin the two that actually misled someone reading the table.
 */
describe('booking status colour', () => {
    it('separates a failed refund from a completed one', () => {
        // The whole point. Both contain "refund"; only one means the customer has
        // their money. Under the old chain these were the same violet.
        expect(statusIntent('cancelled_refunded')).toBe('refunded');
        expect(statusIntent('cancelled_refund_failed')).toBe('failure');
        expect(statusIntent('refund_failed')).toBe('failure');
    });

    it('does not paint a successful booking as an error', () => {
        // `booked` matched nothing in the old chain and fell through to red.
        expect(statusIntent('booked')).toBe('success');
        expect(statusIntent('confirmed')).toBe('success');
        expect(statusIntent('ticketed')).toBe('success');
    });

    it('treats work in flight as in progress, not broken', () => {
        for (const s of ['pending', 'awaiting_ticket', 'ticketing', 'pnr_created', 'cancel_requested', 'refund_pending']) {
            expect(statusIntent(s), s).toBe('progress');
        }
    });

    it('treats a clean ending as closed rather than failed', () => {
        expect(statusIntent('cancelled')).toBe('closed');
        expect(statusIntent('expired')).toBe('closed');
    });

    it('flags every real failure', () => {
        for (const s of ['failed', 'cancel_failed', 'refund_failed', 'cancelled_refund_failed', 'cancelled_provider_missing']) {
            expect(statusIntent(s), s).toBe('failure');
        }
    });

    it('catches an unmapped failure rather than letting it look benign', () => {
        // A status added to the schema before this map. Anything naming a failure must
        // still read as one; anything else stays neutral instead of shouting.
        expect(statusIntent('payout_failed')).toBe('failure');
        expect(statusIntent('some_new_state')).toBe('closed');
        expect(statusIntent('')).toBe('closed');
    });

    it('sizes the pill to fit the longest label', () => {
        // "Cancelled Refund Failed" overflowed the old fixed w-32 and rendered outside
        // its own background.
        const cls = statusBadgeClass('cancelled_refund_failed');
        expect(cls).toContain('min-w-');
        expect(cls).not.toContain('w-32');
        expect(cls).toContain('rose');
    });
});
