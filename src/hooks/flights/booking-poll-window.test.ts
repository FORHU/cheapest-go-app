import { describe, it, expect } from 'vitest';
import { BOOKING_POLL_TIMEOUT_MS } from './useFlightBooking';
import { DEFAULT_ORDER_TIMEOUT_MS } from '@/lib/server/flights/place-duffel-order';

describe('post-payment polling', () => {
    // Pay-first places the airline order AFTER the traveller has paid. If the screen gives up
    // before that call can finish, a booking that is about to succeed is shown as failed.
    it('outlasts the longest the airline order call can take, with room for capture', () => {
        expect(BOOKING_POLL_TIMEOUT_MS).toBeGreaterThan(DEFAULT_ORDER_TIMEOUT_MS + 10_000);
    });
});
