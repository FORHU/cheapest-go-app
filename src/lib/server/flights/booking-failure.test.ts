import { describe, it, expect } from 'vitest';
import { failureReasonOf, payFirstFailureEntry, NOT_COMPLETED_ERROR_CODE, failedBookingResponse } from './booking-failure';

describe('booking failure reason', () => {
    it('round-trips through the cancellation_log shape', () => {
        const log = payFirstFailureEntry('price_changed', new Date('2026-10-28T10:00:00Z'));
        expect(log).toEqual([{ at: '2026-10-28T10:00:00.000Z', oldStatus: 'initiated', newStatus: 'failed', supplierResponse: { reason: 'price_changed' } }]);
        expect(failureReasonOf({ cancellation_log: log })).toBe('price_changed');
    });

    it('is null for a legacy failed row with no log', () => {
        expect(failureReasonOf({ cancellation_log: null })).toBeNull();
        expect(failureReasonOf({ cancellation_log: [] })).toBeNull();
        expect(failureReasonOf(null)).toBeNull();
        expect(failureReasonOf({ cancellation_log: [{ newStatus: 'failed' }] })).toBeNull();
    });

    it('exposes a stable client-facing code', () => {
        expect(NOT_COMPLETED_ERROR_CODE).toBe('booking_not_completed');
    });
});

describe('failedBookingResponse', () => {
    function fakeDb(result: { data: unknown }) {
        const calls: Array<[string, ...unknown[]]> = [];
        const builder: any = {
            select: (cols: string) => { calls.push(['select', cols]); return builder; },
            eq: (col: string, val: unknown) => { calls.push(['eq', col, val]); return builder; },
            maybeSingle: async () => result,
        };
        return { db: { from: (table: string) => { calls.push(['from', table]); return builder; } }, calls };
    }

    it('reports "not charged" with the reason for a pay-first failure', async () => {
        const { db, calls } = fakeDb({
            data: { cancellation_log: payFirstFailureEntry('flight_unavailable', new Date('2026-10-28T10:00:00Z')) },
        });
        const res = await failedBookingResponse(db, 'sess-1');
        expect(res).toEqual({
            success: false,
            errorCode: 'booking_not_completed',
            reason: 'flight_unavailable',
            error: 'We could not complete your booking. Your card was not charged.',
        });
        expect(calls).toContainEqual(['from', 'flight_bookings']);
        expect(calls).toContainEqual(['eq', 'session_id', 'sess-1']);
    });

    it('falls back to the refunded response when there is no row', async () => {
        const { db } = fakeDb({ data: null });
        const res = await failedBookingResponse(db, 'sess-2');
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('booking_failed_refunded');
        expect(res).not.toHaveProperty('reason');
    });

    it('falls back to the refunded response for an empty log', async () => {
        const { db } = fakeDb({ data: { cancellation_log: [] } });
        const res = await failedBookingResponse(db, 'sess-3');
        expect(res.errorCode).toBe('booking_failed_refunded');
    });
});
