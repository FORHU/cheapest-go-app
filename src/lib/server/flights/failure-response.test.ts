import { describe, it, expect } from 'vitest';
import { failedBookingBody, finaliseOutcomeResponse } from './failure-response';

describe('failedBookingBody', () => {
    it('keeps the legacy answer for a session with no recorded failure', () => {
        expect(failedBookingBody(null)).toMatchObject({ errorCode: 'booking_failed_refunded' });
        expect(failedBookingBody(undefined)).toMatchObject({ errorCode: 'booking_failed_refunded' });
        expect(failedBookingBody({} as any)).toMatchObject({ errorCode: 'booking_failed_refunded' });
    });

    it('answers the stored code, which says the card was not charged', () => {
        expect(failedBookingBody({ errorCode: 'flight_unavailable' })).toEqual({ errorCode: 'flight_unavailable' });
    });

    it('carries the new price when the fare moved', () => {
        const priceChange = { oldPrice: 100, newPrice: 110, currency: 'USD' };
        expect(failedBookingBody({ errorCode: 'price_changed', priceChange })).toEqual({ errorCode: 'price_changed', priceChange });
    });
});

describe('finaliseOutcomeResponse', () => {
    it('lets a booked outcome through: the caller carries on to ticketing', () => {
        expect(finaliseOutcomeResponse({ kind: 'booked', alreadyBooked: false })).toBeNull();
    });

    it('answers a refusal with its code and the new price', () => {
        const priceChange = { oldPrice: 100, newPrice: 110, currency: 'USD' };
        expect(finaliseOutcomeResponse({ kind: 'refused', errorCode: 'price_changed', priceChange })).toEqual({
            status: 409, body: { success: false, errorCode: 'price_changed', priceChange },
        });
        expect(finaliseOutcomeResponse({ kind: 'refused', errorCode: 'flight_unavailable' })).toEqual({
            status: 409, body: { success: false, errorCode: 'flight_unavailable' },
        });
    });

    it('answers in_progress as pending, so the client keeps waiting and keeps its recovery keys', () => {
        expect(finaliseOutcomeResponse({ kind: 'in_progress' })).toMatchObject({
            status: 202, body: { success: false, errorCode: 'booking_pending' },
        });
    });

    it('answers a card that is not authorised as a payment problem', () => {
        expect(finaliseOutcomeResponse({ kind: 'not_authorised', reason: 'requires_payment_method' })).toMatchObject({
            status: 402, body: { success: false },
        });
    });
});
