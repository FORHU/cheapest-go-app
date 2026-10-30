import { describe, it, expect } from 'vitest';
import { buildFlightBookingNotCompletedEmailHtml } from '@/lib/server/email';

const params = {
    bookingId: 'b-1',
    email: 'ana@example.com',
    passengerName: 'Ana Cruz',
    reason: 'price_changed',
    segments: [{
        airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR300', origin: 'MNL', destination: 'HKG',
        departureTime: '2026-11-01T06:00:00', arrivalTime: '2026-11-01T08:30:00', itineraryIndex: 0, cabinClass: 'economy',
    }],
};

describe('buildFlightBookingNotCompletedEmailHtml', () => {
    it('says the card was not charged and gives the reason', () => {
        const html = buildFlightBookingNotCompletedEmailHtml(params);
        expect(html).toMatch(/not charged/i);
        expect(html).toMatch(/fare changed/i);
        expect(html).toContain('Ana');
    });

    it('does not tell the traveller about a refund, because none is involved', () => {
        expect(buildFlightBookingNotCompletedEmailHtml(params)).not.toMatch(/refund of|has been refunded/i);
    });

    it('escapes the passenger name', () => {
        const html = buildFlightBookingNotCompletedEmailHtml({ ...params, passengerName: '<script>x</script> Cruz' });
        expect(html).not.toContain('<script>x</script>');
    });
});
