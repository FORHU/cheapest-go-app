import { describe, it, expect } from 'vitest';
import { shouldRegenerateIdempotencyKey, DEFINITIVE_FAILURE_CODES } from './useFlightBooking';

/**
 * A fresh idempotency key tells Duffel "this is a different booking". Getting
 * that wrong in the permissive direction buys a second live ticket, so these
 * cases are asserted individually rather than as a snapshot of the set.
 */
describe('shouldRegenerateIdempotencyKey', () => {
    describe('keeps the key when an order may exist', () => {
        it.each([
            // The exact code parseJsonResponse throws for a platform HTML 504.
            'booking_timeout',
            'server_error',
            'supplier_outage',
            'booking_failed',
            // Raw network failures arrive as the fetch error's own message.
            'Failed to fetch',
            'NetworkError when attempting to fetch resource.',
            'TypeError: Load failed',
            // Anything unrecognised is ambiguous until proven otherwise.
            'some_code_added_next_year',
            '',
        ])('%s', code => {
            expect(shouldRegenerateIdempotencyKey(code)).toBe(false);
        });
    });

    describe('re-keys only when the attempt provably created nothing', () => {
        it.each([
            'price_changed',
            'offer_replaced',
            'flight_unavailable',
            'offer_expired',
            'seats_unavailable',
            'duplicate_booking',
            'phone_number_invalid',
            'passenger_type_mismatch',
            'balance_insufficient',
            'unauthenticated',
            'FX_UNAVAILABLE',
        ])('%s', code => {
            expect(shouldRegenerateIdempotencyKey(code)).toBe(true);
        });
    });

    it('does not list the dead `timeout` code that never reaches it', () => {
        // The server maps supplier timeouts to `supplier_outage`; `timeout` was in
        // the old allow-list and matched nothing, which is how `booking_timeout`
        // went unnoticed.
        expect(DEFINITIVE_FAILURE_CODES.has('timeout')).toBe(false);
        expect(shouldRegenerateIdempotencyKey('timeout')).toBe(false);
    });
});
