import { describe, expect, it } from 'vitest';
import {
    arrivalDayOffset, countPassengers, formatAirportDay, formatAirportTime, formatDateRange, formatMoney,
    receiptLegs, receiptStatus, travellerName, tripKind, type ReceiptSegment,
} from './receipt';

const seg = (over: Partial<ReceiptSegment>): ReceiptSegment => ({
    airline: 'ZZ', flight_number: '3678', origin: 'CRK', destination: 'DOH',
    departure: '2026-09-23T17:01:00+00:00', arrival: '2026-09-23T21:00:00+00:00', ...over,
});

describe('receipt formatting', () => {
    it('reads the stored wall clock back in UTC', () => {
        expect(formatAirportTime('2026-09-23T17:01:00+00:00')).toBe('05:01 PM');
        expect(formatAirportDay(new Date('2026-09-23T23:30:00Z'))).toBe('Wed, Sep 23');
    });

    it('shortens a date range within one year and keeps both years across one', () => {
        expect(formatDateRange('2026-09-23T17:01:00Z', '2026-09-26T19:21:00Z')).toBe('Sep 23 – Sep 26, 2026');
        expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
        expect(formatDateRange('2026-09-23T08:00:00Z', '2026-09-23T20:00:00Z')).toBe('Sep 23, 2026');
    });

    it('counts calendar days to an arrival, never negative', () => {
        expect(arrivalDayOffset('2026-09-23T17:01:00Z', '2026-09-24T00:50:00Z')).toBe(1);
        expect(arrivalDayOffset('2026-09-23T17:01:00Z', '2026-09-23T23:59:00Z')).toBe(0);
        expect(arrivalDayOffset('2026-09-24T01:00:00Z', '2026-09-23T23:00:00Z')).toBe(0);
    });

    it('keeps the minor unit a receipt was charged in', () => {
        expect(formatMoney(783.6, 'usd')).toBe('$783.60');
        expect(formatMoney(784000, 'KRW')).toBe('₩784,000');
    });

    it('writes the surname first, dropping a missing half', () => {
        expect(travellerName('Busilan', 'Billy Dhen Clir')).toBe('Busilan / Billy Dhen Clir');
        expect(travellerName('Busilan', '')).toBe('Busilan');
    });
});

describe('receiptLegs', () => {
    const outbound = [
        seg({ segment_index: 0 }),
        seg({ segment_index: 0, flight_number: '100', origin: 'DOH', destination: 'LHR', departure: '2026-09-23T23:10:00Z', arrival: '2026-09-24T00:50:00Z' }),
    ];
    const inbound = [
        seg({ segment_index: 1, flight_number: '3679', origin: 'LHR', destination: 'CRK', departure: '2026-09-26T19:21:00Z', arrival: '2026-09-27T17:10:00Z' }),
    ];

    it('groups by segment_index and reports stops per leg', () => {
        const legs = receiptLegs([...inbound, ...outbound]);
        expect(legs).toHaveLength(2);
        expect(legs[0].first.origin).toBe('CRK');
        expect(legs[0].last.destination).toBe('LHR');
        expect(legs[0].stops).toBe(1);
        expect(legs[1].stops).toBe(0);
        expect(tripKind(legs, null)).toBe('roundTrip');
    });

    it('splits legacy rows with no segment_index on a long gap', () => {
        const legacy = [...outbound, ...inbound].map(s => ({ ...s, segment_index: undefined, itinerary_index: 0 }));
        expect(receiptLegs(legacy)).toHaveLength(2);
    });

    it('trusts a stored trip_type over the shape of the legs', () => {
        expect(tripKind(receiptLegs(outbound), 'one-way')).toBe('oneWay');
        expect(tripKind(receiptLegs(outbound), 'round_trip')).toBe('roundTrip');
    });
});

describe('passengers and status', () => {
    it('counts passenger types from the ADT/CHD/INF enum', () => {
        expect(countPassengers([{ type: 'ADT' }, { type: 'ADT' }, { type: 'CHD' }, { type: 'INF' }]))
            .toEqual({ adult: 2, child: 1, infant: 1 });
    });

    it('never calls money that went back PAID', () => {
        expect(receiptStatus('ticketed')).toBe('paid');
        expect(receiptStatus('confirmed')).toBe('paid');
        expect(receiptStatus('cancel_requested')).toBe('paid');
        expect(receiptStatus('refund_pending')).toBe('refundPending');
        expect(receiptStatus('refunded')).toBe('refunded');
        expect(receiptStatus('cancelled')).toBe('cancelled');
        expect(receiptStatus('failed')).toBeNull();
    });
});
