import { describe, it, expect } from 'vitest';
import {
    groupSegmentsIntoLegs,
    layoverMinutes,
    refundabilityOf,
    LONG_LAYOVER_MINUTES,
} from '@/utils/flight-utils';
import type { FlightSegmentDetail } from '@/types/flights';

/** Build a segment with only the fields the leg grouping reads. */
function seg(p: {
    sliceIndex?: number;
    segmentIndex?: number;
    from: string; to: string;
    dep: string; arr: string;
    duration: number;
}): FlightSegmentDetail {
    return {
        segmentIndex: p.segmentIndex ?? 0,
        sliceIndex: p.sliceIndex,
        airline: { code: 'XX', name: 'Test Air' },
        origin: p.from,
        destination: p.to,
        flightNumber: 'XX123',
        departure: { airport: p.from, time: p.dep },
        arrival: { airport: p.to, time: p.arr },
        duration: p.duration,
        stops: 0,
        cabinClass: 'economy',
    } as FlightSegmentDetail;
}

// The real CRK→KUL round trip pulled from production: the offer that rendered as
// "CRK → CRK, 35h 35m, 2 stops" before this grouping existed.
const CRK_KUL_ROUND_TRIP: FlightSegmentDetail[] = [
    seg({ sliceIndex: 0, segmentIndex: 0, from: 'CRK', to: 'HKG', dep: '2026-09-10T10:45:00', arr: '2026-09-10T12:55:00', duration: 130 }),
    seg({ sliceIndex: 0, segmentIndex: 1, from: 'HKG', to: 'KUL', dep: '2026-09-10T16:55:00', arr: '2026-09-10T20:55:00', duration: 240 }),
    seg({ sliceIndex: 1, segmentIndex: 2, from: 'KUL', to: 'HKG', dep: '2026-09-13T08:10:00', arr: '2026-09-13T12:20:00', duration: 250 }),
    seg({ sliceIndex: 1, segmentIndex: 3, from: 'HKG', to: 'CRK', dep: '2026-09-14T07:35:00', arr: '2026-09-14T09:35:00', duration: 120 }),
];

describe('groupSegmentsIntoLegs', () => {
    it('splits a round trip into two legs instead of one CRK→CRK journey', () => {
        const legs = groupSegmentsIntoLegs(CRK_KUL_ROUND_TRIP);
        expect(legs).toHaveLength(2);
        expect(legs[0]).toMatchObject({ origin: 'CRK', destination: 'KUL', stops: 1 });
        expect(legs[1]).toMatchObject({ origin: 'KUL', destination: 'CRK', stops: 1 });
    });

    it('reports each leg its own duration, matching Duffel\'s slice durations', () => {
        const legs = groupSegmentsIntoLegs(CRK_KUL_ROUND_TRIP);
        // Duffel said PT10H10M and P1DT1H25M for these two slices.
        expect(legs[0].durationMinutes).toBe(610);   // 10h10m
        expect(legs[1].durationMinutes).toBe(1525);  // 25h25m
        // NOT the 2135-minute sum the card used to print as one journey time.
        expect(legs[0].durationMinutes + legs[1].durationMinutes).toBe(2135);
    });

    it('counts stops per leg, not summed across the trip', () => {
        const legs = groupSegmentsIntoLegs(CRK_KUL_ROUND_TRIP);
        expect(legs.map(l => l.stops)).toEqual([1, 1]); // card previously said "2 stops"
    });

    it('flags the overnight connection on the return only', () => {
        const legs = groupSegmentsIntoLegs(CRK_KUL_ROUND_TRIP);
        expect(legs[0].hasOvernightLayover).toBe(false);
        expect(legs[1].hasOvernightLayover).toBe(true);
        expect(legs[1].longestLayoverMinutes).toBe(1155); // 19h15m in HKG
        expect(legs[1].longestLayoverMinutes).toBeGreaterThanOrEqual(LONG_LAYOVER_MINUTES);
    });

    it('handles a one-way single-segment offer as one leg with no stops', () => {
        const legs = groupSegmentsIntoLegs([
            seg({ sliceIndex: 0, from: 'GMP', to: 'CJU', dep: '2026-08-19T09:00:00', arr: '2026-08-19T10:10:00', duration: 70 }),
        ]);
        expect(legs).toHaveLength(1);
        expect(legs[0]).toMatchObject({ stops: 0, durationMinutes: 70, hasOvernightLayover: false });
    });

    it('derives legs from route continuity when sliceIndex is absent', () => {
        // Exactly the shape production returned before this fix: segmentIndex is
        // the flat position 0,1,2,3 and there is no sliceIndex. Grouping on it
        // naively would yield four one-segment legs.
        const preFix = CRK_KUL_ROUND_TRIP.map((s, i) => {
            const copy: any = { ...s, segmentIndex: i };
            delete copy.sliceIndex;
            return copy as FlightSegmentDetail;
        });
        const legs = groupSegmentsIntoLegs(preFix);
        expect(legs).toHaveLength(2);
        expect(legs[0]).toMatchObject({ origin: 'CRK', destination: 'KUL', stops: 1, durationMinutes: 610 });
        expect(legs[1]).toMatchObject({ origin: 'KUL', destination: 'CRK', stops: 1, durationMinutes: 1525 });
    });

    it('derives three legs for a multi-city trip with no sliceIndex', () => {
        const legs = groupSegmentsIntoLegs([
            seg({ segmentIndex: 0, from: 'MNL', to: 'SIN', dep: '2026-09-01T08:00:00', arr: '2026-09-01T11:30:00', duration: 210 }),
            seg({ segmentIndex: 1, from: 'BKK', to: 'HKG', dep: '2026-09-05T09:00:00', arr: '2026-09-05T12:45:00', duration: 165 }),
            seg({ segmentIndex: 2, from: 'HKG', to: 'MNL', dep: '2026-09-05T15:00:00', arr: '2026-09-05T17:00:00', duration: 120 }),
        ]);
        expect(legs).toHaveLength(2);
        expect(legs[0]).toMatchObject({ origin: 'MNL', destination: 'SIN', stops: 0 });
        expect(legs[1]).toMatchObject({ origin: 'BKK', destination: 'MNL', stops: 1 });
    });

    it('returns no legs for an empty segment list', () => {
        expect(groupSegmentsIntoLegs([])).toEqual([]);
    });

    it('orders legs by slice index regardless of input order', () => {
        const legs = groupSegmentsIntoLegs([...CRK_KUL_ROUND_TRIP].reverse());
        expect(legs[0].sliceIndex).toBe(0);
        expect(legs[0].origin).toBe('CRK');
    });
});

