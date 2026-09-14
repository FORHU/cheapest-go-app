import { describe, it, expect } from 'vitest';
import { shouldRecoverPaymentStep, PAYMENT_RECOVERY_WINDOW_MS } from './useFlightBooking';

/**
 * QA BG-19 (flights): go to payment, go back, pick a flight and proceed again — the booking
 * page resumed the abandoned payment instead, threw away the new choice and bounced the
 * customer to search, over and over.
 */

const now = Date.parse('2026-09-14T10:00:00Z');
const base = { sessionId: 'sess-1', paymentIntentId: 'pi_1', startedAt: now - 60_000, now, hasSelectedFlight: false };

describe('shouldRecoverPaymentStep', () => {
    it('resumes a reload during payment', () => {
        expect(shouldRecoverPaymentStep(base)).toBe(true);
    });

    it('does not resume when the customer came back and chose a flight to book again', () => {
        expect(shouldRecoverPaymentStep({ ...base, hasSelectedFlight: true })).toBe(false);
    });

    it('does not resume a payment started too long ago', () => {
        expect(shouldRecoverPaymentStep({ ...base, startedAt: now - PAYMENT_RECOVERY_WINDOW_MS - 1 })).toBe(false);
    });

    it('does not resume without both ids', () => {
        expect(shouldRecoverPaymentStep({ ...base, sessionId: null })).toBe(false);
        expect(shouldRecoverPaymentStep({ ...base, paymentIntentId: '' })).toBe(false);
    });
});
