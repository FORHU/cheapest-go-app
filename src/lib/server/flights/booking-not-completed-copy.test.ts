import { describe, it, expect } from 'vitest';
import { notCompletedReasonCopy, segmentsForNotCompletedEmail } from './booking-not-completed-copy';

describe('notCompletedReasonCopy', () => {
    it.each([
        ['price_changed', /fare changed/i],
        ['flight_unavailable', /no longer available/i],
        ['seats_unavailable', /seats or bags/i],
        ['phone_number_invalid', /phone number/i],
        ['something_else', /could not confirm/i],
        [null, /could not confirm/i],
    ])('%s', (reason, pattern) => {
        expect(notCompletedReasonCopy(reason)).toMatch(pattern);
    });
});

describe('segmentsForNotCompletedEmail', () => {
    it('maps the session flight segments onto the email segment shape', () => {
        const out = segmentsForNotCompletedEmail({
            segments: [{
                airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR300', origin: 'MNL', destination: 'HKG',
                departureTime: '2026-11-01T06:00:00', arrivalTime: '2026-11-01T08:30:00', cabinClass: 'economy', segmentIndex: 1,
            }],
        });
        expect(out).toEqual([{
            airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR300', origin: 'MNL', destination: 'HKG',
            departureTime: '2026-11-01T06:00:00', arrivalTime: '2026-11-01T08:30:00', cabinClass: 'economy', itineraryIndex: 1,
        }]);
    });

    it('returns an empty list for a flight with no segments', () => {
        expect(segmentsForNotCompletedEmail({})).toEqual([]);
        expect(segmentsForNotCompletedEmail(null)).toEqual([]);
    });
});