describe('layoverMinutes', () => {
    it('measures the wait between landing and the next departure', () => {
        expect(layoverMinutes('2026-09-10T12:55:00', '2026-09-10T16:55:00')).toBe(240);
    });

    it('spans a date boundary', () => {
        expect(layoverMinutes('2026-09-13T12:20:00', '2026-09-14T07:35:00')).toBe(1155);
    });

    it('never returns negative for out-of-order or unparseable input', () => {
        expect(layoverMinutes('2026-09-10T16:55:00', '2026-09-10T12:55:00')).toBe(0);
        expect(layoverMinutes('nonsense', '2026-09-10T12:55:00')).toBe(0);
    });
});

describe('refundabilityOf', () => {
    it('is free when the penalty is zero', () => {
        expect(refundabilityOf({ isRefundable: true, refundPenaltyAmount: 0 }, false, 499)).toBe('free');
    });

    it('is a fee when the penalty is below the fare', () => {
        expect(refundabilityOf({ isRefundable: true, refundPenaltyAmount: 120 }, false, 499)).toBe('fee');
    });

    it('is NOT refundable when the penalty meets or exceeds the fare', () => {
        // The reported case: a $499 ticket advertising "Refundable (est. fee: $500)".
        expect(refundabilityOf({ isRefundable: true, refundPenaltyAmount: 500 }, false, 499)).toBe('none');
        expect(refundabilityOf({ isRefundable: true, refundPenaltyAmount: 499 }, false, 499)).toBe('none');
    });

    it('keeps "fee" when the penalty is unknown rather than overpromising free', () => {
        expect(refundabilityOf({ isRefundable: true, refundPenaltyAmount: null }, false, 499)).toBe('fee');
        expect(refundabilityOf({ isRefundable: true }, false, 499)).toBe('fee');
    });

    it('is none when the fare is not refundable at all', () => {
        expect(refundabilityOf({ isRefundable: false, refundPenaltyAmount: 0 }, true, 499)).toBe('none');
    });

    it('falls back to the legacy boolean when no fare policy is present', () => {
        expect(refundabilityOf(undefined, true, 499)).toBe('fee');
        expect(refundabilityOf(undefined, false, 499)).toBe('none');
    });

    it('does not classify as non-refundable when the fare total is unknown', () => {
        // A zero/unknown total must not turn every refundable fare into "none".
        expect(refundabilityOf({ isRefundable: true, refundPenaltyAmount: 500 }, false, 0)).toBe('fee');
    });
});
