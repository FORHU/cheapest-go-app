import { describe, it, expect } from 'vitest';
import { mapDuffelOrderError } from './duffel-order-error';

const err = (code: string, message = '') => ({ errors: [{ code, message }] });

describe('mapDuffelOrderError', () => {
    it.each([
        [422, err('offer_no_longer_available'), 'flight_unavailable'],
        [422, err('x', 'This offer has expired'), 'flight_unavailable'],
        [422, err('insufficient_balance'), 'balance_insufficient'],
        [422, err('x', 'Insufficient balance on account'), 'balance_insufficient'],
        [422, err('x', 'phone_number is invalid'), 'phone_number_invalid'],
        [422, err('x', 'The seat you selected is not available'), 'seats_unavailable'],
        [504, { errors: [{ code: 'timeout', message: 'Airline booking system timed out.' }] }, 'supplier_outage'],
        [500, {}, 'supplier_outage'],
        [400, err('x', 'something unrecognised'), 'booking_failed'],
        [400, {}, 'booking_failed'],
    ])('status %s %j -> %s', (status, data, code) => {
        expect(mapDuffelOrderError(status as number, data).code).toBe(code);
    });

    it('prefers a balance problem over an "expired" reading of the same 422', () => {
        expect(mapDuffelOrderError(422, err('insufficient_balance', 'offer expired')).code).toBe('balance_insufficient');
    });

    it('carries Duffel wording for an unrecognised failure, and a fallback when there is none', () => {
        expect(mapDuffelOrderError(400, err('x', 'Passport number invalid')).message).toBe('Passport number invalid');
        expect(mapDuffelOrderError(400, {}).message).toBe('Flight booking failed. Please try again.');
    });
});
